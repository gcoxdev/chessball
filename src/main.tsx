import { StrictMode, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BookOpen, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Flag, Goal, Menu, Play, RadioTower, RotateCcw, Settings, Shield, StepForward, X, Zap } from 'lucide-react';
import {
  activeRoleCode,
  activeRoleDescription,
  isGoalToGo,
  applyAction,
  createGame,
  DRIVES_PER_TEAM_PER_QUARTER,
  fieldGoalAttempt,
  fieldZone,
  generateLegalActions,
  isTouchdownSquare,
  moveDistanceToFirstDown,
  defensiveFormations,
  offensiveFormations,
  QUARTERS_PER_MATCH,
  startNextDown,
} from './engine/rules';
import type { Action, CoinFace, Coord, DiceRoll, Formation, FormationSide, GameState, Piece, Team } from './engine/types';
import { AccessibleBoard } from './ui/AccessibleBoard';
import { Modal } from './ui/Modal';
import { GameMenu } from './ui/GameMenu';
import { SettingsDialog } from './ui/SettingsDialog';
import { loadPieceStyle, savePieceStyle, loadMatchLength, saveMatchLength, type MatchLength } from './ui/settings';
import { oddsText } from './ui/action-odds';
import type { PieceStyle } from './ui/PieceToken';
import { chooseComputerAction, type PlayerControl, type PlayerKind } from './engine/computer';
export { chooseComputerAction } from './engine/computer';
import './styles.css';

type TargetMode = 'move' | 'pass' | null;
type HistoryEntry = {
  id: number;
  game: GameState;
  label: string;
};
type EventEntry = {
  id: number;
  text: string;
};
type MatchProgress = {
  completed: number;
  total: number;
  remaining: number;
};

export const COMPUTER_ACTION_DELAY_MS = 120;

export function App({ initialGame, initialPlayers }: { initialGame?: GameState; initialPlayers?: PlayerControl } = {}) {
  const [matchLength, setMatchLength] = useState<MatchLength>(loadMatchLength);
  const changeMatchLength = (length: MatchLength) => {
    setMatchLength(length);
    saveMatchLength(length);
  };
  const initialEntry = useMemo<HistoryEntry>(() => ({
    id: 0,
    game: initialGame ?? createPregameGame(loadMatchLength()),
    label: initialGame ? 'Initial setup.' : 'Pregame: choose player types, then press Start Game.',
  }), [initialGame]);
  const [history, setHistory] = useState<HistoryEntry[]>(() => [initialEntry]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [events, setEvents] = useState<EventEntry[]>(() => [{ id: 0, text: initialEntry.label }]);
  const [players, setPlayers] = useState<PlayerControl>(initialPlayers ?? { home: 'human', away: 'computer' });
  const [autoPaused, setAutoPaused] = useState(false);
  const [computerMatchStarted, setComputerMatchStarted] = useState(false);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [targetMode, setTargetMode] = useState<TargetMode>(null);
  const [message, setMessage] = useState(initialGame ? 'Choose formations, shift up to two pieces per side, then snap.' : 'Choose player types, then press Start Game.');
  const [showRules, setShowRules] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const [largeBoard, setLargeBoard] = useState(false);
  const boardScrollerRef = useRef<HTMLDivElement>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [pieceStyle, setPieceStyle] = useState<PieceStyle>(loadPieceStyle);
  const changePieceStyle = (style: PieceStyle) => {
    setPieceStyle(style);
    savePieceStyle(style);
  };
  const [showCoinToss, setShowCoinToss] = useState(false);
  const [showNewGameConfirmation, setShowNewGameConfirmation] = useState(false);
  const eventId = useRef(1);
  const workspaceHeadingRef = useRef<HTMLHeadingElement>(null);
  const cancelNewGameRef = useRef<HTMLButtonElement>(null);
  const game = history[historyIndex]?.game ?? initialEntry.game;
  const isViewingHistory = historyIndex !== history.length - 1;
  const bothComputers = players.home === 'computer' && players.away === 'computer';
  const playerSelectionLocked = game.phase !== 'pregame' && game.phase !== 'final';
  const controlTeam = game.phase === 'betweenDowns' ? game.possession : game.turn;
  const legalActions = useMemo(() => generateLegalActions(game), [game]);
  const canSnap = legalActions.some((action) => action.type === 'snap');
  const progress = matchProgress(game);
  const selectedPiece = selectedPieceId ? game.pieces.find((piece) => piece.id === selectedPieceId) : undefined;
  const boardGame = useMemo(() => boardDisplayGame(game), [game]);
  const showBallMarker = !hideStoppedChangeOfPossessionBall(game);
  const formationsConfirmed = game.formationConfirmed.offense && game.formationConfirmed.defense;
  const showFormationPanel = game.phase === 'formation' && !formationsConfirmed;
  const showCommandPanel = game.phase === 'kickoff' || game.phase === 'kickPlacement' || game.phase === 'kickReturn' || game.phase === 'betweenDowns' || game.phase === 'live' || (game.phase === 'formation' && formationsConfirmed);
  const formationSideTeam = (side: FormationSide): Team => side === 'offense' ? game.possession : otherTeamForUi(game.possession);
  const canChooseFormationSide = (side: FormationSide): boolean =>
    !isViewingHistory && game.phase === 'formation' && players[formationSideTeam(side)] === 'human';
  const ballCarrier = useMemo(() => {
    const ball = game.ball;
    return ball.kind === 'controlled' ? game.pieces.find((piece) => piece.id === ball.pieceId) : undefined;
  }, [game]);
  const selectedBallCarrier = selectedPiece && ballCarrier && selectedPiece.id === ballCarrier.id ? selectedPiece : undefined;
  const lastRoll = useMemo(() => lastDiceRoll(game), [game]);
  const historyAnnouncement = isViewingHistory
    ? `Viewing history. Read-only. History position ${historyIndex + 1} of ${history.length}.`
    : 'Latest position.';
  const latestEventText = events[0]?.text;
  const announcementLead = isViewingHistory
    ? history[historyIndex]?.label
    : message !== latestEventText ? message : undefined;
  const announcement = [
    announcementLead,
    `${phaseLabel(game.phase)}.`,
    `${capitalize(game.turn)} to act.`,
    `Home ${game.score.home}, Away ${game.score.away}.`,
    historyAnnouncement,
  ].filter(Boolean).join(' ');

  useEffect(() => {
    const scroller = boardScrollerRef.current;
    if (!scroller) return;
    if (!largeBoard) {
      scroller.scrollLeft = 0;
      return;
    }
    const target = scroller.querySelector<HTMLElement>('.is-selected') ?? scroller.querySelector<HTMLElement>('.ball-square');
    if (target) {
      const cell = target.getBoundingClientRect();
      const viewport = scroller.getBoundingClientRect();
      scroller.scrollLeft += cell.left - viewport.left + cell.width / 2 - scroller.clientWidth / 2;
    }
  }, [largeBoard]);

  const pushEvent = (text: string) => {
    const entry = { id: eventId.current, text };
    eventId.current += 1;
    setEvents((current) => [entry, ...current].slice(0, 80));
  };

  const commitGame = (next: GameState, label: string) => {
    setHistory((current) => {
      const base = current.slice(0, historyIndex + 1);
      return [...base, { id: base.length, game: next, label }];
    });
    setHistoryIndex(historyIndex + 1);
    pushEvent(label);
  };

  const runAction = (action: Action, source: PlayerKind = 'human') => {
    if (isViewingHistory) {
      pushEvent('History view is read-only. Return to latest to continue play.');
      setMessage('Return to latest to continue play.');
      return;
    }

    try {
      const resolvedAction = withDice(action);
      const next = applyAction(game, resolvedAction);
      const label = describeAction(game, resolvedAction, next);
      const eventText = source === 'computer' ? `Computer ${game.turn}: ${label}` : label;
      commitGame(next, eventText);
      setMessage(next.play.result ? resultText(next) : eventText);
      if (resolvedAction.type === 'chooseKickoffChoice') {
        setShowCoinToss(false);
      }
      if (resolvedAction.type === 'snap') {
        setSelectedPieceId(null);
        setTargetMode(null);
      }
      if (actionClearsSelection(resolvedAction)) {
        setSelectedPieceId(null);
        setTargetMode(null);
      }
      if (next.turn !== game.turn) {
        setSelectedPieceId(null);
        setTargetMode(null);
      } else if (next.phase !== 'live') {
        setTargetMode(null);
      }
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Illegal action';
      pushEvent(`Illegal action: ${errorText}`);
      setMessage(errorText);
    }
  };

  const onSquareClick = (coord: Coord) => {
    if (isViewingHistory || players[controlTeam] === 'computer') return;
    const piece = pieceAt(game, coord);

    if (game.phase === 'kickPlacement') {
      runAction({ type: 'placeKick', at: coord });
      return;
    }

    if (targetMode === 'pass' && selectedBallCarrier?.team === game.turn) {
      const pass = piece && legalActions.find((action): action is Extract<Action, { type: 'pass' }> =>
        action.type === 'pass' &&
        action.passerId === selectedBallCarrier.id &&
        action.receiverId === piece.id,
      );
      if (pass) {
        runAction(pass);
        setTargetMode(null);
      } else {
        setMessage('Choose an eligible receiver.');
      }
      return;
    }

    if (piece && selectedPiece) {
      const tackle = legalActions.find((action): action is Extract<Action, { type: 'tackle' }> =>
        action.type === 'tackle' &&
        action.defenderId === selectedPiece.id &&
        action.targetId === piece.id,
      );
      if (tackle) {
        runAction(tackle);
        return;
      }
    }

    if (piece) {
      if (piece.id === selectedPieceId) {
        setSelectedPieceId(null);
        setTargetMode(null);
        setMessage('Selection cleared.');
        return;
      }

      setSelectedPieceId(piece.id);
      setTargetMode('move');
      setMessage(`${activeRoleCode(game, piece)} selected.`);
      return;
    }

    const isLegalMoveTarget = selectedPiece && legalActions.some((action) =>
      (action.type === 'move' || action.type === 'shift') &&
      action.pieceId === selectedPiece.id &&
      sameCoord(action.to, coord),
    );

    const powerMove = selectedPiece && legalActions.find((action): action is Extract<Action, { type: 'powerMove' }> =>
      action.type === 'powerMove' &&
      action.pieceId === selectedPiece.id &&
      sameCoord(action.to, coord),
    );

    if (selectedPiece && targetMode === 'move' && powerMove) {
      runAction(powerMove);
      setTargetMode(null);
      return;
    }

    if (selectedPiece && targetMode === 'move' && isLegalMoveTarget) {
      runAction({ type: game.phase === 'formation' ? 'shift' : 'move', pieceId: selectedPiece.id, to: coord });
      setTargetMode(null);
      return;
    }

    if (selectedPiece) setMessage('Choose a highlighted square or another piece.');
  };

  const snap = () => runAction({ type: 'snap' });
  const confirmFormation = (side: FormationSide) => {
    runAction({ type: 'confirmFormation', side });
    setSelectedPieceId(null);
    setTargetMode(null);
    setMessage(`${side === 'offense' ? 'Offense' : 'Defense'} formation confirmed.`);
  };
  const flipCoin = () => runAction({ type: 'coinToss' });
  const chooseKickoffChoice = (choice: 'kick' | 'receive') => {
    if (!game.coinToss.winner) return;
    runAction({ type: 'chooseKickoffChoice', team: game.coinToss.winner, choice });
  };
  const kickoff = () => {
    runAction({ type: 'kick', kickerId: `${game.turn}-qb`, kind: 'kickoff' });
  };
  const fieldGoal = () => {
    if (!ballCarrier) return;
    runAction({ type: 'kick', kickerId: ballCarrier.id, kind: 'fieldGoal' });
  };
  const punt = () => {
    if (!ballCarrier) return;
    runAction({ type: 'kick', kickerId: ballCarrier.id, kind: 'punt' });
  };
  const extraPoint = () => {
    const team = game.play.result?.type === 'touchdown' ? game.play.result.team : game.possession;
    runAction({ type: 'kick', kickerId: `${team}-qb`, kind: 'extraPoint' });
  };
  const twoPointTry = () => {
    const team = game.play.result?.type === 'touchdown' ? game.play.result.team : game.possession;
    runAction({ type: 'startTwoPointTry', team });
  };
  const startPass = () => {
    if (!selectedBallCarrier) return;
    setTargetMode('pass');
    setMessage(`Choose a receiver for ${activeRoleCode(game, selectedBallCarrier)}.`);
  };
  const chooseFormation = (side: FormationSide, formation: Formation) => {
    runAction({ type: 'chooseFormation', side, formationId: formation.id });
    setSelectedPieceId(null);
    setTargetMode(null);
    setMessage(`${side === 'offense' ? 'Offense' : 'Defense'} formation: ${formation.name}.`);
  };
  const nextDown = () => {
    if (isViewingHistory) {
      setMessage('Return to latest to continue play.');
      return;
    }

    try {
      const next = startNextDown(game);
      const label = `Next down: ${next.possession} lines up for ${ordinalDown(next.down)} down.`;
      commitGame(next, label);
      setMessage(label);
      setSelectedPieceId(null);
      setTargetMode(null);
    } catch (error) {
      const errorText = error instanceof Error ? error.message : 'Could not start next down';
      pushEvent(`Illegal action: ${errorText}`);
      setMessage(errorText);
    }
  };

  const reset = () => {
    if (isViewingHistory) return;
    const pregame = createPregameGame(matchLength);
    const label = 'Pregame: choose player types, then press Start Game.';
    setHistory([{ id: 0, game: pregame, label }]);
    setHistoryIndex(0);
    setEvents([{ id: 0, text: label }]);
    eventId.current = 1;
    setPlayers({ home: 'human', away: 'computer' });
    setAutoPaused(false);
    setComputerMatchStarted(false);
    setSelectedPieceId(null);
    setTargetMode(null);
    setShowCoinToss(false);
    setShowRules(false);
    setShowNewGameConfirmation(false);
    setShowMenu(true);
    setMessage('Choose player types, then press Start Game.');
  };

  const startGame = () => {
    if (isViewingHistory) return;
    if (game.phase !== 'pregame' && game.phase !== 'final') return;
    setShowMenu(false);
    const opening = createOpeningGame(matchLength);
    const automaticCoinToss = bothComputers ? applyAction(opening, withDice({ type: 'coinToss' })) : opening;
    const next = automaticCoinToss.coinToss.winner
      ? applyAction(automaticCoinToss, { type: 'chooseKickoffChoice', team: automaticCoinToss.coinToss.winner, choice: 'receive' })
      : automaticCoinToss;
    const label = bothComputers
      ? `Coin toss: ${capitalize(next.coinToss.winner ?? next.turn)} won automatically and chose to receive.`
      : 'Coin toss: flip the coin to start.';
    setHistory([{ id: 0, game: next, label }]);
    setHistoryIndex(0);
    setEvents([{ id: 0, text: label }]);
    eventId.current = 1;
    setAutoPaused(false);
    setComputerMatchStarted(false);
    setSelectedPieceId(null);
    setTargetMode(null);
    setShowCoinToss(!bothComputers);
    setMessage(bothComputers ? 'New computer match. Coin toss resolved automatically.' : 'New Chessball match. Flip the coin to start.');
  };

  const setPlayerKind = (team: Team, kind: PlayerKind) => {
    if (isViewingHistory || playerSelectionLocked) return;
    setPlayers((current) => ({ ...current, [team]: kind }));
    pushEvent(`${capitalize(team)} is now ${kind}.`);
  };

  const startComputerMatch = () => {
    if (isViewingHistory) return;
    setShowMenu(false);
    setComputerMatchStarted(true);
    setAutoPaused(false);
    pushEvent('Computer match started.');
    setMessage('Computer match started.');
  };

  const openNewGameConfirmation = () => {
    if (isViewingHistory) return;
    setShowNewGameConfirmation(true);
  };

  useEffect(() => {
    if (game.phase === 'final') return;
    if (bothComputers && !computerMatchStarted) return;
    if (autoPaused || isViewingHistory || showNewGameConfirmation || showSettings || showMenu) return;
    if (game.phase !== 'formation' && players[controlTeam] !== 'computer') return;

    const timer = window.setTimeout(() => {
      if (game.phase === 'betweenDowns' && game.play.result?.type !== 'touchdown') {
        nextDown();
        return;
      }

      const action = chooseComputerAction(game, legalActions, history.length, players);
      if (action) runAction(action, 'computer');
    }, COMPUTER_ACTION_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autoPaused, bothComputers, computerMatchStarted, controlTeam, game, history.length, isViewingHistory, legalActions, players, showNewGameConfirmation, showSettings, showMenu]);

  return (
    <div id="chessball-app">
      <a className="skip-link" href="#game-workspace" onClick={() => workspaceHeadingRef.current?.focus()}>Skip to game workspace</a>
      <main className="app-shell">
      <p className="visually-hidden" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>
      <header className="app-header">
        <h1 id="game-workspace" ref={workspaceHeadingRef} tabIndex={-1} className="chessball-wordmark">Chessball</h1>
        <button ref={menuButtonRef} className="menu-trigger" type="button" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={showMenu} onClick={() => setShowMenu(true)}><Menu size={24} /></button>
        <section className="score-strip" aria-label="Game status">
        <ScoreCard label="Home" score={game.score.home} active={game.possession === 'home'} />
        <ScoreCard label="Away" score={game.score.away} active={game.possession === 'away'} />
        <div className="down-card">
          <span>Down</span>
          <strong className={downStatusClass(game)}>{downDistanceLabel(game)}</strong>
        </div>
        <div className="down-card">
          <span>Quarter</span>
          <strong>Q{game.quarter}</strong>
        </div>
        <div className="down-card progress-card">
          <span>Game Progress</span>
          <strong>Drive {progress.completed} of {progress.total}</strong>
          <small>{progress.remaining} drives left</small>
          <small>Q{game.quarter}: Home {game.drivesThisQuarter.home}/{game.drivesPerTeamPerQuarter}, Away {game.drivesThisQuarter.away}/{game.drivesPerTeamPerQuarter}</small>
        </div>
        <div className="down-card phase-card">
          <span>Phase</span>
          <strong>{phaseLabel(game.phase)}</strong>
        </div>
        </section>
      </header>

      <section className="workspace">
        <section
          className="field-wrap"
          aria-label="Chessball field"
        >
          <div className="field-toolbar">
            <DicePanel roll={lastRoll} />
            {game.phase === 'pregame' && (
              <button className="start-game-button" type="button" disabled={isViewingHistory} onClick={startGame}>
                <Play size={18} /> Start Game
              </button>
            )}
            <div className="field-meta">
              {showsScrimmageMarkers(game) && (
                <>
                  <span className="marker-label scrimmage-label">Line of scrimmage {markerYardLabel(game, game.lineOfScrimmage)}</span>
                  <span className="marker-label gain-label">{isGoalToGo(game) ? 'Goal to go' : `Line to gain ${markerYardLabel(game, game.firstDownLine)}`}</span>
                </>
              )}
              <span>{isViewingHistory ? `Viewing history ${historyIndex + 1}/${history.length}` : `${game.turn.toUpperCase()} to act`}</span>
            </div>
          </div>
          <p className="visually-hidden" id="field-size-help">{largeBoard ? 'Swipe or scroll across the field.' : 'The whole field fits the screen. Change field size in Settings.'}</p>
          <div className={`board-scroller${largeBoard ? ' is-enlarged' : ''}`} ref={boardScrollerRef}>
            <AccessibleBoard
              game={game}
              pieceStyle={pieceStyle}
              displayGame={boardGame}
              legalActions={legalActions}
              selectedPiece={selectedPiece}
              selectedBallCarrier={selectedBallCarrier}
              targetMode={targetMode}
              ballCoord={ballCoord(game)}
              showBallMarker={showBallMarker}
              readOnly={isViewingHistory}
              describedBy={isViewingHistory ? 'history-read-only field-size-help' : 'field-size-help'}
              onSquareClick={onSquareClick}
              squareClass={(coord, piece, legal, power, ball) => squareClass(game, coord, piece, legal, power, ball)}
              renderYardTicks={(coord) => yardTicks(game, coord)}
              renderYardMarker={(coord) => yardMarker(game, coord)}
              ballLabel={ballLabel(boardGame)}
            />
          </div>

        </section>
        <aside className="control-rail" aria-label="Game controls">
          {showFormationPanel && (
            <div className="panel formation-panel">
              <h2>Formations</h2>
              <FormationPicker
                title="Offense"
                formations={offensiveFormations}
                activeId={game.formation.offense.id}
                confirmed={game.formationConfirmed.offense}
                disabled={!canChooseFormationSide('offense') || game.formationConfirmed.offense}
                onChoose={(formation) => chooseFormation('offense', formation)}
                onConfirm={() => confirmFormation('offense')}
              />
              <FormationPicker
                title="Defense"
                formations={defensiveFormations}
                activeId={game.formation.defense.id}
                confirmed={game.formationConfirmed.defense}
                disabled={!canChooseFormationSide('defense') || game.formationConfirmed.defense}
                onChoose={(formation) => chooseFormation('defense', formation)}
                onConfirm={() => confirmFormation('defense')}
              />
              <SelectionSummary selectedPiece={selectedPiece} game={boardGame} />
            </div>
          )}

          {showCommandPanel && (
            <div className="panel command-panel">
              <h2>Command</h2>
              <div className="button-grid">
                <button type="button" onClick={snap} disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'formation' || !canSnap}>
                  <StepForward size={17} /> Snap
                </button>
                <button type="button" onClick={kickoff} disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'kickoff'}>
                  <Goal size={17} /> Kickoff
                </button>
                <button
                  type="button"
                  onClick={startPass}
                  disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'live' || selectedBallCarrier?.team !== game.turn}
                >
                  <RadioTower size={17} /> Pass
                </button>
                {game.phase === 'betweenDowns' && game.play.result?.type === 'touchdown' ? (
                  <>
                    <button type="button" onClick={extraPoint} disabled={isViewingHistory || players[controlTeam] === 'computer'}>
                      <Goal size={17} /> Extra Point
                    </button>
                    <button type="button" onClick={twoPointTry} disabled={isViewingHistory || players[controlTeam] === 'computer'}>
                      <Flag size={17} /> Two-Point Try
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={fieldGoal} disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'live' || Boolean(game.conversion) || ballCarrier?.team !== game.turn}>
                    <Goal size={17} /> Field Goal
                  </button>
                )}
                <button type="button" onClick={punt} disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'live' || Boolean(game.conversion) || ballCarrier?.team !== game.turn}>
                  <Flag size={17} /> Punt
                </button>
                <button type="button" onClick={nextDown} disabled={isViewingHistory || players[controlTeam] === 'computer' || game.phase !== 'betweenDowns' || game.play.result?.type === 'touchdown'}>
                  <Flag size={17} /> Next
                </button>
              </div>
              {game.phase === 'betweenDowns' && game.play.result?.type === 'touchdown' && (
                <p className="hint">Extra point: {oddsText(game, { type: 'kick', kind: 'extraPoint', kickerId: `${game.possession}-qb` })}</p>
              )}
              {game.phase === 'live' && !game.conversion && ballCarrier?.team === game.turn && (
                <p className="hint">Field goal: {oddsText(game, { type: 'kick', kind: 'fieldGoal', kickerId: ballCarrier.id })}</p>
              )}
              <SelectionSummary selectedPiece={selectedPiece} game={boardGame} />
              <div className="action-list">
                {legalActions
                  .filter((action) => selectedPiece && actionForPiece(action, selectedPiece.id))
                  .filter((action) => targetMode !== 'pass' || action.type === 'pass')
                  .filter((action) => action.type !== 'move' && action.type !== 'shift' && action.type !== 'tackle' && (action.type !== 'pass' || targetMode === 'pass'))
                  .map((action, index) => (
                    <button key={`${action.type}-${index}`} type="button" disabled={isViewingHistory} onClick={() => runAction(action)}>
                      <Zap size={15} /> {actionLabel(game, action)}
                      <ActionOddsLabel game={game} action={action} />
                    </button>
                  ))}
                {selectedPiece && (game.phase === 'live' || game.phase === 'kickReturn') && tackleActions(game, selectedPiece, legalActions).map((action) => (
                  <button key={`${action.defenderId}-${action.targetId}`} type="button" disabled={isViewingHistory} onClick={() => runAction(action)}>
                    <Shield size={15} /> {tackleLabel(game, action)}
                    <ActionOddsLabel game={game} action={action} />
                  </button>
                ))}
              </div>
              <p className="hint">{game.phase === 'kickPlacement' ? 'Choose a landing row on the exact rolled-distance column.' : 'Passes, tackles, and kicks roll 2d6. Longer distance means a higher target number.'}</p>
            </div>
          )}

          {isViewingHistory && (
            <div className="history-notice">
              <p className="history-read-only" id="history-read-only">Viewing history — Read-only</p>
              <button type="button" onClick={() => setHistoryIndex(history.length - 1)}>Return to latest</button>
            </div>
          )}
          <p className="game-message">{game.phase === 'pregame' ? 'Press Start Game to play. Choose players and match options in the menu.' : message}</p>

        </aside>
      </section>
      {showMenu && (
        <GameMenu fallbackFocus={menuButtonRef} onClose={() => setShowMenu(false)}>
          <section className="utility-bar" aria-label="Game setup">
            <div className="utility-control-row">
              <div className="utility-actions">
                {game.phase !== 'pregame' && (
                  <button type="button" disabled={isViewingHistory} onClick={openNewGameConfirmation}>
                    <RotateCcw size={17} /> New Game
                  </button>
                )}
                <button type="button" onClick={() => setShowRules(true)}>
                  <BookOpen size={17} /> Rules
                </button>
                <button type="button" onClick={() => setShowSettings(true)}>
                  <Settings size={17} /> Settings
                </button>
                {bothComputers && !computerMatchStarted && (
                  <button type="button" disabled={isViewingHistory} onClick={startComputerMatch}>
                    <Play size={17} /> Play Auto
                  </button>
                )}
                {bothComputers && computerMatchStarted && game.phase !== 'final' && (
                  <button
                    className={autoPaused ? 'warning-button' : ''}
                    type="button"
                    disabled={isViewingHistory}
                    onClick={() => {
                      if (isViewingHistory) return;
                      setAutoPaused((paused) => !paused);
                      pushEvent(autoPaused ? 'Computer loop resumed.' : 'Computer loop paused.');
                      setShowMenu(false);
                    }}
                  >
                    {autoPaused ? 'Resume Auto' : 'Pause Auto'}
                  </button>
                )}
              </div>
              <div className="utility-players">
                <PlayerToggle team="home" players={players} disabled={isViewingHistory || playerSelectionLocked} onChange={setPlayerKind} />
                <PlayerToggle team="away" players={players} disabled={isViewingHistory || playerSelectionLocked} onChange={setPlayerKind} />
              </div>
            </div>
          </section>
          <HistoryPanel
            history={history}
            historyIndex={historyIndex}
            events={events}
            onBack={() => setHistoryIndex((index) => Math.max(0, index - 1))}
            onForward={() => setHistoryIndex((index) => Math.min(history.length - 1, index + 1))}
            onFirst={() => setHistoryIndex(0)}
            onLatest={() => setHistoryIndex(history.length - 1)}
          />
          {isViewingHistory && <p className="hint">Close the menu to inspect the selected move on the field.</p>}
        </GameMenu>
      )}
      {showCoinToss && game.phase === 'coinToss' && (
        <CoinTossDialog
          game={game}
          disabled={isViewingHistory || players[controlTeam] === 'computer'}
          onFlip={flipCoin}
          onChoose={chooseKickoffChoice}
          fallbackFocus={workspaceHeadingRef}
        />
      )}
      {showSettings && <SettingsDialog pieceStyle={pieceStyle} onPieceStyleChange={changePieceStyle} matchLength={matchLength} onMatchLengthChange={changeMatchLength} largeBoard={largeBoard} onLargeBoardChange={setLargeBoard} fallbackFocus={workspaceHeadingRef} onClose={() => setShowSettings(false)} />}
      {showRules && <RulesDialog fallbackFocus={workspaceHeadingRef} onClose={() => setShowRules(false)} />}
      {showNewGameConfirmation && game.phase !== 'pregame' && (
        <Modal
          label="New Game"
          dismissible
          initialFocus={cancelNewGameRef}
          fallbackFocus={workspaceHeadingRef}
          onClose={() => setShowNewGameConfirmation(false)}
        >
          <h2>New Game</h2>
          <p>Start a new game? Your current match and history will be lost.</p>
          <div className="button-grid">
            <button ref={cancelNewGameRef} type="button" onClick={() => setShowNewGameConfirmation(false)}>Cancel</button>
            <button type="button" onClick={reset}>Confirm</button>
          </div>
        </Modal>
      )}
      {game.phase === 'final' && <FinalResultModal game={game} progress={progress} fallbackFocus={workspaceHeadingRef} onNewGame={reset} />}
      </main>
    </div>
  );
}

function CoinTossDialog({
  game,
  disabled,
  onFlip,
  onChoose,
  fallbackFocus,
}: {
  game: GameState;
  disabled: boolean;
  onFlip: () => void;
  onChoose: (choice: 'kick' | 'receive') => void;
  fallbackFocus: React.RefObject<HTMLElement | null>;
}) {
  const winner = game.coinToss.winner;

  return (
    <Modal label="Coin Toss" fallbackFocus={fallbackFocus} backdropClassName="coin-toss-backdrop" dialogClassName="coin-toss-dialog">
        <h2>Coin Toss</h2>
        <p>{winner ? `${capitalize(winner)} won the coin toss. Choose whether to kick or receive.` : 'Flip the coin to decide the opening coin toss.'}</p>
        <CoinFaceDisplay result={game.coinToss.result} />
        <div className="button-grid coin-toss-actions">
          <button type="button" onClick={onFlip} disabled={disabled || Boolean(winner)}>
            <Flag size={17} /> Flip Coin
          </button>
          <button type="button" onClick={() => onChoose('kick')} disabled={disabled || !winner}>
            <Flag size={17} /> Kick
          </button>
          <button type="button" onClick={() => onChoose('receive')} disabled={disabled || !winner}>
            <Shield size={17} /> Receive
          </button>
        </div>
    </Modal>
  );
}

function CoinFaceDisplay({ result }: { result?: CoinFace }) {
  const label = result ? `Coin landed ${result}` : 'Coin ready to flip';

  return (
    <div className="coin-panel" aria-label={label}>
      <span className={`coin-face ${result ?? 'ready'}`} aria-hidden="true">
        {result ? result.charAt(0).toUpperCase() : '?'}
      </span>
      <strong>{result ? capitalize(result) : 'Ready'}</strong>
    </div>
  );
}

function FinalResultModal({
  game,
  progress,
  onNewGame,
  fallbackFocus,
}: {
  game: GameState;
  progress: MatchProgress;
  onNewGame: () => void;
  fallbackFocus: React.RefObject<HTMLElement | null>;
}) {
  const result = finalResultLabel(game);

  return (
    <Modal label="Final Result" fallbackFocus={fallbackFocus} backdropClassName="final-backdrop" dialogClassName="final-dialog">
        <h2>Final Result</h2>
        <p className="final-winner">{result}</p>
        <p className="final-score">Home {game.score.home} - Away {game.score.away}</p>
        <p>Final: Drive {progress.completed} of {progress.total}</p>
        <p>Completed drives: Home {game.drivesThisQuarter.home}/{game.drivesPerTeamPerQuarter}, Away {game.drivesThisQuarter.away}/{game.drivesPerTeamPerQuarter} in Q{game.quarter}.</p>
        <button type="button" onClick={onNewGame}>
          <RotateCcw size={17} /> New Game
        </button>
    </Modal>
  );
}

function ActionOddsLabel({ game, action }: { game: GameState; action: Action }) {
  const text = oddsText(game, action);
  return text ? <small className="action-odds">{text}</small> : null;
}

function RulesDialog({ fallbackFocus, onClose }: { fallbackFocus: React.RefObject<HTMLElement | null>; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Rules and How to Play" dismissible initialFocus={closeRef} fallbackFocus={fallbackFocus} onClose={onClose} dialogClassName="rules-help-dialog">
      <header className="rules-header">
        <h2>Rules and How to Play</h2>
        <button ref={closeRef} className="rules-close" type="button" onClick={onClose} aria-label="Close rules">
          <X size={18} />
        </button>
      </header>
      <div className="rules-content" role="region" aria-label="Rules text" tabIndex={0}>
        <p>A match starts with a coin toss and kickoff. Heads means Home wins; tails means Away wins. The winner chooses to kick or receive. Computer players choose to receive. A 2d6 roll means rolling two six-sided dice and adding their results.</p>
        <h3>Match and downs</h3>
        <ul>
          <li>There are {QUARTERS_PER_MATCH} quarters, with no game clock. A quarter ends when both teams have reached {DRIVES_PER_TEAM_PER_QUARTER} completed drives in Standard matches, or 1 each in Short matches. Choose the length in Settings before starting a new match. The match ends after the fourth quarter; equal scores remain a tie.</li>
          <li>Home attacks right and Away attacks left throughout the match. Each field column represents 5 yards.</li>
          <li>Gain 10 yards in four downs by reaching the highlighted line to gain. Short gains and losses keep the same target for the next down. Reaching it earns first down and a new target two columns ahead; failing on fourth down turns the ball over.</li>
          <li>When a new line to gain would reach or pass the end zone, it becomes goal-to-go. You must score within the remaining downs; reaching the last field column does not renew first down. Losses keep the goal-to-go target.</li>
          <li>Each normal down starts with formations. Choose and preview a preset, then confirm each side. After confirming, each team may use up to two shifts to highlighted adjacent orthogonal squares on its own side of the line. Confirm both sides before snapping; shifts are optional.</li>
          <li>The offense acts first after the snap, then teams alternate one action at a time. A stopped play waits for Next; a touchdown first requires a conversion choice.</li>
          <li>A normal drive ends with a field-goal attempt, punt, interception, strip turnover, turnover on downs, safety, or completed touchdown conversion. Drive counts update on Next. Kickoff returns do not consume a normal drive; a punt return completes the kicking team's drive.</li>
        </ul>
        <h3>Movement and possession</h3>
        <ul>
          <li>Base movement: QB/FS moves 1 square in any direction; RB/MLB moves up to 3 orthogonally, with one optional right-angle turn; FB/OLB moves up to 2 in a straight orthogonal line; WR/CB moves up to 5 straight or diagonally; TE/SS moves up to 3 straight or diagonally; OL/DL moves 1 orthogonally. A turning RB/MLB move uses its full movement allowance.</li>
          <li>When the offense controls the ball, its normal RB, FB, WR, and TE movement ranges are reduced by 1. QB and OL movement remains 1. This applies to the whole offense, not just the ball carrier; power moves use their separate ranges below.</li>
          <li>Moves must end on an empty square inside the board. Normal movement can pass through teammates, but opponents block the path. An RB/MLB cannot turn on an occupied square.</li>
          <li>Power moves travel straight orthogonally through at least one opponent: RB/MLB up to 3 squares, FB/OLB and OL/DL up to 2. They cannot pass through the ball carrier and must end on an empty square. Roll 2d6 and meet or beat 8 + 2 per opposing piece crossed. A failed power move stays put and uses the turn.</li>
          <li>A handoff transfers the ball to an adjacent teammate, including diagonally, without a roll. Linemen may receive handoffs. Recover is available to a player already standing on a loose ball.</li>
          <li>Pass and tackle distance is the larger of the horizontal and vertical gaps: count diagonally first, then straight. For example, from 4,5 to 5,9 is distance 4.</li>
        </ul>
        <h3>Passing and tackling</h3>
        <ul>
          <li>The ball carrier may pass to any teammate except an offensive lineman. A forward pass must start on or behind the line of scrimmage and can be attempted only once per down. Sideways and backward passes do not use that allowance, but still require a roll. Passes may travel through traffic.</li>
          <li>Passes succeed on a 2d6 total of at least 5 + half the distance, rounded up. Snake eyes causes an interception only if a defender is within one square of the intended receiver, including diagonally. The interception ends the play at the defender's square.</li>
          <li>Incomplete passes are dead balls, including failed sideways and backward passes. They stop play at the previous line of scrimmage and use a down; on fourth down, possession changes at that line.</li>
          <li>Only the ball carrier may be tackled. A defender must be within its movement range, measured by the same distance rule as passing. Friendly pieces do not block the approach. With no opposing blockers, a tackle succeeds on 2d6 totaling at least 5 + distance.</li>
          <li>RB/MLB, FB/OLB, and OL/DL may power tackle through opposing blockers. The target is 8 + distance + opposing blockers crossed. Other roles cannot tackle through opposing blockers.</li>
          <li>Double sixes on a legal tackle causes an immediate strip turnover at the tackler's square, even if the normal target exceeds 12. A successful tackle in the carrier's own end zone is a safety instead. During a two-point try, a successful tackle or strip ends the try without points.</li>
          <li>A failed tackle uses the turn and moves the defender one square toward the carrier if that square is empty and inside the board. A normal successful tackle stops play at the carrier's square; reaching the line to gain earns first down, otherwise a down is used.</li>
        </ul>
        <h3>Kicking and returns</h3>
        <ul>
          <li>Special-teams labels: K = kicker, P = punter, KR = kick returner, PR = punt returner, ST = coverage, and BL = blocker. The two receiver pieces serve as returners; any receiving-team piece may recover the kick. These labels remain through the stopped play, then normal positions return for the next scrimmage down.</li>
          <li>Kickoffs start from the kicking team's 35-yard line. Kickoffs and punts roll 2d6 for distance: each point moves the landing column 1 square, or 5 yards, from the kicker. The kicking team chooses the landing row on that column. Kicks beyond the board are capped at the farthest end-zone column.</li>
          <li>A kick landing in an end zone is a touchback to the receiving team's 25-yard line. Otherwise it lands loose, and the receiving team acts first. Moving onto it gives a receiver control; if it lands under a receiver, use Recover. If the kicking team moves onto or recovers an untouched loose kick first, the play ends and the receiving team starts there. A normally tackled returner starts a fresh first down at the tackle spot, regardless of return yardage; a strip or safety still applies.</li>
          <li>During returns, every role can move within a square radius: receiving team up to 2 squares, coverage team up to 3. Teammates may be crossed, opponents block the path, and the destination must be empty. Only movement, tackles, and recovery are available; passing, handoffs, power moves, and further kicks wait until normal play.</li>
          <li>Punts and field goals may be attempted by the ball carrier on any normal live down. Punts proceed to placement and a possible return; field goals resolve immediately. Neither is allowed during a two-point try.</li>
          <li>A field goal measures through the ten-yard end zone to the posts at the back edge/end line. Roll 2d6 and meet or beat 5 + half that grid distance, rounded up. A made field goal scores 3; a miss turns possession over at the kick spot.</li>
        </ul>
        <h3>Scoring and restarts</h3>
        <ul>
          <li>Moving the ball carrier into the opponent's end zone, completing a pass there, or handing off to a teammate there scores a touchdown worth 6 points. A successful tackle of a carrier in their own end zone awards the defense a 2-point safety.</li>
          <li>After a touchdown, choose an extra point kick or a two-point try. The extra point scores 1 on a 2d6 total of 5 or more. A two-point try starts with formations at the last field column before the opponent's end zone and scores 2 for reaching that end zone. An incomplete pass, interception, successful tackle, or strip ends the try without points; there is no second down and no kicking option.</li>
          <li>After the conversion, successful or not, the touchdown team kicks off. A made field goal also leads to a kickoff by the scoring team. After a safety, the team that allowed it kicks. These restarts can be replaced by halftime or the end of the match when both drive counts are complete.</li>
          <li>At halftime, the team that received the opening kickoff kicks to the other side.</li>
        </ul>
      </div>
    </Modal>
  );
}

function PlayerToggle({
  team,
  players,
  disabled,
  onChange,
}: {
  team: Team;
  players: PlayerControl;
  disabled: boolean;
  onChange: (team: Team, kind: PlayerKind) => void;
}) {
  return (
    <div className="player-toggle">
      <span>{capitalize(team)}</span>
      <div className="segmented-control">
        <button
          className={players[team] === 'human' ? 'active' : ''}
          type="button"
          aria-label={`${capitalize(team)} Human`}
          disabled={disabled}
          onClick={() => onChange(team, 'human')}
        >
          Human
        </button>
        <button
          className={players[team] === 'computer' ? 'active' : ''}
          type="button"
          aria-label={`${capitalize(team)} Computer`}
          disabled={disabled}
          onClick={() => onChange(team, 'computer')}
        >
          Computer
        </button>
      </div>
    </div>
  );
}

function HistoryPanel({
  history,
  historyIndex,
  events,
  onBack,
  onForward,
  onFirst,
  onLatest,
}: {
  history: HistoryEntry[];
  historyIndex: number;
  events: EventEntry[];
  onBack: () => void;
  onForward: () => void;
  onFirst: () => void;
  onLatest: () => void;
}) {
  const isLatest = historyIndex === history.length - 1;

  return (
    <section className="panel history-panel" aria-labelledby="history-heading">
      <div className="panel-heading">
        <h2 id="history-heading">Game history</h2>
        {!isLatest && <span>Viewing history</span>}
      </div>
      {!isLatest && <p className="history-read-only">Viewing history — Read-only</p>}
      <div className="history-controls" role="group" aria-label="History controls">
        <button type="button" onClick={onFirst} disabled={historyIndex === 0} aria-label="First move" title="First move">
          <ChevronsLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onBack} disabled={historyIndex === 0} aria-label="Previous move" title="Previous move">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onForward} disabled={isLatest} aria-label="Next move" title="Next move">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button type="button" onClick={onLatest} disabled={isLatest} aria-label="Latest move" title="Latest move">
          <ChevronsRight size={16} aria-hidden="true" />
        </button>
      </div>
      <p className="history-index">Move {historyIndex + 1} of {history.length}: {history[historyIndex]?.label}</p>
      <div className="event-log" role="log" aria-label="Event log">
        {events.map((event) => (
          <p key={event.id}>{event.text}</p>
        ))}
      </div>
    </section>
  );
}

function ScoreCard({ label, score, active }: { label: string; score: number; active: boolean }) {
  return (
    <div className={`score-card ${active ? 'active' : ''}`}>
      <span>{label}</span>
      <strong>{score}</strong>
    </div>
  );
}

function createOpeningGame(length: MatchLength): GameState {
  return createGame({
    phase: 'coinToss',
    drivesPerTeamPerQuarter: length === 'short' ? 1 : 2,
    possession: 'home',
    turn: 'home',
    openingKickoffTeam: 'home',
    coinToss: {},
    play: { actions: [] },
  });
}

function createPregameGame(length: MatchLength): GameState {
  return createGame({
    phase: 'pregame',
    drivesPerTeamPerQuarter: length === 'short' ? 1 : 2,
    pieces: [],
    ball: { kind: 'loose', coord: { x: -1, y: -1 } },
    play: { actions: [] },
  });
}

function FormationPicker({
  title,
  formations,
  activeId,
  confirmed,
  disabled,
  onChoose,
  onConfirm,
}: {
  title: string;
  formations: Formation[];
  activeId: string;
  confirmed: boolean;
  disabled: boolean;
  onChoose: (formation: Formation) => void;
  onConfirm: () => void;
}) {
  const slug = title.toLowerCase();
  const active = formations.find(({ id }) => id === activeId) ?? formations[0];

  return (
    <div className="formation-picker">
      <div className="formation-heading">
        <label htmlFor={`${slug}-formation`}>{title}<span className="visually-hidden"> formation</span></label>
        <em className={`formation-status ${confirmed ? 'confirmed' : 'pending'}`}>{confirmed ? 'Confirmed' : 'Pending'}</em>
      </div>
      <select
        id={`${slug}-formation`}
        aria-describedby={`${slug}-formation-description`}
        title={active.description}
        value={active.id}
        disabled={disabled}
        onChange={(event) => {
          const formation = formations.find(({ id }) => id === event.target.value);
          if (formation) onChoose(formation);
        }}
      >
        {formations.map((formation) => (
          <option key={formation.id} value={formation.id}>{formation.name}</option>
        ))}
      </select>
      <p id={`${slug}-formation-description`} className="visually-hidden">{active.description}</p>
      <button type="button" className="confirm-button" disabled={disabled || confirmed} onClick={onConfirm}>
        Confirm {title}
      </button>
    </div>
  );
}

function SelectionSummary({ selectedPiece, game }: { selectedPiece?: Piece; game: GameState }) {
  return (
    <div className="selection-summary">
      {selectedPiece ? (
        <PieceCard piece={selectedPiece} game={game} />
      ) : (
        <p className="quiet">No piece selected.</p>
      )}
    </div>
  );
}

function PieceCard({ piece, game }: { piece: Piece; game: GameState }) {
  return (
    <div className={`piece-card ${piece.team}`}>
      <span>{piece.team}</span>
      <strong>{activeRoleCode(game, piece)}</strong>
      <small>
        {activeRoleDescription(game, piece)} · {piece.coord.x},{piece.coord.y} {game.ball.kind === 'controlled' && game.ball.pieceId === piece.id ? ' BALL' : ''}
      </small>
    </div>
  );
}

function DicePanel({ roll }: { roll?: DiceRoll }) {
  return (
    <div className="panel dice-panel" aria-label="Last dice roll">
      <div className="panel-heading">
        <h2>Dice</h2>
        <span>{roll ? `Total ${roll.die1 + roll.die2}` : 'No roll'}</span>
      </div>
      <div className="dice-tray">
        {roll ? (
          <>
            <DieFace value={roll.die1} index={1} />
            <DieFace value={roll.die2} index={2} />
          </>
        ) : (
          <>
            <span className="die empty" aria-hidden="true" />
            <span className="die empty" aria-hidden="true" />
          </>
        )}
      </div>
    </div>
  );
}

function DieFace({ value, index }: { value: number; index: number }) {
  return (
    <span className={`die die-${value}`} aria-label={`Die ${index}: ${value}`}>
      {Array.from({ length: 9 }).map((_, pip) => (
        <span key={pip} className="pip" />
      ))}
    </span>
  );
}

function pieceAt(game: GameState, coord: Coord): Piece | undefined {
  return game.pieces.find((piece) => sameCoord(piece.coord, coord));
}

function ballCoord(game: GameState): Coord {
  const ball = game.ball;
  if (ball.kind === 'loose') return ball.coord;
  return game.pieces.find((piece) => piece.id === ball.pieceId)?.coord ?? { x: game.lineOfScrimmage, y: 8 };
}

function ballLabel(game: GameState): string {
  const ball = game.ball;
  if (ball.kind === 'loose') return 'Ball: loose';
  const carrier = game.pieces.find((piece) => piece.id === ball.pieceId);
  return `Ball: controlled by ${carrier ? activeRoleCode(game, carrier) : ball.pieceId}`;
}

function yardMarker(game: GameState, coord: Coord) {
  const isTopNumberRow = coord.y === 1;
  const isBottomNumberRow = coord.y === game.board.height - 2;
  if (!isTopNumberRow && !isBottomNumberRow) return null;
  const rightDigitLineX = isNumberedYardLine(coord.x) ? coord.x : undefined;
  const leftDigitLineX = isNumberedYardLine(coord.x + 1) ? coord.x + 1 : undefined;
  const lineX = leftDigitLineX ?? rightDigitLineX;
  if (!lineX) return null;

  const digitSide = leftDigitLineX ? 'left' : 'right';
  const yardsFromLeftGoal = (lineX - 2) * 5;
  const displayYards = yardsFromLeftGoal <= 50 ? yardsFromLeftGoal : 100 - yardsFromLeftGoal;
  const label = `${displayYards}`;
  const digitIndex = isTopNumberRow
    ? (digitSide === 'left' ? 1 : 0)
    : (digitSide === 'left' ? 0 : 1);
  const digit = label.charAt(digitIndex);
  const edge = isTopNumberRow ? 'Top' : 'Bottom';
  const visualDirection =
    lineX < 12 && digitSide === 'left' ? 'left' :
    lineX > 12 && digitSide === 'right' ? 'right' :
    undefined;
  const classDirection = isTopNumberRow && visualDirection
    ? (visualDirection === 'left' ? 'right' : 'left')
    : visualDirection;
  const classes = [
    'yard-number',
    'yard-digit-marker',
    `yard-digit-${digitSide}`,
    isTopNumberRow ? 'top' : 'bottom',
    isTopNumberRow ? 'inverted' : '',
    classDirection ? `arrow-${classDirection}` : '',
  ].filter(Boolean).join(' ');
  const aria = visualDirection
    ? `${edge} ${label} yard marker ${digitSide} digit, arrow ${visualDirection}`
    : `${edge} ${label} yard marker ${digitSide} digit`;

  return <span className={classes} aria-label={aria}>{digit}</span>;
}

function yardTicks(game: GameState, coord: Coord) {
  if (fieldZone(coord) !== 'field') return null;
  const tickPosition = yardTickPosition(game, coord.y);
  if (!tickPosition) return null;

  return (
    <span className={`yard-ticks ${tickPosition.band} ${tickPosition.edge}`} aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <span key={index} className="yard-tick" />
      ))}
    </span>
  );
}

function yardTickPosition(game: GameState, y: number): { band: 'sideline' | 'interior'; edge: 'top' | 'bottom' } | null {
  if (y === 0) return { band: 'sideline', edge: 'top' };
  if (y === game.board.height - 1) return { band: 'sideline', edge: 'bottom' };
  if (y === 4) return { band: 'interior', edge: 'top' };
  if (y === 6) return { band: 'interior', edge: 'bottom' };
  return null;
}

function isNumberedYardLine(x: number): boolean {
  return x >= 4 && x <= 20 && (x - 2) % 2 === 0;
}

function sameCoord(a: Coord, b: Coord) {
  return a.x === b.x && a.y === b.y;
}

function otherTeamForUi(team: Team): Team {
  return team === 'home' ? 'away' : 'home';
}

function squareClass(game: GameState, coord: Coord, piece: Piece | undefined, legalMove: boolean | undefined, legalPowerMove: boolean | undefined, ballHere: boolean) {
  const zone = fieldZone(coord);
  const classes = ['square', zone === 'field' ? 'field-zone' : zone];
  if (showsScrimmageMarkers(game) && coord.x === game.lineOfScrimmage) classes.push('scrimmage', game.direction === 1 ? 'scrimmage-forward' : 'scrimmage-backward');
  if (showsScrimmageMarkers(game) && coord.x === (isGoalToGo(game) ? game.firstDownLine - game.direction : game.firstDownLine)) classes.push('first-down', game.direction === 1 ? 'first-down-forward' : 'first-down-backward');
  if (coord.x === 12) classes.push('midfield');
  if (coord.x >= 2 && coord.x <= 22) classes.push('five-yard-line');
  if (coord.x >= 2 && coord.x <= 22 && (coord.x - 2) % 2 === 0) classes.push('ten-yard-line');
  if (coord.x === 0 && coord.y >= 4 && coord.y <= 6) classes.push('goal-post-left');
  if (coord.x === game.board.width - 1 && coord.y >= 4 && coord.y <= 6) classes.push('goal-post-right');
  if (piece) classes.push('occupied', piece.team);
  if (legalPowerMove) classes.push('power-legal');
  else if (legalMove) classes.push('legal');
  if (ballHere) classes.push('ball-square');
  if (isTouchdownSquare(coord, game.direction)) classes.push('target-zone');
  return classes.join(' ');
}

function actionForPiece(action: Action, pieceId: string): boolean {
  if (action.type === 'move' || action.type === 'powerMove' || action.type === 'shift' || action.type === 'recover') return action.pieceId === pieceId;
  if (action.type === 'handoff') return action.fromId === pieceId || action.toId === pieceId;
  if (action.type === 'pass') return action.passerId === pieceId;
  if (action.type === 'kick') return action.kickerId === pieceId;
  if (action.type === 'tackle') return action.defenderId === pieceId;
  return false;
}

function tackleActions(_game: GameState, selected: Piece, legalActions: Action[]): Extract<Action, { type: 'tackle' }>[] {
  return legalActions.filter((action): action is Extract<Action, { type: 'tackle' }> =>
    action.type === 'tackle' && action.defenderId === selected.id,
  );
}

function actionLabel(game: GameState, action: Action): string {
  if (action.type === 'coinToss') return 'Flip coin';
  if (action.type === 'chooseKickoffChoice') return capitalize(action.choice);
  if (action.type === 'startTwoPointTry') return 'Two-point try';
  if (action.type === 'placeKick') return `Place kick at ${coordLabel(action.at)}`;
  if (action.type === 'handoff') {
    const target = game.pieces.find((piece) => piece.id === action.toId);
    return target
      ? `Handoff to ${target.team} ${activeRoleCode(game, target)} at ${coordLabel(target.coord)}`
      : `Handoff to ${action.toId.split('-')[1].toUpperCase()}`;
  }
  if (action.type === 'pass') {
    const receiver = game.pieces.find(piece => piece.id === action.receiverId);
    return receiver ? `Pass to ${activeRoleCode(game, receiver)} at ${coordLabel(receiver.coord)}` : 'Pass';
  }
  if (action.type === 'recover') return 'Recover ball';
  if (action.type === 'powerMove') return `Power move to ${coordLabel(action.to)}`;
  if (action.type === 'tackle') {
    const target = game.pieces.find(piece => piece.id === action.targetId);
    return `Tackle ${target ? activeRoleCode(game, target) : action.targetId.split('-')[1].toUpperCase()}`;
  }
  if (action.type === 'kick') {
    if (action.kind === 'extraPoint') return 'Extra point';
    if (action.kind === 'kickoff') return 'Kickoff';
    if (action.kind === 'punt') return 'Punt';
    return 'Field goal';
  }
  return action.type;
}

function describeAction(before: GameState, action: Action, after: GameState): string {
  if (action.type === 'coinToss') {
    const winner = after.coinToss.winner ?? before.turn;
    return `Coin toss: ${capitalize(winner)} won the coin toss (${after.coinToss.result ?? action.result}).`;
  }
  if (action.type === 'chooseKickoffChoice') {
    const kickingTeam = after.openingKickoffTeam;
    const receivingTeam = kickingTeam === 'home' ? 'away' : 'home';
    return `Coin toss choice: ${capitalize(action.team)} chose to ${action.choice}. ${capitalize(receivingTeam)} will receive. ${capitalize(kickingTeam)} kicks off.`;
  }
  if (action.type === 'snap') return `Snap: ${before.possession} started the play.`;
  if (action.type === 'confirmFormation') return `Formation: ${capitalize(action.side)} confirmed.`;
  if (action.type === 'startTwoPointTry') return `Two-point try: ${action.team} lines up from the goal line.`;
  if (action.type === 'placeKick') {
    const pending = before.pendingKick;
    if (after.play.result) return resultText(after);
    return `${pending?.kind === 'punt' ? 'Punt' : 'Kickoff'} placement: ${before.turn} placed the ball at ${coordLabel(action.at)}.`;
  }
  if (action.type === 'chooseFormation') {
    const formation = action.side === 'offense'
      ? offensiveFormations.find((item) => item.id === action.formationId)
      : defensiveFormations.find((item) => item.id === action.formationId);
    return `Formation: ${capitalize(action.side)} chose ${formation?.name ?? action.formationId}.`;
  }
  if (action.type === 'shift') {
    const piece = before.pieces.find((item) => item.id === action.pieceId);
    return `Shift: ${piece?.team ?? before.turn} ${piece ? activeRoleCode(before, piece) : action.pieceId} shifted to ${coordLabel(action.to)}.`;
  }
  if (action.type === 'move') {
    const piece = before.pieces.find((item) => item.id === action.pieceId);
    if (before.ball.kind === 'loose' && sameCoord(before.ball.coord, action.to) && after.ball.kind === 'controlled' && after.ball.pieceId === action.pieceId) {
      return `Pickup: ${piece?.team ?? before.turn} ${piece ? activeRoleCode(before, piece) : action.pieceId} collected the ball at ${coordLabel(action.to)}.`;
    }
    if (after.play.result?.type === 'touchdown') {
      return `Touchdown: ${piece?.team ?? before.turn} ${piece ? activeRoleCode(before, piece) : action.pieceId} scored at ${coordLabel(action.to)}.`;
    }
    if (after.play.result?.type === 'outOfBounds') {
      return `Out of bounds: ${piece?.team ?? before.turn} ${piece ? activeRoleCode(before, piece) : action.pieceId} stepped out at ${coordLabel(action.to)}.`;
    }
    if (after.play.result?.type === 'kickTouched') return resultText(after);
    return `Move: ${piece?.team ?? before.turn} ${piece ? activeRoleCode(before, piece) : action.pieceId} moved to ${coordLabel(action.to)}.`;
  }
  if (action.type === 'powerMove') {
    const beforePiece = before.pieces.find((item) => item.id === action.pieceId);
    const afterPiece = after.pieces.find((item) => item.id === action.pieceId);
    const succeeded = afterPiece ? sameCoord(afterPiece.coord, action.to) : false;
    return `${succeeded ? 'Power move' : 'Failed power move'}: ${beforePiece?.team ?? before.turn} ${beforePiece ? activeRoleCode(before, beforePiece) : action.pieceId} ${succeeded ? 'broke through to' : 'could not reach'} ${coordLabel(action.to)}${rollText(action.roll)}.`;
  }
  if (action.type === 'pass') {
    const receiver = before.pieces.find((piece) => piece.id === action.receiverId);
    const receiverLabel = receiver ? `${activeRoleCode(before, receiver)} at ${coordLabel(receiver.coord)}` : action.receiverId;
    if (after.play.result?.type === 'incomplete') return `Incomplete pass: ${before.turn} targeted ${receiverLabel}${rollText(action.roll, after.play.result.roll)}.`;
    if (after.play.result?.type === 'interception') return `Interception: ${before.turn} targeted ${receiverLabel}${rollText(action.roll, after.play.result.roll)}.`;
    if (after.play.result?.type === 'touchdown') return `Touchdown pass: ${before.turn} completed to ${receiverLabel}${rollText(action.roll, resultRoll(after))}.`;
    if (after.play.result?.type === 'turnoverOnDowns') return `Turnover on downs: ${before.turn}'s pass to ${receiverLabel} failed${rollText(action.roll, resultRoll(after))}.`;
    if (after.ball.kind === 'controlled' && after.ball.pieceId === action.receiverId) {
      return `Completed pass: ${before.turn} hit ${receiverLabel}${rollText(action.roll, resultRoll(after))}.`;
    }
    return `Pass: ${before.turn} targeted ${receiverLabel}${rollText(action.roll, resultRoll(after))}.`;
  }
  if (action.type === 'handoff') return `Handoff: ${action.fromId} gave the ball to ${action.toId}.`;
  if (action.type === 'recover') return `Recovery: ${action.pieceId} recovered the ball.`;
  if (action.type === 'tackle') {
    if (after.play.result?.type === 'fumble') return `Tackle: ${action.defenderId} forced a fumble${rollText(action.roll, after.play.result.roll)}.`;
    if (after.play.result?.type === 'tackle') return `Tackle: ${action.defenderId} stopped ${action.targetId}${rollText(action.roll, after.play.result.roll)}.`;
    if (after.play.result?.type === 'safety') return `Tackle: ${action.defenderId} scored a safety${rollText(action.roll)}.`;
    if (after.play.result?.type === 'turnoverOnDowns') return `Tackle: ${action.defenderId} stopped ${action.targetId}. ${resultText(after)}`;
    return `Missed tackle: ${action.defenderId} missed ${action.targetId}${rollText(action.roll)}.`;
  }
  if (action.type === 'kick') {
    if (after.play.result?.type === 'fieldGoal') return `Kick: ${action.kickerId} attempted ${kickKindLabel(action.kind)}. ${resultText(after)}`;
    if (after.play.result) return `Kick: ${action.kickerId} attempted ${kickKindLabel(action.kind)}${rollText(action.roll, resultRoll(after))}. ${resultText(after)}`;
    return `Kick: ${action.kickerId} attempted ${kickKindLabel(action.kind)}${rollText(action.roll, resultRoll(after))}.`;
  }
  return 'Action resolved.';
}

function resultText(game: GameState): string {
  const result = game.play.result;
  if (!result) return 'Action resolved.';
  if (result.type === 'touchdown') return `Touchdown for ${result.team}.`;
  if (result.type === 'fieldGoal') return `Field goal ${result.good ? 'good' : 'missed'} for ${result.team}${fieldGoalRollText(result.roll)}.`;
  if (result.type === 'extraPoint') return `Extra point ${result.good ? 'good' : 'missed'} for ${result.team}${rollText(undefined, result.roll)}.`;
  if (result.type === 'twoPoint') return `Two-point try ${result.good ? 'good' : 'failed'} for ${result.team}.`;
  if (result.type === 'kickoff') return `Kickoff by ${result.team}. ${capitalize(result.receivingTeam)} starts at ${coordLabel(result.at)}${rollText(undefined, result.roll)}.`;
  if (result.type === 'punt') return `Punt by ${result.team}. ${capitalize(result.receivingTeam)} starts at ${coordLabel(result.at)}${rollText(undefined, result.roll)}.`;
  if (result.type === 'touchback') return `Touchback. ${capitalize(result.team)} starts at ${coordLabel(result.at)}.`;
  if (result.type === 'kickOutOfBounds') return `${capitalize(result.receivingTeam)} takes over after ${result.team}'s kick went out at ${coordLabel(result.at)}.`;
  if (result.type === 'kickTouched') return `${capitalize(result.receivingTeam)} takes over where ${result.team} touched the kick at ${coordLabel(result.at)}.`;
  if (result.type === 'incomplete') return `Incomplete pass${rollText(undefined, result.roll)}.`;
  if (result.type === 'interception') return `Interception for ${result.team}${rollText(undefined, result.roll)}.`;
  if (result.type === 'tackle') return `Tackle at ${coordLabel(result.at)}${rollText(undefined, result.roll)}.`;
  if (result.type === 'fumble') return result.recoveredBy
    ? `Fumble recovered by ${result.recoveredBy}${rollText(undefined, result.roll)}.`
    : `Fumble at ${coordLabel(result.at)}.`;
  if (result.type === 'turnoverOnDowns') return `Turnover on downs. ${capitalize(result.team)} takes over.`;
  if (result.type === 'outOfBounds') return `Out of bounds at ${coordLabel(result.at)}.`;
  if ('team' in result) return `${result.type} for ${result.team}.`;
  return 'Action resolved.';
}

function withDice(action: Action): Action {
  if (action.type === 'coinToss') {
    return { ...action, result: action.result ?? flipActualCoin() };
  }
  if (action.type === 'pass' || action.type === 'tackle' || action.type === 'kick' || action.type === 'powerMove') {
    return { ...action, roll: action.roll ?? roll2d6() };
  }
  return action;
}

function lastDiceRoll(game: GameState): DiceRoll | undefined {
  const result = game.play.result;
  if (result && (result.type === 'fieldGoal' || result.type === 'extraPoint' || result.type === 'kickoff' || result.type === 'punt' || result.type === 'tackle' || result.type === 'fumble' || result.type === 'incomplete' || result.type === 'interception')) {
    return result.roll?.roll;
  }

  return [...game.play.actions]
    .reverse()
    .find((action): action is Extract<Action, { roll?: DiceRoll }> =>
      (action.type === 'pass' || action.type === 'tackle' || action.type === 'kick' || action.type === 'powerMove') && Boolean(action.roll),
    )?.roll;
}

function flipActualCoin(): CoinFace {
  return Math.random() < 0.5 ? 'heads' : 'tails';
}

function roll2d6() {
  return {
    die1: 1 + Math.floor(Math.random() * 6),
    die2: 1 + Math.floor(Math.random() * 6),
  };
}

function rollText(roll?: { die1: number; die2: number }, result?: { total: number; required: number; distance: number }): string {
  if (result) return ` (roll ${result.total} vs ${result.required}, distance ${result.distance})`;
  if (roll) return ` (roll ${roll.die1 + roll.die2})`;
  return '';
}

function fieldGoalRollText(result?: { total: number; required: number; distance: number }): string {
  if (!result) return '';
  return ` (${result.distance * 5} yards to posts, roll ${result.total} vs ${result.required})`;
}

function resultRoll(game: GameState): { total: number; required: number; distance: number } | undefined {
  const result = game.play.result;
  if (!result) return undefined;
  if (result.type === 'fieldGoal' || result.type === 'extraPoint' || result.type === 'kickoff' || result.type === 'punt' || result.type === 'tackle' || result.type === 'fumble' || result.type === 'incomplete' || result.type === 'interception') {
    return result.roll;
  }
  return undefined;
}

function matchProgress(game: GameState): MatchProgress {
  const drivesPerQuarter = game.drivesPerTeamPerQuarter * 2;
  const total = drivesPerQuarter * QUARTERS_PER_MATCH;
  const completedBeforeQuarter = (game.quarter - 1) * drivesPerQuarter;
  const completedThisQuarter = game.drivesThisQuarter.home + game.drivesThisQuarter.away;
  const completed = Math.min(total, completedBeforeQuarter + completedThisQuarter);

  return {
    completed,
    total,
    remaining: Math.max(0, total - completed),
  };
}

function finalResultLabel(game: GameState): string {
  if (game.score.home > game.score.away) return 'Home wins';
  if (game.score.away > game.score.home) return 'Away wins';
  return 'Tie game';
}

function kickKindLabel(kind: Extract<Action, { type: 'kick' }>['kind']): string {
  if (kind === 'fieldGoal') return 'field goal';
  if (kind === 'extraPoint') return 'extra point';
  return kind;
}

function phaseLabel(phase: GameState['phase']): string {
  if (phase === 'pregame') return 'Pregame';
  if (phase === 'coinToss') return 'Coin Toss';
  if (phase === 'betweenDowns') return 'Between Downs';
  if (phase === 'kickoff') return 'Kickoff';
  if (phase === 'kickPlacement') return 'Kick Placement';
  if (phase === 'kickReturn') return 'Kick Return';
  return capitalize(phase);
}

function showsScrimmageMarkers(game: GameState): boolean {
  return game.phase !== 'pregame' &&
    game.phase !== 'kickoff' &&
    game.phase !== 'kickPlacement' &&
    game.phase !== 'kickReturn';
}

function markerYardLabel(game: GameState, column: number): string {
  const markerBoundary = game.direction === 1 ? column + 1 : column;
  if (markerBoundary <= 2) return 'End Zone';
  if (markerBoundary >= 22) return 'End Zone';
  const yardsFromLeftGoal = (markerBoundary - 2) * 5;
  if (yardsFromLeftGoal === 50) return '50';
  return `${yardsFromLeftGoal}`;
}

function tackleLabel(game: GameState, action: Extract<Action, { type: 'tackle' }>): string {
  const target = game.pieces.find((piece) => piece.id === action.targetId);
  if (!target) return `Tackle ${action.targetId}`;
  return `Tackle ${target.team} ${activeRoleCode(game, target)} at ${coordLabel(target.coord)}`;
}

function coordLabel(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}


function downDistanceLabel(game: GameState): string {
  if (game.phase === 'pregame') return 'Ready';
  if (game.phase === 'coinToss') return 'Coin Toss';
  if (game.phase === 'kickoff') return 'Kickoff';
  if (game.phase === 'kickPlacement') return 'Place';
  if (game.phase === 'kickReturn') return 'Return';
  if (game.conversion) return '2PT Try';
  if (isGoalToGo(game)) return `${game.down} & Goal`;
  return `${game.down} & ${Math.max(1, Math.ceil(moveDistanceToFirstDown(game, ballCoord(game)) / 2) * 10)}`;
}

function downStatusClass(game: GameState): string | undefined {
  return game.phase === 'kickReturn' || game.phase === 'coinToss' || game.phase === 'kickoff'
    ? 'compact-status'
    : undefined;
}

function boardDisplayGame(game: GameState): GameState {
  const displayPossession = stoppedPreviousPossession(game);
  return displayPossession ? { ...game, possession: displayPossession, direction: directionForUi(displayPossession) } : game;
}

function stoppedPreviousPossession(game: GameState): Team | undefined {
  if (game.phase !== 'betweenDowns') return undefined;
  const result = game.play.result;
  if (!result) return undefined;
  if (result.type === 'turnoverOnDowns') return otherTeamForUi(result.team);
  if (result.type === 'fieldGoal' && !result.good) return result.team;
  return undefined;
}

function hideStoppedChangeOfPossessionBall(game: GameState): boolean {
  return stoppedPreviousPossession(game) !== undefined;
}

function actionClearsSelection(action: Action): boolean {
  return action.type === 'move' ||
    action.type === 'shift' ||
    action.type === 'powerMove' ||
    action.type === 'pass' ||
    action.type === 'handoff' ||
    action.type === 'tackle' ||
    action.type === 'kick' ||
    action.type === 'placeKick' ||
    action.type === 'recover';
}

function directionForUi(team: Team): 1 | -1 {
  return team === 'home' ? 1 : -1;
}

function ordinalDown(down: GameState['down']): string {
  if (down === 1) return '1st';
  if (down === 2) return '2nd';
  if (down === 3) return '3rd';
  return '4th';
}

function capitalize(value: string): string {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

const root = document.getElementById('root');

if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
