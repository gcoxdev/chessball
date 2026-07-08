import {
  applyAction,
  createGame,
  defensiveFormations,
  generateLegalActions,
  gridDistance,
  isTouchdownSquare,
  moveDistanceToFirstDown,
  offensiveFormations,
  startNextDown,
} from './rules';
import type { Action, Coord, DiceRoll, GameState, Piece, PlayResult, Team } from './types';

export type SimulationPolicy = 'heuristic' | 'random';
export type SimulationStatus = 'completed' | 'stalled' | 'crashed';

export type SimulationAnomaly = {
  type: 'maxActions' | 'repeatedState' | 'noAction' | 'exception' | 'invariant';
  message: string;
  actionIndex: number;
  phase: GameState['phase'];
  signature?: string;
  recentActions: string[];
};

export type SimulationSummary = {
  seed: number;
  policy: SimulationPolicy;
  status: SimulationStatus;
  actions: number;
  finalPhase: GameState['phase'];
  finalScore: GameState['score'];
  quarter: GameState['quarter'];
  resultTypes: CountMap;
};

export type SimulatedGame = {
  status: SimulationStatus;
  summary: SimulationSummary;
  anomalies: SimulationAnomaly[];
  finalState: GameState;
};

export type BatchPolicySummary = {
  games: number;
  completed: number;
  stalled: number;
  crashed: number;
  actions: number;
};

export type SimulationBatchReport = {
  games: number;
  seed: number;
  completed: number;
  stalled: number;
  crashed: number;
  averageActions: number;
  byPolicy: Record<SimulationPolicy, BatchPolicySummary>;
  phases: CountMap;
  resultTypes: CountMap;
  anomalies: Array<SimulationAnomaly & { game: number; policy: SimulationPolicy; seed: number }>;
  scoreDifferential: {
    homeWins: number;
    awayWins: number;
    ties: number;
    averageHomeScore: number;
    averageAwayScore: number;
  };
  balance: BalanceReport;
  balanceByPolicy: Record<SimulationPolicy, BalanceBucket>;
  balanceByOpeningKickoff: Record<Team, BalanceBucket>;
  balanceByOpeningReceiver: Record<Team, BalanceBucket>;
  balanceByFinalDirection: Record<'left' | 'right', BalanceBucket>;
};

export type BalanceReport = {
  homeWinRate: number;
  awayWinRate: number;
  tieRate: number;
  winRateDelta: number;
  averageScoreDelta: number;
  warnings: string[];
};

export type BalanceBucket = {
  games: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  averageHomeScore: number;
  averageAwayScore: number;
  balance: BalanceReport;
};

type CountMap = Record<string, number> & { total: number };

type BalanceAccumulator = {
  games: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  homeScore: number;
  awayScore: number;
};

type SimulateGameOptions = {
  seed: number;
  policy: SimulationPolicy;
  maxActions?: number;
  repeatLimit?: number;
};

type SimulateBatchOptions = {
  games: number;
  seed?: number;
  maxActionsPerGame?: number;
  repeatLimit?: number;
  balanceWinRateThreshold?: number;
  balanceScoreThreshold?: number;
};

type Random = () => number;

const DEFAULT_MAX_ACTIONS = 2_000;
const DEFAULT_REPEAT_LIMIT = 80;

export function simulateGame(options: SimulateGameOptions): SimulatedGame {
  const rng = seededRandom(options.seed);
  const maxActions = options.maxActions ?? DEFAULT_MAX_ACTIONS;
  const repeatLimit = options.repeatLimit ?? DEFAULT_REPEAT_LIMIT;
  const anomalies: SimulationAnomaly[] = [];
  const resultTypes = countMap();
  const signatures = new Map<string, number>();
  const recentActions: string[] = [];
  let state = createGame({ phase: 'coinToss', ball: { kind: 'loose', coord: { x: -1, y: -1 } } });
  let status: SimulationStatus = 'completed';
  let actionIndex = 0;

  while (state.phase !== 'final' && actionIndex < maxActions) {
    const signature = stateSignature(state);
    const count = (signatures.get(signature) ?? 0) + 1;
    signatures.set(signature, count);
    if (count > repeatLimit) {
      status = 'stalled';
      anomalies.push({
        type: 'repeatedState',
        message: `State repeated more than ${repeatLimit} times`,
        actionIndex,
        phase: state.phase,
        signature,
        recentActions: recentActions.slice(-25),
      });
      break;
    }

    try {
      const legalActions = generateLegalActions(state);
      const action = chooseSimulationAction(state, legalActions, rng, options.policy, actionIndex);

      if (!action) {
        if (state.phase === 'betweenDowns') {
          state = startNextDown(state);
          pushRecentAction(recentActions, `nextDown -> ${state.phase} ${state.possession} Q${state.quarter} D${state.down}`);
          const invariantErrors = validateGameStateInvariants(state);
          if (invariantErrors.length > 0) {
            status = 'crashed';
            anomalies.push({
              type: 'invariant',
              message: invariantErrors.join('; '),
              actionIndex,
              phase: state.phase,
              signature: stateSignature(state),
              recentActions: recentActions.slice(-25),
            });
            break;
          }
          actionIndex += 1;
          continue;
        }

        status = 'stalled';
        anomalies.push({
          type: 'noAction',
          message: 'No legal or simulator transition action was available',
          actionIndex,
          phase: state.phase,
          signature,
          recentActions: recentActions.slice(-25),
        });
        break;
      }

      const resolvedAction = withRandomResolution(action, rng);
      const before = state;
      state = applyAction(state, resolvedAction);
      pushRecentAction(recentActions, actionSummary(before, resolvedAction, state));
      const resultType = state.play.result?.type;
      if (resultType) increment(resultTypes, resultType);
      const invariantErrors = validateGameStateInvariants(state);
      if (invariantErrors.length > 0) {
        status = 'crashed';
        anomalies.push({
          type: 'invariant',
          message: invariantErrors.join('; '),
          actionIndex,
          phase: state.phase,
          signature: stateSignature(state),
          recentActions: recentActions.slice(-25),
        });
        break;
      }

      actionIndex += 1;
    } catch (error) {
      status = 'crashed';
      anomalies.push({
        type: 'exception',
        message: error instanceof Error ? error.message : String(error),
        actionIndex,
        phase: state.phase,
        signature,
        recentActions: recentActions.slice(-25),
      });
      break;
    }
  }

  if (state.phase !== 'final' && status === 'completed') {
    status = 'stalled';
    anomalies.push({
      type: 'maxActions',
      message: `Game exceeded ${maxActions} actions`,
      actionIndex,
      phase: state.phase,
      signature: stateSignature(state),
      recentActions: recentActions.slice(-25),
    });
  }

  return {
    status,
    summary: {
      seed: options.seed,
      policy: options.policy,
      status,
      actions: actionIndex,
      finalPhase: state.phase,
      finalScore: state.score,
      quarter: state.quarter,
      resultTypes,
    },
    anomalies,
    finalState: state,
  };
}

export function validateGameStateInvariants(state: GameState): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const occupied = new Set<string>();
  const fieldStart = 2;
  const fieldEnd = state.board.width - 3;
  const expectedFirstDownLine = clamp(state.lineOfScrimmage + 2 * state.direction, fieldStart, fieldEnd);

  for (const piece of state.pieces) {
    if (ids.has(piece.id)) errors.push(`Duplicate piece id ${piece.id}`);
    ids.add(piece.id);
    if (!inBounds(state, piece.coord)) errors.push(`Piece ${piece.id} is out of bounds at ${piece.coord.x},${piece.coord.y}`);
    const coordKey = `${piece.coord.x},${piece.coord.y}`;
    if (occupied.has(coordKey)) errors.push(`Multiple pieces occupy ${coordKey}`);
    occupied.add(coordKey);
  }

  const ball = state.ball;
  if (ball.kind === 'controlled') {
    const carrier = state.pieces.find((piece) => piece.id === ball.pieceId);
    if (!carrier) {
      errors.push(`Controlled ball references missing piece ${ball.pieceId}`);
    } else if (carrier.team !== state.possession && state.phase !== 'coinToss' && state.phase !== 'pregame' && state.phase !== 'final') {
      errors.push(`Controlled ball belongs to ${carrier.id}, but possession is ${state.possession}`);
    }
  } else if (!inBounds(state, ball.coord) && state.phase !== 'coinToss' && state.phase !== 'pregame' && state.phase !== 'final') {
    errors.push(`Loose ball is out of bounds at ${ball.coord.x},${ball.coord.y}`);
  }

  if (state.phase === 'kickPlacement' && !state.pendingKick) errors.push('Kick placement phase is missing pending kick data');
  if (state.phase === 'kickReturn') {
    if (!state.pendingKick) {
      errors.push('Kick return phase is missing pending kick data');
    } else if (state.possession !== state.pendingKick.receivingTeam) {
      errors.push(`Kick return possession is ${state.possession}, but receiving team is ${state.pendingKick.receivingTeam}`);
    }
  }

  if (state.phase === 'formation' || state.phase === 'live' || state.phase === 'kickReturn' || state.phase === 'betweenDowns') {
    if (state.lineOfScrimmage < fieldStart || state.lineOfScrimmage > fieldEnd) {
      errors.push(`Line of scrimmage ${state.lineOfScrimmage} is outside the field`);
    }
    if (state.down === 1 && state.firstDownLine !== expectedFirstDownLine) {
      errors.push(`First-down line ${state.firstDownLine} should be ${expectedFirstDownLine}`);
    }
  }

  const result = state.play.result;
  if (state.phase === 'betweenDowns' && result) {
    if ((result.type === 'turnoverOnDowns' || result.type === 'interception') && state.possession !== result.team) {
      errors.push(`${result.type} result team ${result.team} does not match possession ${state.possession}`);
    }
    if (result.type === 'touchback' && state.possession !== result.team) {
      errors.push(`${result.type} result team ${result.team} does not match possession ${state.possession}`);
    }
    if (result.type === 'kickTouched' && state.possession !== result.receivingTeam) {
      errors.push(`kickTouched receiving team ${result.receivingTeam} does not match possession ${state.possession}`);
    }
    if (result.type === 'kickOutOfBounds' && state.possession !== result.receivingTeam) {
      errors.push(`kickOutOfBounds receiving team ${result.receivingTeam} does not match possession ${state.possession}`);
    }
  }

  return errors;
}

export function simulateBatch(options: SimulateBatchOptions): SimulationBatchReport {
  const games = Math.max(1, Math.floor(options.games));
  const seed = options.seed ?? 1;
  const phases = countMap();
  const resultTypes = countMap();
  const byPolicy: Record<SimulationPolicy, BatchPolicySummary> = {
    heuristic: emptyPolicySummary(),
    random: emptyPolicySummary(),
  };
  const balanceByPolicy = {
    heuristic: emptyBalanceAccumulator(),
    random: emptyBalanceAccumulator(),
  };
  const balanceByOpeningKickoff = {
    home: emptyBalanceAccumulator(),
    away: emptyBalanceAccumulator(),
  };
  const balanceByOpeningReceiver = {
    home: emptyBalanceAccumulator(),
    away: emptyBalanceAccumulator(),
  };
  const balanceByFinalDirection = {
    left: emptyBalanceAccumulator(),
    right: emptyBalanceAccumulator(),
  };
  const anomalies: SimulationBatchReport['anomalies'] = [];
  let completed = 0;
  let stalled = 0;
  let crashed = 0;
  let actions = 0;
  let homeWins = 0;
  let awayWins = 0;
  let ties = 0;
  let homeScore = 0;
  let awayScore = 0;

  for (let game = 0; game < games; game += 1) {
    const policy: SimulationPolicy = game < Math.ceil(games / 2) ? 'heuristic' : 'random';
    const gameSeed = seed + game * 9_973;
    const result = simulateGame({
      seed: gameSeed,
      policy,
      maxActions: options.maxActionsPerGame,
      repeatLimit: options.repeatLimit,
    });

    actions += result.summary.actions;
    increment(phases, result.summary.finalPhase);
    mergeCounts(resultTypes, result.summary.resultTypes);

    const policySummary = byPolicy[policy];
    policySummary.games += 1;
    policySummary.actions += result.summary.actions;

    if (result.status === 'completed') {
      completed += 1;
      policySummary.completed += 1;
    } else if (result.status === 'crashed') {
      crashed += 1;
      policySummary.crashed += 1;
    } else {
      stalled += 1;
      policySummary.stalled += 1;
    }

    homeScore += result.summary.finalScore.home;
    awayScore += result.summary.finalScore.away;
    if (result.summary.finalScore.home > result.summary.finalScore.away) homeWins += 1;
    else if (result.summary.finalScore.away > result.summary.finalScore.home) awayWins += 1;
    else ties += 1;
    recordBalance(balanceByPolicy[policy], result.summary.finalScore);
    recordBalance(balanceByOpeningKickoff[result.finalState.openingKickoffTeam], result.summary.finalScore);
    recordBalance(balanceByOpeningReceiver[otherTeam(result.finalState.openingKickoffTeam)], result.summary.finalScore);
    recordBalance(balanceByFinalDirection[result.finalState.direction === 1 ? 'right' : 'left'], result.summary.finalScore);

    for (const anomaly of result.anomalies) {
      anomalies.push({ ...anomaly, game, policy, seed: gameSeed });
    }
  }

  return {
    games,
    seed,
    completed,
    stalled,
    crashed,
    averageActions: actions / games,
    byPolicy,
    phases,
    resultTypes,
    anomalies,
    scoreDifferential: {
      homeWins,
      awayWins,
      ties,
      averageHomeScore: homeScore / games,
      averageAwayScore: awayScore / games,
    },
    balance: balanceReport({
      games,
      homeWins,
      awayWins,
      ties,
      averageHomeScore: homeScore / games,
      averageAwayScore: awayScore / games,
      winRateThreshold: options.balanceWinRateThreshold ?? 0.1,
      scoreThreshold: options.balanceScoreThreshold ?? 2,
    }),
    balanceByPolicy: {
      heuristic: toBalanceBucket(balanceByPolicy.heuristic, options),
      random: toBalanceBucket(balanceByPolicy.random, options),
    },
    balanceByOpeningKickoff: {
      home: toBalanceBucket(balanceByOpeningKickoff.home, options),
      away: toBalanceBucket(balanceByOpeningKickoff.away, options),
    },
    balanceByOpeningReceiver: {
      home: toBalanceBucket(balanceByOpeningReceiver.home, options),
      away: toBalanceBucket(balanceByOpeningReceiver.away, options),
    },
    balanceByFinalDirection: {
      left: toBalanceBucket(balanceByFinalDirection.left, options),
      right: toBalanceBucket(balanceByFinalDirection.right, options),
    },
  };
}

function toBalanceBucket(accumulator: BalanceAccumulator, options: SimulateBatchOptions): BalanceBucket {
  const games = Math.max(1, accumulator.games);
  const averageHomeScore = accumulator.homeScore / games;
  const averageAwayScore = accumulator.awayScore / games;
  return {
    games: accumulator.games,
    homeWins: accumulator.homeWins,
    awayWins: accumulator.awayWins,
    ties: accumulator.ties,
    averageHomeScore,
    averageAwayScore,
    balance: balanceReport({
      games,
      homeWins: accumulator.homeWins,
      awayWins: accumulator.awayWins,
      ties: accumulator.ties,
      averageHomeScore,
      averageAwayScore,
      winRateThreshold: options.balanceWinRateThreshold ?? 0.1,
      scoreThreshold: options.balanceScoreThreshold ?? 2,
    }),
  };
}

function recordBalance(accumulator: BalanceAccumulator, score: GameState['score']): void {
  accumulator.games += 1;
  accumulator.homeScore += score.home;
  accumulator.awayScore += score.away;
  if (score.home > score.away) accumulator.homeWins += 1;
  else if (score.away > score.home) accumulator.awayWins += 1;
  else accumulator.ties += 1;
}

function emptyBalanceAccumulator(): BalanceAccumulator {
  return {
    games: 0,
    homeWins: 0,
    awayWins: 0,
    ties: 0,
    homeScore: 0,
    awayScore: 0,
  };
}

function otherTeam(team: Team): Team {
  return team === 'home' ? 'away' : 'home';
}

function balanceReport(input: {
  games: number;
  homeWins: number;
  awayWins: number;
  ties: number;
  averageHomeScore: number;
  averageAwayScore: number;
  winRateThreshold: number;
  scoreThreshold: number;
}): BalanceReport {
  const homeWinRate = input.homeWins / input.games;
  const awayWinRate = input.awayWins / input.games;
  const tieRate = input.ties / input.games;
  const winRateDelta = Math.abs(homeWinRate - awayWinRate);
  const averageScoreDelta = Math.abs(input.averageHomeScore - input.averageAwayScore);
  const warnings: string[] = [];

  if (winRateDelta > input.winRateThreshold) {
    warnings.push(`Home/away win-rate delta ${formatPercent(winRateDelta)} exceeds ${formatPercent(input.winRateThreshold)}`);
  }

  if (averageScoreDelta > input.scoreThreshold) {
    warnings.push(`Home/away average-score delta ${averageScoreDelta.toFixed(2)} exceeds ${input.scoreThreshold.toFixed(2)}`);
  }

  return {
    homeWinRate,
    awayWinRate,
    tieRate,
    winRateDelta,
    averageScoreDelta,
    warnings,
  };
}

function chooseSimulationAction(
  state: GameState,
  legalActions: Action[],
  rng: Random,
  policy: SimulationPolicy,
  actionIndex: number,
): Action | null {
  if (state.phase === 'betweenDowns' && state.play.result?.type !== 'touchdown') return null;
  if (legalActions.length === 0) return null;
  const protocolAction = chooseProtocolAction(state, legalActions, rng, policy, actionIndex);
  if (protocolAction) return protocolAction;
  if (policy === 'random') return chooseBoundedRandomAction(state, legalActions, rng);
  return chooseHeuristicAction(state, legalActions, rng, actionIndex);
}

function chooseProtocolAction(
  state: GameState,
  legalActions: Action[],
  rng: Random,
  policy: SimulationPolicy,
  actionIndex: number,
): Action | null {
  const coin = legalActions.find((action) => action.type === 'coinToss');
  if (coin) return coin;

  const kickoffChoice = legalActions.filter((action): action is Extract<Action, { type: 'chooseKickoffChoice' }> => action.type === 'chooseKickoffChoice');
  if (kickoffChoice.length > 0) {
    if (policy === 'heuristic') return kickoffChoice.find((action) => action.choice === 'receive') ?? kickoffChoice[0];
    return kickoffChoice[randomInt(rng, kickoffChoice.length)];
  }

  if (state.phase === 'formation') {
    const formation = chooseFormationProtocolAction(state, legalActions, rng, policy, actionIndex);
    if (formation) return formation;
  }

  const kickoff = legalActions.find((action) => action.type === 'kick' && action.kind === 'kickoff');
  if (kickoff) return kickoff;

  const placement = chooseKickPlacement(state, legalActions, rng);
  if (placement) return placement;

  return null;
}

function chooseFormationProtocolAction(
  state: GameState,
  legalActions: Action[],
  rng: Random,
  policy: SimulationPolicy,
  actionIndex: number,
): Action | null {
  const chooseFormation = legalActions.filter((action): action is Extract<Action, { type: 'chooseFormation' }> => action.type === 'chooseFormation');
  const confirm = legalActions.filter((action): action is Extract<Action, { type: 'confirmFormation' }> => action.type === 'confirmFormation');
  const snap = legalActions.find((action) => action.type === 'snap');

  for (const side of ['offense', 'defense'] as const) {
    const sideChosen = state.play.actions.some((action) => action.type === 'chooseFormation' && action.side === side);
    const sideConfirm = confirm.find((action) => action.side === side);
    if (sideChosen && sideConfirm) return sideConfirm;

    const sideChoices = chooseFormation.filter((action) => action.side === side);
    if (!sideChosen && sideChoices.length > 0) {
      if (policy === 'random') return sideChoices[randomInt(rng, sideChoices.length)];
      const formations = side === 'offense' ? offensiveFormations : defensiveFormations;
      const preferred = formations[(state.down + actionIndex + randomInt(rng, formations.length)) % formations.length];
      return sideChoices.find((action) => action.formationId === preferred.id) ?? sideChoices[0];
    }
  }

  return snap ?? null;
}

function chooseRandomAction(legalActions: Action[], rng: Random): Action {
  return legalActions[randomInt(rng, legalActions.length)];
}

function chooseBoundedRandomAction(state: GameState, legalActions: Action[], rng: Random): Action {
  const conversion = legalActions.filter((action) => (action.type === 'kick' && action.kind === 'extraPoint') || action.type === 'startTwoPointTry');
  if (conversion.length > 0) return conversion[randomInt(rng, conversion.length)];

  const recoveries = legalActions.filter((action) => action.type === 'recover');
  if (recoveries.length > 0) return recoveries[randomInt(rng, recoveries.length)];

  const carrier = carrierPiece(state);
  if (carrier && carrier.team !== state.turn) {
    const tackles = legalActions.filter((action) => action.type === 'tackle');
    if (tackles.length > 0) return tackles[randomInt(rng, tackles.length)];
  }

  if (state.ball.kind === 'loose') {
    const looseCoord = state.ball.coord;
    const pickupMoves = legalActions.filter((action): action is Extract<Action, { type: 'move' }> =>
      action.type === 'move' && sameCoord(action.to, looseCoord),
    );
    if (pickupMoves.length > 0) return pickupMoves[randomInt(rng, pickupMoves.length)];

    const towardLooseBall = topMovesToward(legalActions, state, looseCoord, 8);
    if (towardLooseBall.length > 0) return towardLooseBall[randomInt(rng, towardLooseBall.length)];
  }

  if (carrier?.team === state.turn) {
    const carrierActions = legalActions.filter((action) => actionForPiece(action, carrier.id));
    if (carrierActions.length > 0) {
      if (state.phase === 'kickReturn') {
        const carrierMoves = topCarrierMoves(state, legalActions, carrier, 6);
        if (carrierMoves.length > 0) return carrierMoves[randomInt(rng, carrierMoves.length)];
      }

      const kicks = carrierActions.filter((action) => action.type === 'kick');
      if (state.down === 4 && kicks.length > 0 && rng() < 0.6) return kicks[randomInt(rng, kicks.length)];

      const meaningful = [
        ...topCarrierMoves(state, legalActions, carrier, 8),
        ...carrierActions.filter((action) => action.type === 'handoff'),
        ...topPasses(state, legalActions, carrier, 8),
        ...carrierActions.filter((action) => action.type === 'powerMove'),
      ];
      if (meaningful.length > 0) return meaningful[randomInt(rng, meaningful.length)];

      return carrierActions[randomInt(rng, carrierActions.length)];
    }
  }

  const ballAt = ballCoord(state);
  const towardBall = topMovesToward(legalActions, state, ballAt, 10);
  if (towardBall.length > 0) return towardBall[randomInt(rng, towardBall.length)];

  return chooseRandomAction(legalActions, rng);
}

function chooseHeuristicAction(state: GameState, legalActions: Action[], rng: Random, actionIndex: number): Action {
  const extraPoint = legalActions.find((action) => action.type === 'kick' && action.kind === 'extraPoint');
  if (extraPoint && rng() < 0.85) return extraPoint;
  const twoPoint = legalActions.find((action) => action.type === 'startTwoPointTry');
  if (twoPoint) return twoPoint;
  if (extraPoint) return extraPoint;

  const recovery = legalActions.find((action) => action.type === 'recover');
  if (recovery) return recovery;

  const carrier = carrierPiece(state);
  if (carrier && carrier.team !== state.turn) {
    const tackles = legalActions.filter((action): action is Extract<Action, { type: 'tackle' }> => action.type === 'tackle');
    if (tackles.length > 0) return tackles[randomInt(rng, tackles.length)];
  }

  const looseBall = state.ball.kind === 'loose' ? state.ball.coord : undefined;
  if (looseBall) {
    const pickup = legalActions.find((action): action is Extract<Action, { type: 'move' }> =>
      action.type === 'move' && sameCoord(action.to, looseBall),
    );
    if (pickup) return pickup;

    const chase = bestMoveToward(legalActions, state, looseBall);
    if (chase) return chase;
  }

  if (carrier?.team === state.turn) {
    if (state.phase === 'kickReturn') {
      const returnMove = bestCarrierMove(state, legalActions, carrier);
      if (returnMove) return returnMove;
    }

    if (state.down === 4 && moveDistanceToFirstDown(state, carrier.coord) > 1) {
      const fieldGoal = legalActions.find((action) => action.type === 'kick' && action.kind === 'fieldGoal');
      if (fieldGoal && inFieldGoalRange(state, carrier.coord)) return fieldGoal;
      const punt = legalActions.find((action) => action.type === 'kick' && action.kind === 'punt');
      if (punt) return punt;
    }

    if (carrier.role === 'qb' && !state.forwardPassUsed && rng() < 0.3) {
      const pass = chooseHeuristicPass(state, legalActions, carrier);
      if (pass) return pass;
    }

    const handoff = legalActions.find((action) => action.type === 'handoff' && action.toId.includes('-rb'));
    if (handoff && rng() < 0.2) return handoff;

    if (!hasForwardCarrierMove(state, legalActions, carrier)) {
      const fieldGoal = legalActions.find((action) => action.type === 'kick' && action.kind === 'fieldGoal');
      if (fieldGoal && inFieldGoalRange(state, carrier.coord)) return fieldGoal;

      const powerMove = bestCarrierPowerMove(state, legalActions, carrier);
      if (powerMove) return powerMove;

      const punt = legalActions.find((action) => action.type === 'kick' && action.kind === 'punt');
      if (punt && moveDistanceToFirstDown(state, carrier.coord) > 1) return punt;
    }

    const move = bestCarrierMove(state, legalActions, carrier);
    if (move) return move;

    const powerMove = bestCarrierPowerMove(state, legalActions, carrier);
    if (powerMove) return powerMove;
  }

  const ballAt = ballCoord(state);
  const supportMove = bestMoveToward(legalActions, state, ballAt);
  return supportMove ?? chooseRandomAction(legalActions, rng);
}

function chooseKickPlacement(state: GameState, legalActions: Action[], rng: Random): Extract<Action, { type: 'placeKick' }> | undefined {
  const placements = legalActions.filter((action): action is Extract<Action, { type: 'placeKick' }> => action.type === 'placeKick');
  if (placements.length === 0) return undefined;
  const targetY = 2 + randomInt(rng, Math.max(1, state.board.height - 4));
  return [...placements].sort((a, b) => Math.abs(a.at.y - targetY) - Math.abs(b.at.y - targetY))[0];
}

function bestMoveToward(legalActions: Action[], state: GameState, target: Coord): Extract<Action, { type: 'move' | 'powerMove' }> | undefined {
  return topMovesToward(legalActions, state, target, 1)[0];
}

function topMovesToward(legalActions: Action[], state: GameState, target: Coord, limit: number): Array<Extract<Action, { type: 'move' | 'powerMove' }>> {
  const moves = legalActions.filter((action): action is Extract<Action, { type: 'move' | 'powerMove' }> => action.type === 'move' || action.type === 'powerMove');
  return moves.sort((a, b) => {
    const distance = gridDistance(a.to, target) - gridDistance(b.to, target);
    if (distance !== 0) return distance;
    return progressScore(state, b.to) - progressScore(state, a.to);
  }).slice(0, limit);
}

function bestCarrierMove(state: GameState, legalActions: Action[], carrier: Piece): Extract<Action, { type: 'move' }> | undefined {
  return topCarrierMoves(state, legalActions, carrier, 1)[0];
}

function hasForwardCarrierMove(state: GameState, legalActions: Action[], carrier: Piece): boolean {
  return legalActions.some((action) =>
    action.type === 'move' &&
    action.pieceId === carrier.id &&
    progressScore(state, action.to) > progressScore(state, carrier.coord),
  );
}

function topCarrierMoves(state: GameState, legalActions: Action[], carrier: Piece, limit: number): Array<Extract<Action, { type: 'move' }>> {
  const moves = legalActions.filter((action): action is Extract<Action, { type: 'move' }> =>
    action.type === 'move' && action.pieceId === carrier.id,
  );
  return moves.sort((a, b) => {
    const progress = progressScore(state, b.to) - progressScore(state, a.to);
    if (progress !== 0) return progress;
    return Math.abs(a.to.y - 5) - Math.abs(b.to.y - 5);
  }).slice(0, limit);
}

function bestCarrierPowerMove(state: GameState, legalActions: Action[], carrier: Piece): Extract<Action, { type: 'powerMove' }> | undefined {
  const moves = legalActions.filter((action): action is Extract<Action, { type: 'powerMove' }> =>
    action.type === 'powerMove' && action.pieceId === carrier.id,
  );
  return moves.sort((a, b) => progressScore(state, b.to) - progressScore(state, a.to))[0];
}

function chooseHeuristicPass(state: GameState, legalActions: Action[], carrier: Piece): Extract<Action, { type: 'pass' }> | undefined {
  return topPasses(state, legalActions, carrier, 1)[0];
}

function topPasses(state: GameState, legalActions: Action[], carrier: Piece, limit: number): Array<Extract<Action, { type: 'pass' }>> {
  const passes = legalActions.filter((action): action is Extract<Action, { type: 'pass' }> => action.type === 'pass' && action.passerId === carrier.id);
  const receivers = new Map(state.pieces
    .filter((piece) => piece.team === carrier.team && piece.id !== carrier.id && (piece.role === 'wr' || piece.role === 'te'))
    .map((receiver) => [receiver.id, receiver]));
  return passes
    .filter((pass) => receivers.has(pass.receiverId))
    .sort((a, b) => progressScore(state, receivers.get(b.receiverId)?.coord ?? carrier.coord) - progressScore(state, receivers.get(a.receiverId)?.coord ?? carrier.coord))
    .slice(0, limit);
}

function withRandomResolution(action: Action, rng: Random): Action {
  if (action.type === 'coinToss') return { ...action, result: rng() < 0.5 ? 'heads' : 'tails' };
  if (action.type === 'kick' || action.type === 'pass' || action.type === 'tackle' || action.type === 'powerMove') {
    return { ...action, roll: roll2d6(rng) } as Action;
  }
  return action;
}

function roll2d6(rng: Random): DiceRoll {
  return {
    die1: 1 + randomInt(rng, 6),
    die2: 1 + randomInt(rng, 6),
  };
}

function stateSignature(state: GameState): string {
  const ball = state.ball.kind === 'loose'
    ? `L:${state.ball.coord.x},${state.ball.coord.y}`
    : `C:${state.ball.pieceId}`;
  const pieces = state.pieces
    .map((piece) => `${piece.id}:${piece.coord.x},${piece.coord.y}`)
    .sort()
    .join('|');
  return [
    state.phase,
    state.turn,
    state.possession,
    state.direction,
    state.quarter,
    state.down,
    state.lineOfScrimmage,
    state.firstDownLine,
    state.score.home,
    state.score.away,
    ball,
    state.forwardPassUsed ? 1 : 0,
    state.pendingKick ? `${state.pendingKick.kind}:${state.pendingKick.distance}` : '',
    state.play.result?.type ?? '',
    pieces,
  ].join(';');
}

function ballCoord(state: GameState): Coord {
  if (state.ball.kind === 'loose') return state.ball.coord;
  return carrierPiece(state)?.coord ?? { x: state.lineOfScrimmage, y: 5 };
}

function carrierPiece(state: GameState): Piece | undefined {
  if (state.ball.kind !== 'controlled') return undefined;
  const pieceId = state.ball.pieceId;
  return state.pieces.find((piece) => piece.id === pieceId);
}

function progressScore(state: GameState, coord: Coord): number {
  if (isTouchdownSquare(coord, state.direction)) return 1_000;
  return state.direction === 1 ? coord.x : state.board.width - coord.x;
}

function inFieldGoalRange(state: GameState, coord: Coord): boolean {
  const distance = state.direction === 1 ? 22 - coord.x : coord.x - 1;
  return distance <= 6;
}

function seededRandom(seed: number): Random {
  let value = seed >>> 0;
  return () => {
    value = (value * 1_664_525 + 1_013_904_223) >>> 0;
    return value / 0x1_0000_0000;
  };
}

function randomInt(rng: Random, upperExclusive: number): number {
  return Math.floor(rng() * upperExclusive);
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function inBounds(state: GameState, coord: Coord): boolean {
  return coord.x >= 0 && coord.y >= 0 && coord.x < state.board.width && coord.y < state.board.height;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function actionForPiece(action: Action, pieceId: string): boolean {
  if (action.type === 'move' || action.type === 'powerMove' || action.type === 'shift' || action.type === 'recover') return action.pieceId === pieceId;
  if (action.type === 'handoff') return action.fromId === pieceId || action.toId === pieceId;
  if (action.type === 'pass') return action.passerId === pieceId;
  if (action.type === 'kick') return action.kickerId === pieceId;
  if (action.type === 'tackle') return action.defenderId === pieceId || action.targetId === pieceId;
  return false;
}

function pushRecentAction(recentActions: string[], label: string): void {
  recentActions.push(label);
  if (recentActions.length > 50) recentActions.shift();
}

function actionSummary(before: GameState, action: Action, after: GameState): string {
  const result = after.play.result?.type ? ` result=${after.play.result.type}` : '';
  if (action.type === 'move' || action.type === 'powerMove' || action.type === 'shift') {
    return `${action.type} ${action.pieceId} -> ${coordLabel(action.to)} phase=${after.phase}${result}`;
  }
  if (action.type === 'pass') return `pass ${action.passerId} -> ${action.receiverId} phase=${after.phase}${result}`;
  if (action.type === 'tackle') return `tackle ${action.defenderId} -> ${action.targetId} phase=${after.phase}${result}`;
  if (action.type === 'kick') return `kick ${action.kind} by ${action.kickerId} phase=${after.phase}${result}`;
  if (action.type === 'placeKick') return `placeKick ${coordLabel(action.at)} phase=${after.phase}`;
  if (action.type === 'recover') return `recover ${action.pieceId} phase=${after.phase}${result}`;
  if (action.type === 'chooseFormation') return `formation ${action.side}:${action.formationId} phase=${after.phase}`;
  if (action.type === 'confirmFormation') return `confirm ${action.side} phase=${after.phase}`;
  if (action.type === 'chooseKickoffChoice') return `kickoffChoice ${action.team}:${action.choice} phase=${after.phase}`;
  if (action.type === 'startTwoPointTry') return `twoPoint ${action.team} phase=${after.phase}`;
  if (action.type === 'snap') return `snap ${before.possession} phase=${after.phase}`;
  return `${action.type} phase=${after.phase}${result}`;
}

function coordLabel(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

function countMap(): CountMap {
  return { total: 0 };
}

function increment(counts: CountMap, key: string): void {
  counts[key] = (counts[key] ?? 0) + 1;
  counts.total += 1;
}

function mergeCounts(target: CountMap, source: CountMap): void {
  for (const [key, value] of Object.entries(source)) {
    if (key === 'total') continue;
    target[key] = (target[key] ?? 0) + value;
  }
  target.total += source.total;
}

function emptyPolicySummary(): BatchPolicySummary {
  return {
    games: 0,
    completed: 0,
    stalled: 0,
    crashed: 0,
    actions: 0,
  };
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
