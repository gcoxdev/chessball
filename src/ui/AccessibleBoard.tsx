import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { PieceToken, type PieceStyle } from './PieceToken';
import { oddsText } from './action-odds';
import { activeRoleCode } from '../engine/rules';
import type { Action, Coord, GameState, Piece } from '../engine/types';
import { chooseBoardFocus, describeBoardSquare, moveBoardFocus } from './board-accessibility';

type TargetMode = 'move' | 'pass' | null;

export type AccessibleBoardProps = {
  game: GameState;
  pieceStyle?: PieceStyle;
  displayGame: GameState;
  legalActions: Action[];
  selectedPiece?: Piece;
  selectedBallCarrier?: Piece;
  targetMode: TargetMode;
  ballCoord: Coord;
  showBallMarker: boolean;
  readOnly: boolean;
  describedBy?: string;
  onSquareClick: (coord: Coord) => void;
  squareClass: (coord: Coord, piece: Piece | undefined, legal: boolean, power: boolean, ball: boolean) => string;
  renderYardTicks: (coord: Coord) => ReactNode;
  renderYardMarker: (coord: Coord) => ReactNode;
  ballLabel: string;
};

export function AccessibleBoard(props: AccessibleBoardProps) {
  const initialBall = props.showBallMarker ? props.ballCoord : undefined;
  const [activeCoord, setActiveCoord] = useState<Coord>(() => chooseBoardFocus({
    board: props.game.board,
    selected: props.selectedPiece?.coord,
    ball: initialBall,
  }));
  const refs = useRef(new Map<string, HTMLButtonElement>());

  useEffect(() => {
    setActiveCoord((focused) => chooseBoardFocus({
      board: props.game.board,
      focused,
      selected: props.selectedPiece?.coord,
      ball: props.showBallMarker ? props.ballCoord : undefined,
    }));
  }, [
    props.game.board.width,
    props.game.board.height,
    props.selectedPiece?.coord.x,
    props.selectedPiece?.coord.y,
    props.showBallMarker,
    props.ballCoord.x,
    props.ballCoord.y,
  ]);

  const activate = (coord: Coord) => {
    if (!props.readOnly) props.onSquareClick(coord);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, coord: Coord) => {
    if (event.key.startsWith('Arrow')) {
      event.preventDefault();
      const next = moveBoardFocus(coord, event.key, props.game.board);
      setActiveCoord(next);
      if (next.x !== coord.x || next.y !== coord.y) {
        const button = refs.current.get(coordKey(next));
        button?.focus({ preventScroll: true });
        button?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
      }
      return;
    }
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      activate(coord);
    }
  };

  return (
    <div
      aria-colcount={props.game.board.width}
      aria-describedby={props.describedBy}
      aria-label="Chessball board"
      aria-readonly={props.readOnly || undefined}
      aria-rowcount={props.game.board.height}
      className="field"
      role="grid"
    >
      {Array.from({ length: props.game.board.height }).map((_, y) => (
        <div aria-rowindex={y + 1} className="board-row" key={y} role="row">
          {Array.from({ length: props.game.board.width }).map((_, x) => {
          const coord = { x, y };
          const piece = pieceAt(props.game, coord);
          const ballHere = props.showBallMarker && sameCoord(props.ballCoord, coord);
          const legalMove = Boolean(props.selectedPiece && props.legalActions.some((action) =>
            (action.type === 'move' || action.type === 'shift') &&
            action.pieceId === props.selectedPiece?.id && sameCoord(action.to, coord),
          ));
          const powerMove = Boolean(props.selectedPiece && props.legalActions.some((action) =>
            action.type === 'powerMove' && action.pieceId === props.selectedPiece?.id && sameCoord(action.to, coord),
          ));
          const passTarget = Boolean(props.selectedBallCarrier && props.targetMode === 'pass' && piece && props.legalActions.some((action) =>
            action.type === 'pass' && action.passerId === props.selectedBallCarrier?.id && action.receiverId === piece.id,
          ));
          const tackleTarget = Boolean(props.selectedPiece && piece && props.legalActions.some((action) =>
            action.type === 'tackle' && action.defenderId === props.selectedPiece?.id && action.targetId === piece.id,
          ));
          const kickPlacement = props.game.phase === 'kickPlacement' && props.legalActions.some((action) =>
            action.type === 'placeKick' && sameCoord(action.at, coord),
          );
          const rollAction = props.legalActions.find(action =>
            (passTarget && action.type === 'pass' && action.passerId === props.selectedBallCarrier?.id && action.receiverId === piece?.id) ||
            (!passTarget && tackleTarget && action.type === 'tackle' && action.defenderId === props.selectedPiece?.id && action.targetId === piece?.id) ||
            (powerMove && action.type === 'powerMove' && action.pieceId === props.selectedPiece?.id && sameCoord(action.to, coord)),
          );
          const odds = rollAction ? oddsText(props.game, rollAction) : undefined;
          const selected = Boolean(piece && piece.id === props.selectedPiece?.id);
          const legal = legalMove || passTarget || kickPlacement;
          const stateClasses = [
            selected && 'is-selected',
            legalMove && 'move-target',
            powerMove && 'power-target',
            passTarget && 'pass-target',
            tackleTarget && 'tackle-target',
            kickPlacement && 'kick-target',
          ].filter(Boolean).join(' ');
          const name = describeBoardSquare({
            coord,
            occupant: piece ? { team: piece.team, activeRole: activeRoleCode(props.displayGame, piece) } : undefined,
            ball: ballHere ? props.game.ball.kind : undefined,
            selected,
            legalMove,
            powerMove,
            passTarget,
            tackleTarget,
            kickPlacement,
            readOnly: props.readOnly,
          });
          return (
            <button
              aria-description={odds}
              aria-disabled={props.readOnly || undefined}
              aria-colindex={x + 1}
              aria-label={name}
              aria-rowindex={y + 1}
              aria-selected={selected}
              className={`${props.squareClass(coord, piece, legal, powerMove, ballHere)} ${stateClasses}`.trim()}
              key={coordKey(coord)}
              onClick={() => {
                setActiveCoord(coord);
                activate(coord);
              }}
              onFocus={() => setActiveCoord(coord)}
              onKeyDown={(event) => onKeyDown(event, coord)}
              ref={(node) => {
                if (node) refs.current.set(coordKey(coord), node);
                else refs.current.delete(coordKey(coord));
              }}
              role="gridcell"
              tabIndex={sameCoord(activeCoord, coord) ? 0 : -1}
              title={`${x},${y}`}
              type="button"
            >
              {props.renderYardTicks(coord)}
              {props.renderYardMarker(coord)}
              {piece && <PieceToken team={piece.team} label={activeRoleCode(props.displayGame, piece)} style={props.pieceStyle} selected={selected} />}
              {ballHere && (
                <svg className="football-marker" viewBox="0 0 32 20" role="img" aria-label={props.ballLabel} focusable="false">
                  <path d="M1 10C6-1 26-1 31 10C26 21 6 21 1 10Z" fill="#9b512e" stroke="#f9e7b6" strokeWidth="1.2" />
                  <path d="M3 11Q16 17 29 11" fill="none" stroke="#5c2c18" strokeWidth="1.2" />
                  <path d="M8 3.5Q4.5 10 8 16.5M24 3.5Q27.5 10 24 16.5" fill="none" stroke="#f9e7b6" strokeWidth="2" />
                  <path d="M11 9.5H21M12 7.5V11.5M16 7.5V11.5M20 7.5V11.5" fill="none" stroke="#fff3d4" strokeWidth="1.3" strokeLinecap="round" />
                </svg>
              )}
            </button>
          );
          })}
        </div>
      ))}
    </div>
  );
}

function coordKey(coord: Coord) {
  return `${coord.x}-${coord.y}`;
}

function sameCoord(a: Coord, b: Coord) {
  return a.x === b.x && a.y === b.y;
}

function pieceAt(game: GameState, coord: Coord) {
  return game.pieces.find((piece) => sameCoord(piece.coord, coord));
}
