import type {
  Action,
  Coord,
  DiceRoll,
  Direction,
  FieldZone,
  Formation,
  FormationSide,
  GameState,
  LegalAction,
  Piece,
  PlayResult,
  Role,
  RollResult,
  Team,
} from './types';

const WIDTH = 24;
const HEIGHT = 11;
const FIELD_START = 2;
const FIELD_END = 21;
const RIGHT_END_ZONE_START = 22;
const FIRST_DOWN_COLUMNS = 2;
const DEFAULT_DRIVES = 4;
export const QUARTERS_PER_MATCH = 4;
export const DRIVES_PER_TEAM_PER_QUARTER = 2;

export const offensiveFormations: Formation[] = [
  {
    id: 'i-form',
    name: 'I-Form',
    side: 'offense',
    positions: {
      qb: { x: -1, y: 5 },
      rb: { x: -2, y: 5 },
      fb: { x: -1, y: 6 },
      wr1: { x: -1, y: 1 },
      wr2: { x: -1, y: 9 },
      te: { x: 0, y: 8 },
      ol1: { x: 0, y: 3 },
      ol2: { x: 0, y: 4 },
      ol3: { x: 0, y: 5 },
      ol4: { x: 0, y: 6 },
      ol5: { x: 0, y: 7 },
    },
  },
  {
    id: 'shotgun',
    name: 'Shotgun',
    side: 'offense',
    positions: {
      qb: { x: -2, y: 5 },
      rb: { x: -2, y: 6 },
      fb: { x: -1, y: 3 },
      wr1: { x: -1, y: 0 },
      wr2: { x: -1, y: 10 },
      te: { x: 0, y: 8 },
      ol1: { x: 0, y: 3 },
      ol2: { x: 0, y: 4 },
      ol3: { x: 0, y: 5 },
      ol4: { x: 0, y: 6 },
      ol5: { x: 0, y: 7 },
    },
  },
  {
    id: 'singleback',
    name: 'Singleback',
    side: 'offense',
    positions: {
      qb: { x: -1, y: 5 },
      rb: { x: -2, y: 5 },
      fb: { x: -1, y: 7 },
      wr1: { x: -1, y: 1 },
      wr2: { x: -1, y: 10 },
      te: { x: 0, y: 8 },
      ol1: { x: 0, y: 3 },
      ol2: { x: 0, y: 4 },
      ol3: { x: 0, y: 5 },
      ol4: { x: 0, y: 6 },
      ol5: { x: 0, y: 7 },
    },
  },
];

export const defensiveFormations: Formation[] = [
  {
    id: '4-3',
    name: '4-3',
    side: 'defense',
    positions: {
      qb: { x: 5, y: 5 },
      rb: { x: 2, y: 5 },
      fb: { x: 2, y: 3 },
      wr1: { x: 4, y: 1 },
      wr2: { x: 4, y: 9 },
      te: { x: 3, y: 7 },
      ol1: { x: 1, y: 3 },
      ol2: { x: 1, y: 4 },
      ol3: { x: 1, y: 5 },
      ol4: { x: 1, y: 6 },
      ol5: { x: 2, y: 7 },
    },
  },
  {
    id: 'nickel',
    name: 'Nickel',
    side: 'defense',
    positions: {
      qb: { x: 5, y: 5 },
      rb: { x: 2, y: 5 },
      fb: { x: 2, y: 2 },
      wr1: { x: 4, y: 0 },
      wr2: { x: 4, y: 10 },
      te: { x: 3, y: 7 },
      ol1: { x: 1, y: 3 },
      ol2: { x: 1, y: 4 },
      ol3: { x: 1, y: 5 },
      ol4: { x: 1, y: 6 },
      ol5: { x: 2, y: 8 },
    },
  },
  {
    id: 'goal-line',
    name: 'Goal Line',
    side: 'defense',
    positions: {
      qb: { x: 4, y: 5 },
      rb: { x: 2, y: 4 },
      fb: { x: 2, y: 6 },
      wr1: { x: 3, y: 1 },
      wr2: { x: 3, y: 9 },
      te: { x: 2, y: 8 },
      ol1: { x: 1, y: 3 },
      ol2: { x: 1, y: 4 },
      ol3: { x: 1, y: 5 },
      ol4: { x: 1, y: 6 },
      ol5: { x: 1, y: 7 },
    },
  },
];

const defaultFormation = {
  offense: offensiveFormations[0],
  defense: defensiveFormations[0],
};

export function createGame(overrides: Partial<GameState> = {}): GameState {
  const possession = overrides.possession ?? 'home';
  const direction = overrides.direction ?? directionFor(possession);
  const lineOfScrimmage = overrides.lineOfScrimmage ?? 5;
  const formation = overrides.formation ?? defaultFormation;
  const firstDownLine = overrides.firstDownLine ?? clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END);
  const base: GameState = {
    board: { width: WIDTH, height: HEIGHT },
    phase: 'formation',
    pieces: formationPieces(possession, lineOfScrimmage, formation),
    ball: { kind: 'controlled', pieceId: `${possession}-qb` },
    possession,
    direction,
    turn: possession,
    score: { home: 0, away: 0 },
    quarter: 1,
    drivesThisQuarter: { home: 0, away: 0 },
    openingKickoffTeam: 'home',
    coinToss: {},
    down: 1,
    lineOfScrimmage,
    firstDownLine,
    drivesRemaining: { home: DEFAULT_DRIVES, away: DEFAULT_DRIVES },
    forwardPassUsed: false,
    formation,
    formationConfirmed: { offense: false, defense: false },
    formationShiftsRemaining: { home: 2, away: 2 },
    conversion: undefined,
    pendingKick: undefined,
    play: { actions: [] },
  };

  return { ...base, ...overrides, pieces: overrides.pieces ?? base.pieces };
}

export function fieldZone(coord: Coord): FieldZone {
  if (!inBounds(coord)) return 'out';
  if (coord.x < FIELD_START) return 'leftEndZone';
  if (coord.x >= RIGHT_END_ZONE_START) return 'rightEndZone';
  return 'field';
}

export function isTouchdownSquare(coord: Coord, direction: Direction): boolean {
  return direction === 1 ? fieldZone(coord) === 'rightEndZone' : fieldZone(coord) === 'leftEndZone';
}

export function moveDistanceToFirstDown(state: GameState, coord: Coord): number {
  const remaining = state.direction === 1 ? state.firstDownLine - coord.x : coord.x - state.firstDownLine;
  return Math.max(0, remaining);
}

export function gridDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export function activeRoleCode(state: GameState, piece: Piece): string {
  if (state.phase === 'kickoff' && piece.team === state.possession && piece.id === `${piece.team}-qb`) {
    return 'K';
  }

  const roleCodes: Record<Role, [string, string]> = {
    qb: ['QB', 'FS'],
    rb: ['RB', 'MLB'],
    fb: ['FB', 'OLB'],
    wr: ['WR', 'CB'],
    te: ['TE', 'SS'],
    ol: ['OL', 'DL'],
  };
  const [offense, defense] = roleCodes[piece.role];
  return piece.team === state.possession ? offense : defense;
}

export function generateLegalActions(state: GameState): LegalAction[] {
  if (state.phase === 'coinToss') {
    if (!state.coinToss.winner) return [{ type: 'coinToss' }];
    return [
      { type: 'chooseKickoffChoice', team: state.coinToss.winner, choice: 'kick' },
      { type: 'chooseKickoffChoice', team: state.coinToss.winner, choice: 'receive' },
    ];
  }

  if (state.phase === 'formation') {
    return [
      ...(formationsReady(state) ? [{ type: 'snap' as const }] : []),
      ...(!state.formationConfirmed.offense ? offensiveFormations.map((formation) => ({ type: 'chooseFormation' as const, side: 'offense' as const, formationId: formation.id })) : []),
      ...(!state.formationConfirmed.defense ? defensiveFormations.map((formation) => ({ type: 'chooseFormation' as const, side: 'defense' as const, formationId: formation.id })) : []),
      ...(!state.formationConfirmed.offense ? [{ type: 'confirmFormation' as const, side: 'offense' as const }] : []),
      ...(!state.formationConfirmed.defense ? [{ type: 'confirmFormation' as const, side: 'defense' as const }] : []),
      ...shiftActions(state),
    ];
  }

  if (state.phase === 'kickoff') {
    return [{ type: 'kick', kickerId: `${state.turn}-qb`, kind: 'kickoff' }];
  }

  if (state.phase === 'kickPlacement') {
    return legalKickPlacements(state).map((at) => ({ type: 'placeKick', at }));
  }

  if (state.phase === 'betweenDowns') {
    if (state.play.result?.type === 'touchdown') {
      return [
        { type: 'kick', kickerId: `${state.play.result.team}-qb`, kind: 'extraPoint' },
        { type: 'startTwoPointTry', team: state.play.result.team },
      ];
    }
    return [];
  }

  if (state.phase !== 'live' && state.phase !== 'kickReturn') return [];

  const actions: LegalAction[] = [];
  for (const piece of state.pieces.filter((item) => item.team === state.turn)) {
    for (const to of legalMovesForPiece(state, piece)) {
      actions.push({ type: 'move', pieceId: piece.id, to });
    }
    if (state.phase === 'live') {
      for (const to of legalPowerMovesForPiece(state, piece)) {
        actions.push({ type: 'powerMove', pieceId: piece.id, to });
      }
    }
  }

  const carrier = carrierPiece(state);
  if (carrier?.team === state.turn && state.phase === 'live') {
    actions.push(...state.pieces
      .filter((item) => item.team === state.turn && item.id !== carrier.id && adjacent(item.coord, carrier.coord))
      .map((item) => ({ type: 'handoff' as const, fromId: carrier.id, toId: item.id })));
    actions.push(...state.pieces
      .filter((piece) => canLegallyPassToReceiver(state, carrier, piece))
      .map((receiver) => ({ type: 'pass' as const, passerId: carrier.id, receiverId: receiver.id })));
    actions.push({ type: 'kick', kickerId: carrier.id, kind: 'fieldGoal' });
    actions.push({ type: 'kick', kickerId: carrier.id, kind: 'punt' });
  }

  const ball = state.ball;
  if (ball.kind === 'loose') {
    for (const piece of state.pieces.filter((item) => item.team === state.turn && sameCoord(item.coord, ball.coord))) {
      actions.push({ type: 'recover', pieceId: piece.id });
    }
  }

  if (carrier && carrier.team !== state.turn) {
    for (const defender of state.pieces.filter((piece) => piece.team === state.turn)) {
      if (canAttemptTackle(state, defender, carrier)) {
        actions.push({ type: 'tackle', defenderId: defender.id, targetId: carrier.id });
      }
    }
  }

  return actions;
}

function canLegallyPassToReceiver(state: GameState, passer: Piece, receiver: Piece): boolean {
  if (receiver.team !== passer.team || receiver.id === passer.id || receiver.role === 'ol') return false;
  const forward = state.direction === 1 ? receiver.coord.x > passer.coord.x : receiver.coord.x < passer.coord.x;
  if (!forward) return true;
  if (state.forwardPassUsed) return false;
  return state.direction === 1 ? passer.coord.x <= state.lineOfScrimmage : passer.coord.x >= state.lineOfScrimmage;
}

export function applyAction(state: GameState, action: Action): GameState {
  if (action.type === 'coinToss') return coinToss(state, action);
  if (action.type === 'chooseKickoffChoice') return chooseKickoffChoice(state, action);
  if (action.type === 'snap') return snap(state, action);
  if (action.type === 'shift') return shift(state, action);
  if (action.type === 'chooseFormation') return chooseFormation(state, action);
  if (action.type === 'confirmFormation') return confirmFormation(state, action);
  if (action.type === 'startTwoPointTry') return startTwoPointTry(state, action);
  if (action.type === 'placeKick') return placeKick(state, action);
  if (action.type === 'kick' && action.kind === 'extraPoint') return extraPointKick(state, action);
  if (action.type === 'kick' && action.kind === 'kickoff') return kickoff(state, action);
  if (state.phase !== 'live' && state.phase !== 'kickReturn') throw new Error(`Cannot apply ${action.type} while phase is ${state.phase}`);

  switch (action.type) {
    case 'move':
      return movePiece(state, action.pieceId, action.to, action);
    case 'powerMove':
      if (state.phase !== 'live') throw new Error('Power moves are only legal during normal live play');
      return powerMove(state, action);
    case 'pass':
      if (state.phase !== 'live') throw new Error('Passes are only legal during normal live play');
      return passBall(state, action);
    case 'handoff':
      if (state.phase !== 'live') throw new Error('Handoffs are only legal during normal live play');
      return handoff(state, action.fromId, action.toId, action);
    case 'kick':
      if (state.phase !== 'live') throw new Error('Kicks are only legal during normal live play');
      return kick(state, action);
    case 'tackle':
      return tackle(state, action);
    case 'recover':
      return recover(state, action.pieceId, action);
    default:
      return assertNever(action);
  }
}

export function startNextDown(state: GameState): GameState {
  if (state.phase !== 'betweenDowns') throw new Error('Can only start a new down after a stopped play');
  const result = state.play.result;
  if (result?.type === 'touchdown') throw new Error('Touchdown requires a conversion choice before kickoff');
  const scoringOrTurnover =
    result?.type === 'fieldGoal' ||
    result?.type === 'extraPoint' ||
    result?.type === 'twoPoint' ||
    result?.type === 'punt' ||
    result?.type === 'kickoff' ||
    result?.type === 'touchback' ||
    result?.type === 'kickOutOfBounds' ||
    result?.type === 'kickTouched' ||
    result?.type === 'safety' ||
    result?.type === 'interception' ||
    result?.type === 'turnoverOnDowns';
  const completedDriveState = driveCompletes(result) ? markDriveComplete(state) : state;
  const quarterState = maybeAdvanceQuarter(completedDriveState);
  if (quarterState.phase === 'kickoff' || quarterState.phase === 'final') return quarterState;
  const postScoreKickingTeam = nextKickoffTeam(result);
  if (postScoreKickingTeam) {
    const postScoreReceivingTeam = otherTeam(postScoreKickingTeam);
    return {
      ...quarterState,
      phase: 'kickoff',
      possession: postScoreKickingTeam,
      direction: directionFor(postScoreKickingTeam),
      turn: postScoreKickingTeam,
      down: 1,
      lineOfScrimmage: ownYardLineColumn(postScoreKickingTeam, 35),
      firstDownLine: ownYardLineColumn(postScoreReceivingTeam, 40),
      pieces: kickoffFormationPieces(postScoreKickingTeam),
      ball: { kind: 'controlled', pieceId: `${postScoreKickingTeam}-qb` },
      pendingKick: undefined,
      play: { actions: [] },
    };
  }

  const nextPossession = scoringOrTurnover &&
    result?.type !== 'interception' &&
    result?.type !== 'turnoverOnDowns' &&
    result?.type !== 'punt' &&
    result?.type !== 'kickoff' &&
    result?.type !== 'touchback' &&
    result?.type !== 'kickOutOfBounds' &&
    result?.type !== 'kickTouched' &&
    !(result?.type === 'fieldGoal' && !result.good)
    ? otherTeam(state.possession)
    : state.possession;
  const direction = directionFor(nextPossession);
  const lineOfScrimmage = result?.type === 'kickoff'
    ? clamp(state.lineOfScrimmage, FIELD_START, FIELD_END)
    : result?.type === 'touchback' || result?.type === 'kickOutOfBounds' || result?.type === 'kickTouched'
      ? clamp(state.lineOfScrimmage, FIELD_START, FIELD_END)
    : result?.type === 'fieldGoal' && !result.good
      ? clamp(state.lineOfScrimmage, FIELD_START, FIELD_END)
    : scoringOrTurnover ? (direction === 1 ? 6 : 17) : clamp(state.lineOfScrimmage, FIELD_START, FIELD_END);

  return {
    ...quarterState,
    phase: 'formation',
    possession: nextPossession,
    direction,
    turn: nextPossession,
    down: scoringOrTurnover ? 1 : state.down,
    pieces: formationPieces(nextPossession, lineOfScrimmage, state.formation),
    lineOfScrimmage,
    firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
    forwardPassUsed: false,
    formationShiftsRemaining: { home: 2, away: 2 },
    formationConfirmed: { offense: false, defense: false },
    ball: { kind: 'controlled', pieceId: `${nextPossession}-qb` },
    conversion: undefined,
    pendingKick: undefined,
    play: { actions: [] },
  };
}

function makeTeam(team: Team, coords: Record<string, Coord>): Piece[] {
  const roles: Array<[string, Role, string]> = [
    ['qb', 'qb', 'QB/FS'],
    ['rb', 'rb', 'RB/MLB'],
    ['fb', 'fb', 'FB/OLB'],
    ['wr1', 'wr', 'WR/CB'],
    ['wr2', 'wr', 'WR/CB'],
    ['te', 'te', 'TE/SS'],
    ['ol1', 'ol', 'OL/DL'],
    ['ol2', 'ol', 'OL/DL'],
    ['ol3', 'ol', 'OL/DL'],
    ['ol4', 'ol', 'OL/DL'],
    ['ol5', 'ol', 'OL/DL'],
  ];

  return roles.map(([key, role, label]) => ({
    id: `${team}-${key}`,
    team,
    role,
    label,
    coord: coords[key],
  }));
}

function formationPieces(possession: Team, lineOfScrimmage: number, formation: GameState['formation']): Piece[] {
  const direction = directionFor(possession);
  const defense = otherTeam(possession);
  return [
    ...makeTeam(possession, projectFormation(lineOfScrimmage, direction, formation.offense)),
    ...makeTeam(defense, projectFormation(lineOfScrimmage, direction, formation.defense)),
  ];
}

function kickoffFormationPieces(kickingTeam: Team): Piece[] {
  const receivingTeam = otherTeam(kickingTeam);
  return [
    ...makeTeam(kickingTeam, kickoffCoverageCoords(kickingTeam)),
    ...makeTeam(receivingTeam, kickoffReturnCoords(receivingTeam)),
  ];
}

function kickoffCoverageCoords(team: Team): Record<string, Coord> {
  const kickerX = ownYardLineColumn('home', 35) - 1;
  const coverageX = kickerX - 1;
  const homeCoords = {
    wr1: { x: coverageX, y: 0 },
    ol1: { x: coverageX, y: 1 },
    te: { x: coverageX, y: 2 },
    ol2: { x: coverageX, y: 3 },
    fb: { x: coverageX, y: 4 },
    qb: { x: kickerX, y: 5 },
    rb: { x: coverageX, y: 6 },
    ol3: { x: coverageX, y: 7 },
    ol4: { x: coverageX, y: 8 },
    ol5: { x: coverageX, y: 9 },
    wr2: { x: coverageX, y: 10 },
  };

  return team === 'home' ? homeCoords : mirrorFormationCoords(homeCoords);
}

function kickoffReturnCoords(team: Team): Record<string, Coord> {
  const setupX = ownYardLineColumn('home', 35);
  const deepX = ownYardLineColumn('home', 15);
  const homeCoords = {
    ol1: { x: setupX, y: 1 },
    ol2: { x: setupX, y: 3 },
    ol3: { x: setupX, y: 5 },
    ol4: { x: setupX, y: 7 },
    ol5: { x: setupX, y: 9 },
    fb: { x: setupX, y: 2 },
    te: { x: setupX, y: 8 },
    qb: { x: setupX, y: 4 },
    rb: { x: setupX, y: 6 },
    wr1: { x: deepX, y: 2 },
    wr2: { x: deepX, y: 8 },
  };

  return team === 'home' ? homeCoords : mirrorFormationCoords(homeCoords);
}

function ownYardLineColumn(team: Team, yardsFromOwnGoal: number): number {
  const columnsFromOwnGoal = Math.round(yardsFromOwnGoal / 5);
  return team === 'home'
    ? clamp(FIELD_START + columnsFromOwnGoal, FIELD_START, FIELD_END)
    : clamp(RIGHT_END_ZONE_START - columnsFromOwnGoal, FIELD_START, FIELD_END);
}

function mirrorFormationCoords(coords: Record<string, Coord>): Record<string, Coord> {
  return Object.fromEntries(
    Object.entries(coords).map(([key, coord]) => [key, { x: WIDTH - 1 - coord.x, y: coord.y }]),
  );
}

function projectFormation(lineOfScrimmage: number, direction: Direction, formation: Formation): Record<string, Coord> {
  const bounds = formationSideBounds(lineOfScrimmage, direction, formation.side);
  const occupiedCoords = new Set<string>();

  return Object.fromEntries(
    Object.entries(formation.positions).map(([key, coord]) => {
      const desired = {
        x: clamp(lineOfScrimmage + coord.x * direction, bounds.min, bounds.max),
        y: clamp(coord.y, 0, HEIGHT - 1),
      };
      const projected = nearestOpenFormationCoord(desired, bounds, occupiedCoords);
      occupiedCoords.add(coordKey(projected));
      return [key, projected];
    }),
  );
}

function formationSideBounds(lineOfScrimmage: number, direction: Direction, side: FormationSide): { min: number; max: number } {
  if (side === 'offense') {
    return direction === 1
      ? { min: 0, max: clamp(lineOfScrimmage, 0, WIDTH - 1) }
      : { min: clamp(lineOfScrimmage, 0, WIDTH - 1), max: WIDTH - 1 };
  }

  return direction === 1
    ? { min: clamp(lineOfScrimmage + 1, 0, WIDTH - 1), max: WIDTH - 1 }
    : { min: 0, max: clamp(lineOfScrimmage - 1, 0, WIDTH - 1) };
}

function nearestOpenFormationCoord(desired: Coord, bounds: { min: number; max: number }, occupiedCoords: Set<string>): Coord {
  const xCandidates = Array.from({ length: bounds.max - bounds.min + 1 }, (_, index) => bounds.min + index)
    .sort((a, b) => Math.abs(a - desired.x) - Math.abs(b - desired.x));
  const yCandidates = Array.from({ length: HEIGHT }, (_, y) => y)
    .sort((a, b) => Math.abs(a - desired.y) - Math.abs(b - desired.y));

  for (const y of yCandidates) {
    for (const x of xCandidates) {
      const coord = { x, y };
      if (!occupiedCoords.has(coordKey(coord))) return coord;
    }
  }

  return desired;
}

function chooseFormation(state: GameState, action: Extract<Action, { type: 'chooseFormation' }>): GameState {
  if (state.phase !== 'formation') throw new Error('Formations can only be chosen before the snap');
  if (state.formationConfirmed[action.side]) throw new Error(`${action.side} formation is already confirmed`);
  const formation = findFormation(action.side, action.formationId);
  const nextFormation = { ...state.formation, [action.side]: formation };
  const nextPossessionPieces = formationPieces(state.possession, state.lineOfScrimmage, nextFormation);
  const resetTeam = action.side === 'offense' ? state.possession : otherTeam(state.possession);

  return {
    ...state,
    formation: nextFormation,
    pieces: nextPossessionPieces,
    formationConfirmed: {
      ...state.formationConfirmed,
      [action.side]: false,
    },
    formationShiftsRemaining: {
      ...state.formationShiftsRemaining,
      [resetTeam]: 2,
    },
    ball: { kind: 'controlled', pieceId: `${state.possession}-qb` },
    play: appendAction(state, action),
  };
}

function confirmFormation(state: GameState, action: Extract<Action, { type: 'confirmFormation' }>): GameState {
  if (state.phase !== 'formation') throw new Error('Formations can only be confirmed before the snap');
  return {
    ...state,
    formationConfirmed: {
      ...state.formationConfirmed,
      [action.side]: true,
    },
    play: appendAction(state, action),
  };
}

function findFormation(side: FormationSide, formationId: string): Formation {
  const formations = side === 'offense' ? offensiveFormations : defensiveFormations;
  const formation = formations.find((item) => item.id === formationId);
  if (!formation) throw new Error(`Unknown ${side} formation ${formationId}`);
  return formation;
}

function coinToss(state: GameState, action: Extract<Action, { type: 'coinToss' }>): GameState {
  if (state.phase !== 'coinToss') throw new Error('Coin toss is only legal before kickoff');
  if (state.coinToss.winner) throw new Error('Coin toss already resolved');
  const result = action.result ?? defaultCoinFlip();
  const winner = result === 'heads' ? 'home' : 'away';

  return {
    ...state,
    turn: winner,
    coinToss: { winner, result },
    play: appendAction(state, { ...action, result }),
  };
}

function chooseKickoffChoice(state: GameState, action: Extract<Action, { type: 'chooseKickoffChoice' }>): GameState {
  if (state.phase !== 'coinToss') throw new Error('Kickoff choice is only legal after the coin toss');
  if (state.coinToss.winner !== action.team) throw new Error('Only the coin toss winner may choose');
  const kickingTeam = action.choice === 'kick' ? action.team : otherTeam(action.team);
  const receivingTeam = otherTeam(kickingTeam);

  return {
    ...state,
    phase: 'kickoff',
    possession: kickingTeam,
    direction: directionFor(kickingTeam),
    turn: kickingTeam,
    openingKickoffTeam: kickingTeam,
    coinToss: { ...state.coinToss, choice: action.choice },
    lineOfScrimmage: ownYardLineColumn(kickingTeam, 35),
    firstDownLine: ownYardLineColumn(receivingTeam, 40),
    pieces: kickoffFormationPieces(kickingTeam),
    ball: { kind: 'controlled', pieceId: `${kickingTeam}-qb` },
    play: appendAction(state, action),
  };
}

function snap(state: GameState, action: Action): GameState {
  if (state.phase !== 'formation') throw new Error('Snap is only legal during formation');
  if (!formationsReady(state)) throw new Error('Both formations must be confirmed before the snap');
  return {
    ...state,
    phase: 'live',
    turn: state.possession,
    ball: { kind: 'controlled', pieceId: `${state.possession}-qb` },
    play: appendAction(state, action),
  };
}

function startTwoPointTry(state: GameState, action: Extract<Action, { type: 'startTwoPointTry' }>): GameState {
  if (state.phase !== 'betweenDowns' || state.play.result?.type !== 'touchdown') {
    throw new Error('Two-point tries are only available immediately after a touchdown');
  }
  if (state.play.result.team !== action.team) throw new Error('Only the scoring team may try for two');
  const direction = directionFor(action.team);
  const lineOfScrimmage = conversionLine(action.team);

  return {
    ...state,
    phase: 'formation',
    possession: action.team,
    direction,
    turn: action.team,
    down: 1,
    lineOfScrimmage,
    firstDownLine: lineOfScrimmage,
    forwardPassUsed: false,
    formationConfirmed: { offense: false, defense: false },
    formationShiftsRemaining: { home: 2, away: 2 },
    pieces: formationPieces(action.team, lineOfScrimmage, state.formation),
    ball: { kind: 'controlled', pieceId: `${action.team}-qb` },
    conversion: { team: action.team },
    play: appendAction(state, action),
  };
}

function shift(state: GameState, action: Extract<Action, { type: 'shift' }>): GameState {
  if (state.phase !== 'formation') throw new Error('Shifts are only legal during formation');
  const target = findPiece(state, action.pieceId);
  if (!formationSideConfirmed(state, target)) throw new Error('Formation must be confirmed before shifting');
  if (state.formationShiftsRemaining[target.team] <= 0) throw new Error(`${target.team} has no formation shifts remaining`);
  if (!inBounds(action.to) || occupied(state, action.to, target.id)) throw new Error('Illegal formation shift target');
  if (!staysOnFormationSide(state, target, action.to)) throw new Error('Cannot cross the line of scrimmage before the snap');

  return {
    ...state,
    pieces: state.pieces.map((piece) => (piece.id === target.id ? { ...piece, coord: action.to } : piece)),
    formationShiftsRemaining: {
      ...state.formationShiftsRemaining,
      [target.team]: state.formationShiftsRemaining[target.team] - 1,
    },
    play: appendAction(state, action),
  };
}

function movePiece(state: GameState, pieceId: string, to: Coord, action: Action): GameState {
  const piece = findPiece(state, pieceId);
  if (piece.team !== state.turn) throw new Error('Cannot move the other team on this turn');
  if (!legalMovesForPiece(state, piece).some((coord) => sameCoord(coord, to))) throw new Error('Illegal move');

  const nextState = {
    ...state,
    pieces: state.pieces.map((item) => (item.id === pieceId ? { ...item, coord: to } : item)),
    play: appendAction(state, action),
  };

  if (state.phase === 'kickReturn' && state.ball.kind === 'loose' && sameCoord(to, state.ball.coord)) {
    if (piece.team === state.pendingKick?.receivingTeam) {
      return alternateTurn({
        ...nextState,
        ball: { kind: 'controlled', pieceId },
      });
    }

    const receivingTeam = state.pendingKick?.receivingTeam ?? otherTeam(piece.team);
    const direction = directionFor(receivingTeam);
    const lineOfScrimmage = clamp(to.x, FIELD_START, FIELD_END);
    return endPlay({
      ...nextState,
      possession: receivingTeam,
      direction,
      turn: receivingTeam,
      down: 1,
      lineOfScrimmage,
      firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
      ball: { kind: 'controlled', pieceId: `${receivingTeam}-qb` },
    }, { type: 'kickTouched', team: piece.team, receivingTeam, at: to });
  }

  if (state.ball.kind === 'controlled' && state.ball.pieceId === pieceId) {
    if (fieldZone(to) === 'out') return endPlay(nextState, { type: 'outOfBounds', at: to });
    if (isTouchdownSquare(to, state.direction)) {
      if (state.conversion) return madeTwoPoint(nextState);
      return endPlay(addScore(nextState, state.possession, 6), { type: 'touchdown', team: state.possession });
    }
  }

  return alternateTurn(nextState);
}

function powerMove(state: GameState, action: Extract<Action, { type: 'powerMove' }>): GameState {
  const piece = findPiece(state, action.pieceId);
  if (piece.team !== state.turn) throw new Error('Cannot move the other team on this turn');
  if (!legalPowerMovesForPiece(state, piece).some((coord) => sameCoord(coord, action.to))) throw new Error('Illegal power move');

  const roll = action.roll ?? defaultRoll();
  const contact = powerMoveContact(state, piece, action.to);
  const result = rollResult(roll, powerMoveRequired(contact), contact.distance);
  const rolledAction = { ...action, roll };
  const withAction = { ...state, play: appendAction(state, rolledAction) };

  if (result.total < result.required) return alternateTurn(withAction);

  const nextState = {
    ...withAction,
    pieces: withAction.pieces.map((item) => (item.id === piece.id ? { ...item, coord: action.to } : item)),
  };

  if (state.ball.kind === 'controlled' && state.ball.pieceId === piece.id) {
    if (fieldZone(action.to) === 'out') return endPlay(nextState, { type: 'outOfBounds', at: action.to });
    if (isTouchdownSquare(action.to, state.direction)) {
      if (state.conversion) return madeTwoPoint(nextState);
      return endPlay(addScore(nextState, state.possession, 6), { type: 'touchdown', team: state.possession });
    }
  }

  return alternateTurn(nextState);
}

function passBall(state: GameState, action: Extract<Action, { type: 'pass' }>): GameState {
  const passer = findPiece(state, action.passerId);
  const receiver = findPiece(state, action.receiverId);
  if (passer.team !== state.possession || passer.team !== state.turn) throw new Error('Only the offense may pass on its turn');
  if (state.ball.kind !== 'controlled' || state.ball.pieceId !== passer.id) throw new Error('Passer does not control the ball');
  const target = receiver.coord;
  const forward = state.direction === 1 ? target.x > passer.coord.x : target.x < passer.coord.x;
  if (forward && state.forwardPassUsed) throw new Error('Forward pass already used this down');
  if (!canLegallyPassToReceiver(state, passer, receiver)) throw new Error('Illegal pass receiver');
  if (forward && (state.direction === 1 ? passer.coord.x > state.lineOfScrimmage : passer.coord.x < state.lineOfScrimmage)) {
    throw new Error('Forward pass must start behind the line of scrimmage');
  }
  const roll = action.roll ?? defaultPassRoll();
  const distance = gridDistance(passer.coord, target);
  const result = rollResult(roll, passRequired(distance), distance);
  const rolledAction = { ...action, roll };
  const withPassUsed = {
    ...state,
    forwardPassUsed: state.forwardPassUsed || forward,
    play: appendAction(state, rolledAction),
  };

  if (result.total === 2) {
    const interceptor = interceptionCandidate(state, receiver.coord);
    if (interceptor) {
      if (state.conversion) return failedTwoPoint(withPassUsed);
      const lineOfScrimmage = lineInFrontOfBall({ ...withPassUsed, direction: directionFor(interceptor.team) }, target);
      const interceptedState = {
        ...withPassUsed,
        possession: interceptor.team,
        direction: directionFor(interceptor.team),
        turn: interceptor.team,
        down: 1 as const,
        lineOfScrimmage,
        firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * directionFor(interceptor.team), FIELD_START, FIELD_END),
        pieces: withPassUsed.pieces.map((piece) => (piece.id === interceptor.id ? { ...piece, coord: target } : piece)),
        ball: { kind: 'controlled' as const, pieceId: interceptor.id },
      };
      return endPlay(interceptedState, { type: 'interception', team: interceptor.team, roll: result });
    }
  }

  if (result.total < result.required) {
    if (state.conversion) return failedTwoPoint(withPassUsed);
    if (state.down === 4) {
      return endPlay(
        {
          ...withPassUsed,
          possession: otherTeam(state.possession),
          direction: directionFor(otherTeam(state.possession)),
          turn: otherTeam(state.possession),
        },
        { type: 'turnoverOnDowns', team: otherTeam(state.possession) },
      );
    }
    return endPlay(
      { ...withPassUsed, down: (state.down + 1) as GameState['down'] },
      { type: 'incomplete', at: target, roll: result },
    );
  }

  const completedState = {
    ...withPassUsed,
    ball: { kind: 'controlled' as const, pieceId: receiver.id },
  };

  if (isTouchdownSquare(target, state.direction)) {
    if (state.conversion) return madeTwoPoint(completedState);
    return endPlay(addScore(completedState, state.possession, 6), { type: 'touchdown', team: state.possession });
  }

  return alternateTurn(completedState);
}

function interceptionCandidate(state: GameState, receiverCoord: Coord): Piece | undefined {
  return state.pieces
    .filter((piece) => piece.team !== state.possession)
    .filter((piece) => gridDistance(piece.coord, receiverCoord) <= 1)
    .sort((a, b) => catchPriority(b.role) - catchPriority(a.role))[0];
}

function extraPointKick(state: GameState, action: Extract<Action, { type: 'kick' }>): GameState {
  if (state.phase !== 'betweenDowns' || state.play.result?.type !== 'touchdown') {
    throw new Error('Extra points are only available immediately after a touchdown');
  }
  if (action.kind !== 'extraPoint') throw new Error('Expected an extra point kick');
  const scoringTeam = state.play.result.team;
  const kicker = findPiece(state, action.kickerId);
  if (kicker.team !== scoringTeam) throw new Error('Extra point kicker must be on the scoring team');
  const roll = action.roll ?? defaultRoll();
  const result = rollResult(roll, 5, 0);
  const good = result.total >= result.required;
  const scored = good ? addScore(state, scoringTeam, 1) : state;

  return endPlay(
    { ...scored, play: appendAction(state, { ...action, roll }) },
    { type: 'extraPoint', team: scoringTeam, good, roll: result },
  );
}

function kickoff(state: GameState, action: Extract<Action, { type: 'kick' }>): GameState {
  if (state.phase !== 'kickoff') throw new Error('Kickoff is only legal during kickoff phase');
  const kicker = findPiece(state, action.kickerId);
  if (kicker.team !== state.turn) throw new Error('Kickoff requires the kicking team on turn');
  const receivingTeam = otherTeam(kicker.team);
  const roll = action.roll ?? defaultRoll();
  const distance = kickoffDistance(roll);

  return {
    ...state,
    phase: 'kickPlacement',
    pendingKick: {
      kind: 'kickoff',
      kickingTeam: kicker.team,
      receivingTeam,
      from: kicker.coord,
      distance,
      roll,
    },
    play: appendAction(state, { ...action, roll }),
  };
}

function placeKick(state: GameState, action: Extract<Action, { type: 'placeKick' }>): GameState {
  if (state.phase !== 'kickPlacement' || !state.pendingKick) throw new Error('Kick placement is only legal after a kick roll');
  if (!legalKickPlacements(state).some((coord) => sameCoord(coord, action.at))) throw new Error('Kick landing square is outside the rolled range');
  const pending = state.pendingKick;
  const receivingTeam = pending.receivingTeam;
  const direction = directionFor(receivingTeam);
  const deadSpot = fieldZone(action.at) === 'out'
    ? clamp(action.at.x, FIELD_START, FIELD_END)
    : touchbackSpot(receivingTeam);

  if (fieldZone(action.at) === 'out') {
    return endPlay({
      ...state,
      possession: receivingTeam,
      direction,
      turn: receivingTeam,
      down: 1,
      lineOfScrimmage: deadSpot,
      firstDownLine: clamp(deadSpot + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
      ball: { kind: 'controlled', pieceId: `${receivingTeam}-qb` },
      play: appendAction(state, action),
    }, { type: 'kickOutOfBounds', team: pending.kickingTeam, receivingTeam, at: { x: deadSpot, y: action.at.y } });
  }

  if (fieldZone(action.at) !== 'field') {
    return endPlay({
      ...state,
      possession: receivingTeam,
      direction,
      turn: receivingTeam,
      down: 1,
      lineOfScrimmage: deadSpot,
      firstDownLine: clamp(deadSpot + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
      ball: { kind: 'controlled', pieceId: `${receivingTeam}-qb` },
      play: appendAction(state, action),
    }, { type: 'touchback', team: receivingTeam, at: { x: deadSpot, y: action.at.y } });
  }

  return {
    ...state,
    phase: 'kickReturn',
    possession: receivingTeam,
    direction,
    turn: receivingTeam,
    down: 1,
    lineOfScrimmage: clamp(action.at.x, FIELD_START, FIELD_END),
    firstDownLine: clamp(action.at.x + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
    ball: { kind: 'loose', coord: action.at },
    play: appendAction(state, action),
  };
}

function handoff(state: GameState, fromId: string, toId: string, action: Action): GameState {
  const from = findPiece(state, fromId);
  const to = findPiece(state, toId);
  if (from.team !== state.turn || to.team !== state.turn || from.team !== to.team) throw new Error('Handoff requires same-team pieces on turn');
  if (state.ball.kind !== 'controlled' || state.ball.pieceId !== fromId) throw new Error('Handoff source does not control the ball');
  if (!adjacent(from.coord, to.coord)) throw new Error('Handoff requires adjacency');

  return alternateTurn({
    ...state,
    ball: { kind: 'controlled', pieceId: toId },
    play: appendAction(state, action),
  });
}

function kick(state: GameState, action: Extract<Action, { type: 'kick' }>): GameState {
  const kicker = findPiece(state, action.kickerId);
  if (kicker.team !== state.possession || kicker.team !== state.turn) throw new Error('Only the offense may kick on its turn');
  if (state.ball.kind !== 'controlled' || state.ball.pieceId !== kicker.id) throw new Error('Kicker must control the ball');
  if (action.kind === 'fieldGoal') {
    const ballAt = kicker.coord;
    const distance = fieldGoalDistance(state, ballAt);
    const roll = action.roll ?? defaultRoll();
    const result = rollResult(roll, fieldGoalRequired(distance), distance);
    const good = result.total >= result.required;
    const scored = good ? addScore(state, state.possession, 3) : state;
    const nextState = good
      ? scored
      : {
        ...scored,
        possession: otherTeam(state.possession),
        direction: directionFor(otherTeam(state.possession)),
        turn: otherTeam(state.possession),
        down: 1 as const,
        lineOfScrimmage: clamp(ballAt.x, FIELD_START, FIELD_END),
        firstDownLine: clamp(clamp(ballAt.x, FIELD_START, FIELD_END) + FIRST_DOWN_COLUMNS * directionFor(otherTeam(state.possession)), FIELD_START, FIELD_END),
        ball: { kind: 'controlled' as const, pieceId: `${otherTeam(state.possession)}-qb` },
      };
    return endPlay({ ...nextState, play: appendAction(state, { ...action, roll }) }, { type: 'fieldGoal', team: state.possession, good, roll: result });
  }

  if (action.kind === 'punt') {
    const receivingTeam = otherTeam(kicker.team);
    const roll = action.roll ?? defaultRoll();
    const distance = puntDistance(roll);

    return {
      ...state,
      phase: 'kickPlacement',
      pendingKick: {
        kind: 'punt',
        kickingTeam: kicker.team,
        receivingTeam,
        from: kicker.coord,
        distance,
        roll,
      },
      play: appendAction(state, { ...action, roll }),
    };
  }

  return recordAndAlternate(state, action);
}

function tackle(state: GameState, action: Extract<Action, { type: 'tackle' }>): GameState {
  const defender = findPiece(state, action.defenderId);
  const target = findPiece(state, action.targetId);
  if (defender.team !== state.turn || target.team === defender.team) throw new Error('Tackle requires active defender and opposing target');
  if (state.ball.kind !== 'controlled' || state.ball.pieceId !== target.id) throw new Error('Target does not control the ball');
  const approach = tackleApproach(state, defender, target);
  if (approach.distance > tackleRange(state, defender)) throw new Error('Tackle target is out of range');
  if (!approach.legal) throw new Error('Tackle path is blocked');

  const roll = action.roll ?? defaultRoll();
  const result = rollResult(roll, tackleRequired(approach), approach.distance);
  const rolledAction = { ...action, roll };
  const withAction = { ...state, play: appendAction(state, rolledAction) };
  const carrierZone = fieldZone(target.coord);
  const defenseScoresSafety = carrierZone === ownEndZoneFor(target.team);
  if (defenseScoresSafety && result.total >= result.required) {
    if (state.conversion) return failedTwoPoint(withAction);
    return endPlay(addScore(withAction, defender.team, 2), { type: 'safety', team: defender.team });
  }

  if (result.total === 12) {
    if (state.conversion) return failedTwoPoint(withAction);
    const lineOfScrimmage = lineInFrontOfBall({ ...withAction, direction: directionFor(defender.team) }, target.coord);
    return endPlay(
      {
        ...withAction,
        possession: defender.team,
        direction: directionFor(defender.team),
        turn: defender.team,
        down: 1,
        lineOfScrimmage,
        firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * directionFor(defender.team), FIELD_START, FIELD_END),
        pieces: withAction.pieces.map((piece) => (piece.id === defender.id ? { ...piece, coord: target.coord } : piece)),
        ball: { kind: 'controlled', pieceId: defender.id },
      },
      { type: 'fumble', at: target.coord, recoveredBy: defender.team, roll: result },
    );
  }

  if (result.total >= result.required) {
    if (state.conversion) return failedTwoPoint(withAction);
    return endPlayOrTurnover(withAction, { type: 'tackle', at: target.coord, roll: result }, target.coord);
  }

  return alternateTurn({
    ...withAction,
    pieces: withAction.pieces.map((piece) => (piece.id === defender.id ? { ...piece, coord: missedTackleCoord(state, defender, target) } : piece)),
  });
}

function recover(state: GameState, pieceId: string, action: Action): GameState {
  const piece = findPiece(state, pieceId);
  if (piece.team !== state.turn) throw new Error('Can only recover on your turn');
  if (state.ball.kind !== 'loose') throw new Error('Ball is not loose');
  if (!sameCoord(piece.coord, state.ball.coord)) throw new Error('Recovery requires occupying the loose ball square');
  const recoveryCoord = state.ball.coord;

  if (state.phase === 'kickReturn' && piece.team === state.pendingKick?.receivingTeam) {
    return alternateTurn({
      ...state,
      ball: { kind: 'controlled', pieceId },
      play: appendAction(state, action),
    });
  }

  const possessionChanged = piece.team !== state.possession;
  const direction = directionFor(piece.team);
  const lineOfScrimmage = lineInFrontOfBall({ ...state, direction }, recoveryCoord);

  return endPlay({
    ...state,
    possession: piece.team,
    direction,
    turn: piece.team,
    down: possessionChanged || moveDistanceToFirstDown(state, recoveryCoord) === 0 ? 1 : state.down,
    lineOfScrimmage,
    firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * direction, FIELD_START, FIELD_END),
    ball: { kind: 'controlled', pieceId },
    play: appendAction(state, action),
  }, { type: 'recovery', team: piece.team, at: recoveryCoord });
}

function legalMovesForPiece(state: GameState, piece: Piece): Coord[] {
  const moves: Coord[] = [];
  const add = (coord: Coord) => {
    if (inBounds(coord) && !occupied(state, coord, piece.id)) moves.push(coord);
  };

  if (state.phase === 'kickReturn') {
    const range = movementRange(state, piece, 3);
    for (let dx = -range; dx <= range; dx += 1) {
      for (let dy = -range; dy <= range; dy += 1) {
        if (dx === 0 && dy === 0) continue;
        const coord = { x: piece.coord.x + dx, y: piece.coord.y + dy };
        if (clearPathForMovement(state, piece.coord, coord, piece)) add(coord);
      }
    }
    return moves;
  }

  if (piece.role === 'qb') {
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        if (dx !== 0 || dy !== 0) add({ x: piece.coord.x + dx, y: piece.coord.y + dy });
      }
    }
    return moves;
  }

  if (piece.role === 'ol') {
    for (const [dx, dy] of orthogonalDirections()) add({ x: piece.coord.x + dx, y: piece.coord.y + dy });
    return moves;
  }

  if (piece.role === 'rb') {
    addSliding(moves, state, piece, orthogonalDirections(), movementRange(state, piece, 3), true);
    return moves;
  }

  if (piece.role === 'fb') {
    addSliding(moves, state, piece, orthogonalDirections(), movementRange(state, piece, 2), false);
    return moves;
  }

  if (piece.role === 'wr') {
    addSliding(moves, state, piece, [...orthogonalDirections(), ...diagonalDirections()], movementRange(state, piece, 5), false);
    return moves;
  }

  if (piece.role === 'te') {
    addSliding(moves, state, piece, [...orthogonalDirections(), ...diagonalDirections()], movementRange(state, piece, 3), false);
    return moves;
  }

  return moves;
}

function tackleRange(state: GameState, piece: Piece): number {
  if (state.phase === 'kickReturn') return movementRange(state, piece, 3);
  return movementRange(state, piece, baseMovementRange(piece.role));
}

function canAttemptTackle(state: GameState, defender: Piece, target: Piece): boolean {
  const approach = tackleApproach(state, defender, target);
  return approach.distance <= tackleRange(state, defender) && approach.legal;
}

function tackleApproach(state: GameState, defender: Piece, target: Piece): { distance: number; blockers: number; legal: boolean } {
  const blockers = lineSquares(defender.coord, target.coord)
    .slice(1, -1)
    .map((coord) => pieceAt(state, coord, defender.id))
    .filter((piece): piece is Piece => Boolean(piece && piece.team !== defender.team)).length;

  return {
    distance: gridDistance(defender.coord, target.coord),
    blockers,
    legal: blockers === 0 || canPowerTackle(defender),
  };
}

function canPowerTackle(piece: Piece): boolean {
  return piece.role === 'rb' || piece.role === 'fb' || piece.role === 'ol';
}

function baseMovementRange(role: Role): number {
  if (role === 'qb' || role === 'ol') return 1;
  if (role === 'fb') return 2;
  if (role === 'rb' || role === 'te') return 3;
  return 5;
}

function defaultRoll(): DiceRoll {
  return { die1: 3, die2: 4 };
}

function defaultCoinFlip() {
  return 'heads' as const;
}

function defaultPassRoll(): DiceRoll {
  return { die1: 6, die2: 6 };
}

function rollResult(roll: DiceRoll, required: number, distance: number): RollResult {
  return {
    roll,
    total: roll.die1 + roll.die2,
    required,
    distance,
  };
}

function passRequired(distance: number): number {
  return 5 + Math.ceil(distance / 2);
}

function tackleRequired(approach: { distance: number; blockers: number }): number {
  if (approach.blockers > 0) return 8 + approach.distance + approach.blockers;
  return 5 + approach.distance;
}

function fieldGoalRequired(distance: number): number {
  return 5 + Math.ceil(distance / 2);
}

function fieldGoalDistance(state: GameState, ballAt: Coord): number {
  return Math.max(0, state.direction === 1 ? RIGHT_END_ZONE_START - ballAt.x : ballAt.x - (FIELD_START - 1));
}

function kickoffDistance(roll: DiceRoll): number {
  return roll.die1 + roll.die2;
}

function puntDistance(roll: DiceRoll): number {
  return roll.die1 + roll.die2;
}

function legalKickPlacements(state: GameState): Coord[] {
  const pending = state.pendingKick;
  if (!pending) return [];
  const direction = directionFor(pending.kickingTeam);
  const landingX = clamp(pending.from.x + pending.distance * direction, 0, WIDTH - 1);
  const placements: Coord[] = [];

  for (let y = 0; y < HEIGHT; y += 1) {
    placements.push({ x: landingX, y });
  }

  return placements;
}

function markDriveComplete(state: GameState): GameState {
  return {
    ...state,
    drivesThisQuarter: {
      ...state.drivesThisQuarter,
      [state.possession]: Math.min(DRIVES_PER_TEAM_PER_QUARTER, state.drivesThisQuarter[state.possession] + 1),
    },
  };
}

function maybeAdvanceQuarter(state: GameState): GameState {
  const quarterComplete = state.drivesThisQuarter.home >= DRIVES_PER_TEAM_PER_QUARTER &&
    state.drivesThisQuarter.away >= DRIVES_PER_TEAM_PER_QUARTER;
  if (!quarterComplete) return state;
  if (state.quarter === 4) return { ...state, phase: 'final' };

  const nextQuarter = (state.quarter + 1) as GameState['quarter'];
  if (nextQuarter === 3) {
    const halftimeKickingTeam = otherTeam(state.openingKickoffTeam);
    const halftimeReceivingTeam = otherTeam(halftimeKickingTeam);
    return {
      ...state,
      quarter: nextQuarter,
      phase: 'kickoff',
      possession: halftimeKickingTeam,
      turn: halftimeKickingTeam,
      direction: directionFor(halftimeKickingTeam),
      drivesThisQuarter: { home: 0, away: 0 },
      down: 1,
      lineOfScrimmage: ownYardLineColumn(halftimeKickingTeam, 35),
      firstDownLine: ownYardLineColumn(halftimeReceivingTeam, 40),
      pieces: kickoffFormationPieces(halftimeKickingTeam),
      play: { actions: [] },
      ball: { kind: 'controlled', pieceId: `${halftimeKickingTeam}-qb` },
    };
  }

  return {
    ...state,
    quarter: nextQuarter,
    drivesThisQuarter: { home: 0, away: 0 },
  };
}

function nextKickoffTeam(result: PlayResult | undefined): Team | undefined {
  if (!result) return undefined;
  if (result.type === 'fieldGoal') return result.good ? result.team : undefined;
  if (result.type === 'extraPoint' || result.type === 'twoPoint') return result.team;
  if (result.type === 'safety') return otherTeam(result.team);
  return undefined;
}

function driveCompletes(result: PlayResult | undefined): boolean {
  if (!result) return false;
  return result.type === 'touchdown' ||
    result.type === 'fieldGoal' ||
    result.type === 'extraPoint' ||
    result.type === 'twoPoint' ||
    result.type === 'punt' ||
    result.type === 'safety' ||
    result.type === 'interception' ||
    result.type === 'turnoverOnDowns' ||
    result.type === 'touchback' ||
    result.type === 'kickOutOfBounds' ||
    result.type === 'kickTouched' ||
    result.type === 'fumble' && result.recoveredBy !== undefined;
}

function touchbackSpot(team: Team): number {
  return ownYardLineColumn(team, 25);
}

function conversionLine(team: Team): number {
  return team === 'home' ? FIELD_END : FIELD_START;
}

function missedTackleCoord(state: GameState, defender: Piece, target: Piece): Coord {
  const dx = Math.sign(target.coord.x - defender.coord.x);
  const dy = Math.sign(target.coord.y - defender.coord.y);
  const next = { x: defender.coord.x + dx, y: defender.coord.y + dy };
  if (!inBounds(next) || sameCoord(next, target.coord) || occupied(state, next, defender.id)) return defender.coord;
  return next;
}

function addSliding(
  moves: Coord[],
  state: GameState,
  piece: Piece,
  directions: Array<[number, number]>,
  range: number,
  allowOneTurn: boolean,
) {
  for (const [dx, dy] of directions) {
    for (let step = 1; step <= range; step += 1) {
      const coord = { x: piece.coord.x + dx * step, y: piece.coord.y + dy * step };
      if (!inBounds(coord)) break;
      const blocker = pieceAt(state, coord, piece.id);
      if (blocker?.team === piece.team) continue;
      if (blocker) break;
      moves.push(coord);
    }
  }

  if (!allowOneTurn) return;

  for (const [dx1, dy1] of orthogonalDirections()) {
    for (let first = 1; first < range; first += 1) {
      const corner = { x: piece.coord.x + dx1 * first, y: piece.coord.y + dy1 * first };
      if (!inBounds(corner)) break;
      const cornerBlocker = pieceAt(state, corner, piece.id);
      if (cornerBlocker?.team === piece.team) continue;
      if (cornerBlocker) break;
      for (const [dx2, dy2] of orthogonalDirections().filter(([dx, dy]) => dx !== -dx1 || dy !== -dy1)) {
        if (dx2 === dx1 && dy2 === dy1) continue;
        const remaining = range - first;
        const coord = { x: corner.x + dx2 * remaining, y: corner.y + dy2 * remaining };
        const destinationBlocker = pieceAt(state, coord, piece.id);
        if (clearPathForMovement(state, corner, coord, piece) && inBounds(coord) && !destinationBlocker) moves.push(coord);
      }
    }
  }
}

function legalPowerMovesForPiece(state: GameState, piece: Piece): Coord[] {
  if (!canPowerMove(piece)) return [];
  const moves: Coord[] = [];
  const range = powerMoveRange(state, piece);

  for (const [dx, dy] of orthogonalDirections()) {
    let contacted = false;
    for (let step = 1; step <= range; step += 1) {
      const coord = { x: piece.coord.x + dx * step, y: piece.coord.y + dy * step };
      if (!inBounds(coord)) break;
      const blocker = pieceAt(state, coord, piece.id);
      if (blocker) {
        if (blocker.team !== piece.team) contacted = true;
        continue;
      }
      if (contacted) moves.push(coord);
    }
  }

  return dedupeCoords(moves);
}

function canPowerMove(piece: Piece): boolean {
  return piece.role === 'rb' || piece.role === 'fb' || piece.role === 'ol';
}

function powerMoveRange(state: GameState, piece: Piece): number {
  if (piece.role === 'ol') return 2;
  return baseMovementRange(piece.role);
}

function powerMoveContact(state: GameState, piece: Piece, to: Coord): { distance: number; contacts: number; enemyContacts: number } {
  const path = lineSquares(piece.coord, to).slice(1, -1);
  const blockers = path
    .map((coord) => pieceAt(state, coord, piece.id))
    .filter((blocker): blocker is Piece => blocker !== undefined && blocker.team !== piece.team);
  return {
    distance: gridDistance(piece.coord, to),
    contacts: blockers.length,
    enemyContacts: blockers.filter((blocker) => blocker.team !== piece.team).length,
  };
}

function powerMoveRequired(contact: { contacts: number; enemyContacts: number }): number {
  return 8 + contact.contacts + contact.enemyContacts;
}

function formationsReady(state: GameState): boolean {
  return state.formationConfirmed.offense && state.formationConfirmed.defense;
}

function shiftActions(state: GameState): LegalAction[] {
  return state.pieces.flatMap((piece) => {
    if (!formationSideConfirmed(state, piece)) return [];
    if (state.formationShiftsRemaining[piece.team] <= 0) return [];
    return orthogonalDirections()
      .map(([dx, dy]) => ({ x: piece.coord.x + dx, y: piece.coord.y + dy }))
      .filter((coord) => inBounds(coord) && !occupied(state, coord, piece.id) && staysOnFormationSide(state, piece, coord))
      .map((to) => ({ type: 'shift' as const, pieceId: piece.id, to }));
  });
}

function formationSideConfirmed(state: GameState, piece: Piece): boolean {
  const side = piece.team === state.possession ? 'offense' : 'defense';
  return state.formationConfirmed[side];
}

function staysOnFormationSide(state: GameState, piece: Piece, coord: Coord): boolean {
  const offense = piece.team === state.possession;
  if (state.direction === 1) {
    return offense ? coord.x <= state.lineOfScrimmage : coord.x > state.lineOfScrimmage;
  }

  return offense ? coord.x >= state.lineOfScrimmage : coord.x < state.lineOfScrimmage;
}

function catchPriority(role: Role): number {
  if (role === 'wr') return 4;
  if (role === 'te') return 3;
  if (role === 'qb') return 2;
  return 1;
}

function lineInFrontOfBall(state: GameState, ballAt: Coord): number {
  return clamp(ballAt.x, FIELD_START, FIELD_END);
}

function endPlayOrTurnover(state: GameState, result: PlayResult, ballAt: Coord): GameState {
  if (state.conversion) return failedTwoPoint(state);
  const lineOfScrimmage = lineInFrontOfBall(state, ballAt);
  const gained = moveDistanceToFirstDown(state, ballAt) === 0;
  if (gained) {
    return endPlay({ ...state, down: 1, lineOfScrimmage, firstDownLine: clamp(lineOfScrimmage + FIRST_DOWN_COLUMNS * state.direction, FIELD_START, FIELD_END) }, result);
  }
  if (state.down === 4) {
    return endPlay(
      {
        ...state,
        possession: otherTeam(state.possession),
        direction: directionFor(otherTeam(state.possession)),
        turn: otherTeam(state.possession),
      },
      { type: 'turnoverOnDowns', team: otherTeam(state.possession) },
    );
  }

  return endPlay({ ...state, down: (state.down + 1) as GameState['down'], lineOfScrimmage }, result);
}

function endPlay(state: GameState, result: PlayResult): GameState {
  return {
    ...state,
    phase: 'betweenDowns',
    pendingKick: undefined,
    play: { ...state.play, result },
  };
}

function madeTwoPoint(state: GameState): GameState {
  const team = state.conversion?.team ?? state.possession;
  return endPlay({ ...addScore(state, team, 2), conversion: undefined }, { type: 'twoPoint', team, good: true });
}

function failedTwoPoint(state: GameState): GameState {
  const team = state.conversion?.team ?? state.possession;
  return endPlay({ ...state, conversion: undefined }, { type: 'twoPoint', team, good: false });
}

function addScore(state: GameState, team: Team, points: number): GameState {
  return { ...state, score: { ...state.score, [team]: state.score[team] + points } };
}

function recordAndAlternate(state: GameState, action: Action): GameState {
  return alternateTurn({ ...state, play: appendAction(state, action) });
}

function alternateTurn(state: GameState): GameState {
  return { ...state, turn: otherTeam(state.turn) };
}

function appendAction(state: GameState, action: Action) {
  return { ...state.play, actions: [...state.play.actions, action] };
}

function carrierPiece(state: GameState): Piece | undefined {
  const ball = state.ball;
  return ball.kind === 'controlled' ? state.pieces.find((piece) => piece.id === ball.pieceId) : undefined;
}

function offenseControlsBall(state: GameState): boolean {
  const carrier = carrierPiece(state);
  return carrier?.team === state.possession;
}

function movementRange(state: GameState, piece: Piece, baseRange: number): number {
  if (state.phase === 'kickReturn') {
    return Math.min(baseRange, piece.team === state.possession ? 2 : 3);
  }
  if (piece.team === state.possession && offenseControlsBall(state)) return Math.max(1, baseRange - 1);
  return baseRange;
}

function findPiece(state: GameState, id: string): Piece {
  const piece = state.pieces.find((item) => item.id === id);
  if (!piece) throw new Error(`Unknown piece ${id}`);
  return piece;
}

function lineSquares(from: Coord, to: Coord): Coord[] {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  if (steps === 0) return [from];
  const squares: Coord[] = [];
  for (let step = 0; step <= steps; step += 1) {
    squares.push({
      x: Math.round(from.x + (dx * step) / steps),
      y: Math.round(from.y + (dy * step) / steps),
    });
  }
  return dedupeCoords(squares);
}

function clearPath(state: GameState, from: Coord, to: Coord, excludeId: string): boolean {
  return lineSquares(from, to).slice(1).every((coord) => !occupied(state, coord, excludeId));
}

function clearPathForMovement(state: GameState, from: Coord, to: Coord, piece: Piece): boolean {
  return lineSquares(from, to).slice(1, -1).every((coord) => {
    const blocker = pieceAt(state, coord, piece.id);
    return !blocker || blocker.team === piece.team;
  });
}

function occupied(state: GameState, coord: Coord, excludeId?: string): boolean {
  return state.pieces.some((piece) => piece.id !== excludeId && sameCoord(piece.coord, coord));
}

function pieceAt(state: GameState, coord: Coord, excludeId?: string): Piece | undefined {
  return state.pieces.find((piece) => piece.id !== excludeId && sameCoord(piece.coord, coord));
}

function inBounds(coord: Coord): boolean {
  return coord.x >= 0 && coord.x < WIDTH && coord.y >= 0 && coord.y < HEIGHT;
}

function sameCoord(a: Coord, b: Coord): boolean {
  return a.x === b.x && a.y === b.y;
}

function adjacent(a: Coord, b: Coord): boolean {
  return chebyshev(a, b) === 1;
}

function chebyshev(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function orthogonalDirections(): Array<[number, number]> {
  return [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
}

function diagonalDirections(): Array<[number, number]> {
  return [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
}

function otherTeam(team: Team): Team {
  return team === 'home' ? 'away' : 'home';
}

function directionFor(team: Team): Direction {
  return team === 'home' ? 1 : -1;
}

function ownEndZoneFor(team: Team): FieldZone {
  return team === 'home' ? 'leftEndZone' : 'rightEndZone';
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function dedupeCoords(coords: Coord[]): Coord[] {
  return coords.filter((coord, index) => coords.findIndex((other) => sameCoord(coord, other)) === index);
}

function coordKey(coord: Coord): string {
  return `${coord.x},${coord.y}`;
}

function assertNever(value: never): never {
  throw new Error(`Unhandled action ${JSON.stringify(value)}`);
}
