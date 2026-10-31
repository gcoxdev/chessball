import { describe, expect, it } from 'vitest';
import {
  applyAction,
  activeRoleCode,
  createGame,
  fieldGoalAttempt,
  fieldZone,
  generateLegalActions,
  isTouchdownSquare,
  moveDistanceToFirstDown,
  offensiveFormations,
  defensiveFormations,
  startNextDown,
  gridDistance,
} from './rules';
import type { Action, Coord, GameState, Piece, PlayResult, Team } from './types';

// Preserve arranged kick spots in resolution tests; setup is tested separately.
const readyKick = (state: GameState, playType: 'fieldGoal' | 'punt'): GameState => ({
  ...state, phase: 'formation', playType, formationConfirmed: { offense: true, defense: true },
});

const piece = (state: ReturnType<typeof createGame>, id: string): Piece => {
  const found = state.pieces.find((item) => item.id === id);
  if (!found) throw new Error(`Missing piece ${id}`);
  return found;
};

const readyFormation = (state = createGame()) => applyAction(
  applyAction(state, { type: 'confirmFormation', side: 'offense' }),
  { type: 'confirmFormation', side: 'defense' },
);
const liveGame = (state = createGame()) => applyAction(readyFormation(state), { type: 'snap' });

const stoppedFor = (
  possession: Team,
  result: PlayResult,
  overrides: Partial<GameState> = {},
) => createGame({
  phase: 'betweenDowns',
  possession,
  direction: possession === 'home' ? 1 : -1,
  turn: possession,
  drivesThisQuarter: { home: 0, away: 0 },
  play: { actions: [], result },
  ...overrides,
});

describe('field geometry', () => {
  it('measures field goals through the end zone to the posts', () => {
    expect(fieldGoalAttempt(1, { x: 17, y: 5 })).toEqual({ distance: 7, yards: 35, required: 9 });
    expect(fieldGoalAttempt(-1, { x: 6, y: 5 })).toEqual({ distance: 7, yards: 35, required: 9 });
    expect(fieldGoalAttempt(1, { x: 21, y: 5 })).toEqual({ distance: 3, yards: 15, required: 7 });
    expect(fieldGoalAttempt(-1, { x: 2, y: 5 })).toEqual({ distance: 3, yards: 15, required: 7 });
  });

  it('counts distance as diagonals first, then straight squares', () => {
    expect(gridDistance({ x: 4, y: 5 }, { x: 7, y: 5 })).toBe(3);
    expect(gridDistance({ x: 4, y: 5 }, { x: 7, y: 8 })).toBe(3);
    expect(gridDistance({ x: 4, y: 5 }, { x: 5, y: 9 })).toBe(4);
  });

  it('classifies end zones and active field columns', () => {
    expect(fieldZone({ x: 0, y: 8 })).toBe('leftEndZone');
    expect(fieldZone({ x: 1, y: 8 })).toBe('leftEndZone');
    expect(fieldZone({ x: 2, y: 8 })).toBe('field');
    expect(fieldZone({ x: 21, y: 8 })).toBe('field');
    expect(fieldZone({ x: 22, y: 8 })).toBe('rightEndZone');
    expect(fieldZone({ x: 23, y: 8 })).toBe('rightEndZone');
    expect(fieldZone({ x: 24, y: 8 })).toBe('out');
  });

  it('models the 50-yard line as the center boundary of a 5-yard grid field', () => {
    const state = createGame();

    expect(state.board.width).toBe(24);
    expect(state.board.height).toBe(11);
    expect(fieldZone({ x: 11, y: 5 })).toBe('field');
    expect(fieldZone({ x: 12, y: 5 })).toBe('field');
  });

  it('tracks first-down progress in 10-yard chunks', () => {
    const state = createGame();

    expect(moveDistanceToFirstDown(state, { x: 5, y: 5 })).toBe(2);
    expect(moveDistanceToFirstDown(state, { x: 6, y: 5 })).toBe(1);
    expect(moveDistanceToFirstDown(state, { x: 7, y: 5 })).toBe(0);
  });

  it('detects touchdowns by possession direction', () => {
    expect(isTouchdownSquare({ x: 22, y: 5 }, 1)).toBe(true);
    expect(isTouchdownSquare({ x: 1, y: 5 }, -1)).toBe(true);
    expect(isTouchdownSquare({ x: 21, y: 5 }, 1)).toBe(false);
  });
});

const formationPositionIds = ['qb', 'rb', 'fb', 'wr1', 'wr2', 'te', 'ol1', 'ol2', 'ol3', 'ol4', 'ol5'];

const existingOffensivePositions = {
  'i-form': {
    qb: { x: -1, y: 5 }, rb: { x: -2, y: 5 }, fb: { x: -1, y: 6 },
    wr1: { x: -1, y: 1 }, wr2: { x: -1, y: 9 }, te: { x: 0, y: 8 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
  shotgun: {
    qb: { x: -2, y: 5 }, rb: { x: -2, y: 6 }, fb: { x: -1, y: 3 },
    wr1: { x: -1, y: 0 }, wr2: { x: -1, y: 10 }, te: { x: 0, y: 8 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
  singleback: {
    qb: { x: -1, y: 5 }, rb: { x: -2, y: 5 }, fb: { x: -1, y: 7 },
    wr1: { x: -1, y: 1 }, wr2: { x: -1, y: 10 }, te: { x: 0, y: 8 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
};

const existingDefensivePositions = {
  '4-3': {
    qb: { x: 5, y: 5 }, rb: { x: 2, y: 5 }, fb: { x: 2, y: 3 },
    wr1: { x: 4, y: 1 }, wr2: { x: 4, y: 9 }, te: { x: 3, y: 7 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 2, y: 7 },
  },
  nickel: {
    qb: { x: 5, y: 5 }, rb: { x: 2, y: 5 }, fb: { x: 2, y: 2 },
    wr1: { x: 4, y: 0 }, wr2: { x: 4, y: 10 }, te: { x: 3, y: 7 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 2, y: 8 },
  },
  'goal-line': {
    qb: { x: 4, y: 5 }, rb: { x: 2, y: 4 }, fb: { x: 2, y: 6 },
    wr1: { x: 3, y: 1 }, wr2: { x: 3, y: 9 }, te: { x: 2, y: 8 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 1, y: 7 },
  },
};

const newOffensivePositions = {
  pistol: {
    qb: { x: -2, y: 5 }, rb: { x: -3, y: 5 }, fb: { x: -1, y: 6 },
    wr1: { x: -1, y: 1 }, wr2: { x: -1, y: 9 }, te: { x: 0, y: 8 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
  trips: {
    qb: { x: -2, y: 5 }, rb: { x: -2, y: 6 }, fb: { x: -1, y: 4 },
    wr1: { x: -1, y: 0 }, wr2: { x: -1, y: 1 }, te: { x: 0, y: 2 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
  power: {
    qb: { x: -1, y: 5 }, rb: { x: -2, y: 5 }, fb: { x: -1, y: 7 },
    wr1: { x: -1, y: 2 }, wr2: { x: -1, y: 9 }, te: { x: 0, y: 8 },
    ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
    ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  },
};

const newDefensivePositions = {
  'bear-front': {
    qb: { x: 5, y: 5 }, rb: { x: 2, y: 5 }, fb: { x: 2, y: 2 },
    wr1: { x: 4, y: 0 }, wr2: { x: 4, y: 10 }, te: { x: 2, y: 8 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 1, y: 7 },
  },
  pressure: {
    qb: { x: 5, y: 5 }, rb: { x: 2, y: 5 }, fb: { x: 1, y: 2 },
    wr1: { x: 4, y: 0 }, wr2: { x: 4, y: 10 }, te: { x: 1, y: 8 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 2, y: 7 },
  },
  'deep-shell': {
    qb: { x: 6, y: 5 }, rb: { x: 2, y: 4 }, fb: { x: 2, y: 6 },
    wr1: { x: 5, y: 0 }, wr2: { x: 5, y: 10 }, te: { x: 5, y: 8 },
    ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
    ol4: { x: 1, y: 6 }, ol5: { x: 2, y: 7 },
  },
};

describe('formation catalog', () => {
  it('exposes the complete ordered catalogs with descriptions', () => {
    expect(offensiveFormations.map((formation) => formation.id)).toEqual([
      'i-form', 'shotgun', 'singleback', 'pistol', 'trips', 'power',
    ]);
    expect(defensiveFormations.map((formation) => formation.id)).toEqual([
      '4-3', 'nickel', 'goal-line', 'bear-front', 'pressure', 'deep-shell',
    ]);
    expect([...offensiveFormations, ...defensiveFormations].every((formation) => formation.description.length > 0)).toBe(true);
  });

  it('defines each source alignment with eleven unique, in-row positions', () => {
    for (const formation of [...offensiveFormations, ...defensiveFormations]) {
      expect(Object.keys(formation.positions)).toEqual(formationPositionIds);
      expect(new Set(Object.values(formation.positions).map(({ x, y }) => `${x},${y}`)).size).toBe(11);
      expect(Object.values(formation.positions).every(({ y }) => y >= 0 && y <= 10)).toBe(true);
    }
  });

  it('preserves the existing source alignments exactly', () => {
    for (const [id, positions] of Object.entries(existingOffensivePositions)) {
      expect(offensiveFormations.find((formation) => formation.id === id)?.positions).toEqual(positions);
    }
    for (const [id, positions] of Object.entries(existingDefensivePositions)) {
      expect(defensiveFormations.find((formation) => formation.id === id)?.positions).toEqual(positions);
    }
  });

  it('defines the six new source alignments exactly', () => {
    for (const [id, positions] of Object.entries(newOffensivePositions)) {
      expect(offensiveFormations.find((formation) => formation.id === id)?.positions).toEqual(positions);
    }
    for (const [id, positions] of Object.entries(newDefensivePositions)) {
      expect(defensiveFormations.find((formation) => formation.id === id)?.positions).toEqual(positions);
    }
  });

  it('projects every new alignment in bounds, without overlap, and on legal sides', () => {
    for (const [side, ids] of [
      ['offense', Object.keys(newOffensivePositions)],
      ['defense', Object.keys(newDefensivePositions)],
    ] as const) {
      for (const formationId of ids) {
        for (const lineOfScrimmage of [2, 5, 21]) {
          for (const [possession, direction] of [['home', 1], ['away', -1]] as const) {
            const initial = createGame({ possession, direction, lineOfScrimmage });
            const state = applyAction(initial, { type: 'chooseFormation', side, formationId });
            const projected = state.pieces.map((item) => item.coord);

            expect(new Set(projected.map(({ x, y }) => `${x},${y}`)).size).toBe(22);
            expect(projected.every(({ x, y }) => x >= 0 && x < state.board.width && y >= 0 && y < state.board.height)).toBe(true);

            for (const item of state.pieces) {
              const isOffense = item.team === possession;
              const isLegalSide = direction === 1
                ? (isOffense ? item.coord.x <= lineOfScrimmage : item.coord.x > lineOfScrimmage)
                : (isOffense ? item.coord.x >= lineOfScrimmage : item.coord.x < lineOfScrimmage);
              expect(isLegalSide).toBe(true);
            }
          }
        }
      }
    }
  });
});

describe('piece movement', () => {
  it('starts in football-shaped formations around the line of scrimmage', () => {
    const state = createGame();

    expect(state.lineOfScrimmage).toBe(5);
    expect(state.firstDownLine).toBe(7);
    expect(piece(state, 'home-ol3').coord).toEqual({ x: state.lineOfScrimmage, y: 5 });
    expect(piece(state, 'home-qb').coord).toEqual({ x: state.lineOfScrimmage - 1, y: 5 });
    expect(piece(state, 'home-rb').coord).toEqual({ x: state.lineOfScrimmage - 2, y: 5 });
    expect(piece(state, 'home-fb').coord).toEqual({ x: state.lineOfScrimmage - 1, y: 6 });
    expect(piece(state, 'away-ol3').coord).toEqual({ x: state.lineOfScrimmage + 1, y: 5 });
    expect(piece(state, 'away-rb').coord).toEqual({ x: state.lineOfScrimmage + 2, y: 5 });
  });

  it('can choose separate offensive and defensive formation presets before the snap', () => {
    let state = createGame();

    state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'shotgun' });
    expect(state.formation.offense.id).toBe('shotgun');
    expect(state.formationConfirmed.offense).toBe(false);
    expect(piece(state, 'home-qb').coord).toEqual({ x: state.lineOfScrimmage - 2, y: 5 });
    expect(piece(state, 'home-rb').coord).toEqual({ x: state.lineOfScrimmage - 2, y: 6 });
    expect(state.formationShiftsRemaining.home).toBe(2);

    state = applyAction(state, { type: 'chooseFormation', side: 'defense', formationId: 'nickel' });
    expect(state.formation.defense.id).toBe('nickel');
    expect(state.formationConfirmed.defense).toBe(false);
    expect(piece(state, 'away-wr1').coord).toEqual({ x: state.lineOfScrimmage + 4, y: 0 });
    expect(piece(state, 'away-qb').coord).toEqual({ x: state.lineOfScrimmage + 5, y: 5 });
    expect(state.formationShiftsRemaining.away).toBe(2);
  });

  it('requires both formations to be confirmed before the snap', () => {
    let state = createGame();

    expect(generateLegalActions(state)).not.toContainEqual({ type: 'snap' });
    expect(() => applyAction(state, { type: 'snap' })).toThrow('confirmed');

    state = applyAction(state, { type: 'confirmFormation', side: 'offense' });
    expect(state.formationConfirmed.offense).toBe(true);
    expect(generateLegalActions(state)).not.toContainEqual({ type: 'snap' });

    expect(generateLegalActions(state)).not.toContainEqual({ type: 'chooseFormation', side: 'offense', formationId: 'shotgun' });
    expect(() => applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'shotgun' })).toThrow('already confirmed');

    state = applyAction(state, { type: 'confirmFormation', side: 'defense' });
    expect(generateLegalActions(state)).toContainEqual({ type: 'snap' });
  });

  it('prevents changing a formation after that side is confirmed', () => {
    let state = createGame();

    state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'shotgun' });
    state = applyAction(state, { type: 'confirmFormation', side: 'offense' });

    expect(generateLegalActions(state)).not.toContainEqual({ type: 'chooseFormation', side: 'offense', formationId: 'singleback' });
    expect(generateLegalActions(state)).toContainEqual({ type: 'chooseFormation', side: 'defense', formationId: 'nickel' });
    expect(() => applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'singleback' })).toThrow('already confirmed');
    expect(state.formation.offense.id).toBe('shotgun');
  });

  it('prevents formation shifts until that side is confirmed', () => {
    let state = createGame();

    expect(generateLegalActions(state)).not.toContainEqual({ type: 'shift', pieceId: 'home-wr1', to: { x: 4, y: 0 } });
    expect(() => applyAction(state, { type: 'shift', pieceId: 'home-wr1', to: { x: 4, y: 0 } })).toThrow('confirmed');

    state = applyAction(state, { type: 'confirmFormation', side: 'offense' });

    expect(generateLegalActions(state)).toContainEqual({ type: 'shift', pieceId: 'home-wr1', to: { x: 4, y: 0 } });
    expect(generateLegalActions(state)).not.toContainEqual({ type: 'shift', pieceId: 'away-wr1', to: { x: 9, y: 0 } });
    expect(() => applyAction(state, { type: 'shift', pieceId: 'away-wr1', to: { x: 9, y: 0 } })).toThrow('confirmed');
  });

  it('shows offensive or defensive role codes based on current possession', () => {
    let state = createGame();

    expect(activeRoleCode(state, piece(state, 'home-wr1'))).toBe('WR');
    expect(activeRoleCode(state, piece(state, 'away-wr1'))).toBe('CB');

    state = { ...state, possession: 'away', direction: -1 };
    expect(activeRoleCode(state, piece(state, 'away-wr1'))).toBe('WR');
    expect(activeRoleCode(state, piece(state, 'home-wr1'))).toBe('CB');
  });

  it('generates role-specific chess-inspired moves', () => {
    const state = liveGame();

    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-qb' && action.to.x === 3 && action.to.y === 6)).toBe(true);
    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-rb' && action.to.x === 2 && action.to.y === 6)).toBe(true);
    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 8 && action.to.y === 1)).toBe(true);
    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-ol1' && action.to.x === 4 && action.to.y === 3)).toBe(true);
  });

  it('reduces offensive movement by one square while the offense controls the ball', () => {
    const state = liveGame();
    const looseState = {
      ...state,
      ball: { kind: 'loose' as const, coord: { x: 6, y: 5 } },
      pieces: state.pieces.map((item) => (item.id === 'away-wr1' ? { ...item, coord: { x: 18, y: 1 } } : item)),
    };

    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 9 && action.to.y === 1)).toBe(false);
    expect(generateLegalActions({ ...state, turn: 'away' }).some((action) => action.type === 'move' && action.pieceId === 'away-wr1' && action.to.x === 14 && action.to.y === 1)).toBe(true);
    expect(generateLegalActions(looseState).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 9 && action.to.y === 1)).toBe(true);
  });

  it('blocks sliding movement through occupied squares', () => {
    const state = liveGame();

    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-qb' && action.to.x === 5 && action.to.y === 5)).toBe(false);
    expect(generateLegalActions(state).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 5 && action.to.y === 3)).toBe(false);
  });

  it('requires a power move for a ball carrier to run through blockers to an open lane square', () => {
    const afterHandoff = applyAction(liveGame(), { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    const state = {
      ...afterHandoff,
      turn: 'home' as const,
      pieces: afterHandoff.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 3, y: 4 } };
        if (item.id === 'home-ol3') return { ...item, coord: { x: 5, y: 4 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };
    const actions = generateLegalActions(state);

    expect(actions.some((action) => action.type === 'move' && action.pieceId === 'home-rb' && action.to.x === 5 && action.to.y === 5)).toBe(false);
    expect(actions).toContainEqual({ type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 } });
  });

  it('does not allow power moves through the ball carrier', () => {
    const state = {
      ...liveGame(),
      turn: 'home' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-rb' },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 3, y: 5 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.id !== 'home-rb' && item.id !== 'away-rb') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };
    const actions = generateLegalActions(state);

    expect(actions).toContainEqual({ type: 'tackle', defenderId: 'home-rb', targetId: 'away-rb' });
    expect(actions).not.toContainEqual({ type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 } });
  });

  it('treats moving through a friendly piece as a normal move, not a power move', () => {
    const afterHandoff = applyAction(liveGame(), { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    const state = {
      ...afterHandoff,
      turn: 'home' as const,
      pieces: afterHandoff.pieces.map((item) => {
        if (item.id === 'home-ol3') return { ...item, coord: { x: 5, y: 4 } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };
    const actions = generateLegalActions(state);

    expect(actions).toContainEqual({ type: 'move', pieceId: 'home-rb', to: { x: 5, y: 5 } });
    expect(actions).not.toContainEqual({ type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 } });
  });

  it('resolves power moves with dice and alternates turn on success or failure', () => {
    const afterHandoff = applyAction(liveGame(), { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    const state = {
      ...afterHandoff,
      turn: 'home' as const,
      pieces: afterHandoff.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 3, y: 4 } };
        if (item.id === 'home-ol3') return { ...item, coord: { x: 5, y: 4 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const failed = applyAction(state, { type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 }, roll: { die1: 2, die2: 2 } });
    expect(piece(failed, 'home-rb').coord).toEqual(piece(state, 'home-rb').coord);
    expect(failed.turn).toBe('away');

    const succeeded = applyAction(state, { type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 }, roll: { die1: 6, die2: 6 } });
    expect(piece(succeeded, 'home-rb').coord).toEqual({ x: 5, y: 5 });
    expect(succeeded.turn).toBe('away');
  });
});

describe('ball actions', () => {
  it('completes an uncontested forward pass to the selected receiver', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 12, y: 1 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
    });

    expect(next.ball.kind).toBe('controlled');
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('home-wr1');
    expect(next.forwardPassUsed).toBe(true);
  });

  it('does not generate passes to empty squares or offensive linemen', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 11, y: 1 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const passes = generateLegalActions(state).filter((action): action is Extract<Action, { type: 'pass' }> => action.type === 'pass');

    expect(passes).toContainEqual({ type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1' });
    expect(passes.some((action) => action.receiverId === 'home-ol1')).toBe(false);
  });

  it('scores a touchdown on a completed pass caught in the first end-zone column', () => {
    let state = liveGame(createGame({ lineOfScrimmage: 20, firstDownLine: 21 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 20, y: 5 } };
        if (item.id === 'home-te') return { ...item, coord: { x: 22, y: 7 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-te') return { ...item, coord: { x: 18, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 10, y: item.coord.y } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'home-qb' },
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-te',
      roll: { die1: 6, die2: 6 },
    });

    expect(next.play.result?.type).toBe('touchdown');
    expect(next.score.home).toBe(6);
    expect(next.phase).toBe('betweenDowns');
    expect(piece(next, 'home-te').coord).toEqual({ x: 22, y: 7 });
  });

  it('does not block a passing lane with offensive players', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.id === 'home-te') return { ...item, coord: { x: 7, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1' && item.id !== 'home-te') return { ...item, coord: { x: 2, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
    });

    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('home-wr1');
  });

  it('does not block a passing lane with defenders', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.id === 'away-te') return { ...item, coord: { x: 7, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 2, y: item.coord.y } };
        if (item.team === 'away' && item.id !== 'away-te') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
      roll: { die1: 6, die2: 6 },
    });

    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('home-wr1');
  });

  it('makes a failed pass incomplete when the roll misses the distance target', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
      roll: { die1: 2, die2: 3 },
    });

    expect(next.play.result?.type).toBe('incomplete');
    expect(next.phase).toBe('betweenDowns');
    expect(next.ball).toEqual({ kind: 'controlled', pieceId: 'home-qb' });
    expect(next.play.result?.type === 'incomplete' ? next.play.result.roll?.required : 0).toBe(8);
  });

  it('does not award a first down at the receiver spot on an incomplete forward pass', () => {
    let state = liveGame(createGame({ down: 2, lineOfScrimmage: 5, firstDownLine: 7 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
      roll: { die1: 1, die2: 1 },
    });

    expect(next.play.result?.type).toBe('incomplete');
    expect(next.down).toBe(3);
    expect(next.lineOfScrimmage).toBe(5);
    expect(next.firstDownLine).toBe(7);
  });

  it('does not generate illegal second forward passes', () => {
    const base = liveGame();
    const state = {
      ...base,
      forwardPassUsed: true,
      pieces: base.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 5, y: 5 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 6, y: 5 } };
        return item;
      }),
    };

    const passes = generateLegalActions(state).filter((action): action is Extract<Action, { type: 'pass' }> => action.type === 'pass');

    expect(passes.length).toBeGreaterThan(0);
    expect(passes.some((action) => piece(state, action.receiverId).coord.x > 5)).toBe(false);
    expect(() => applyAction(state, { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1' })).toThrow('Forward pass already used');
  });

  it('keeps the original line of scrimmage after an incomplete backward pass', () => {
    let state = liveGame();
    state = {
      ...state,
      lineOfScrimmage: 5,
      firstDownLine: 7,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 2, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-rb') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-rb',
      roll: { die1: 1, die2: 2 },
    });

    expect(next.play.result?.type).toBe('incomplete');
    expect(next.lineOfScrimmage).toBe(5);
    expect(next.firstDownLine).toBe(7);
  });

  it('intercepts only on snake eyes with a defender within one square of the receiver', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.id === 'away-wr1') return { ...item, coord: { x: 10, y: 6 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away' && item.id !== 'away-wr1') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'pass',
      passerId: 'home-qb',
      receiverId: 'home-wr1',
      roll: { die1: 1, die2: 1 },
    });

    expect(next.possession).toBe('away');
    expect(next.play.result?.type).toBe('interception');
    expect(next.play.result?.type === 'interception' ? next.play.result.roll?.total : 0).toBe(2);
  });

  it('allows adjacent handoffs and loose-ball recovery', () => {
    let state = liveGame();

    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    expect(state.ball.kind === 'controlled' ? state.ball.pieceId : '').toBe('home-rb');

    state = {
      ...state,
      ball: { kind: 'loose', coord: { x: 3, y: 5 } },
      phase: 'live',
      turn: 'home',
    };
    state = applyAction(state, { type: 'recover', pieceId: 'home-rb' });
    expect(state.ball.kind === 'controlled' ? state.ball.pieceId : '').toBe('home-rb');
  });

  it('ends the down when a double-six tackle fumble is recovered by the tackling team', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.team === 'home' && item.id !== 'home-rb') return { ...item, coord: { x: 2, y: 10 } };
        if (item.id === 'away-fb') return { ...item, coord: { x: 4, y: 4 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 3, y: 4 } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-fb',
      targetId: 'home-rb',
      roll: { die1: 6, die2: 6 },
    });

    expect(next.play.result).toMatchObject({ type: 'fumble', recoveredBy: 'away', at: piece(next, 'away-fb').coord });
    expect(next.phase).toBe('betweenDowns');
    expect(next.possession).toBe('away');
    expect(piece(next, 'away-fb').coord).not.toEqual(piece(next, 'home-rb').coord);
  });
});

describe('play resolution', () => {
  it('resolves the opening coin toss from a coin flip', () => {
    const state = createGame({ phase: 'coinToss' });

    const homeWin = applyAction(state, { type: 'coinToss', result: 'heads' });
    const awayWin = applyAction(state, { type: 'coinToss', result: 'tails' });

    expect(homeWin.phase).toBe('coinToss');
    expect(homeWin.coinToss.winner).toBe('home');
    expect(homeWin.coinToss.result).toBe('heads');
    expect(homeWin.turn).toBe('home');
    expect(awayWin.coinToss.winner).toBe('away');
    expect(awayWin.coinToss.result).toBe('tails');
    expect(awayWin.turn).toBe('away');
  });

  it('lets the coin toss winner choose whether to kick or receive', () => {
    const tossed = applyAction(createGame({ phase: 'coinToss' }), {
      type: 'coinToss',
      result: 'tails',
    });

    const receivingChoice = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'away', choice: 'receive' });
    const kickingChoice = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'away', choice: 'kick' });

    expect(receivingChoice.phase).toBe('kickoff');
    expect(receivingChoice.openingKickoffTeam).toBe('home');
    expect(receivingChoice.turn).toBe('home');
    expect(kickingChoice.openingKickoffTeam).toBe('away');
    expect(kickingChoice.turn).toBe('away');
  });

  it('shows a kickoff alignment with the kicker on the 35, coverage on the 30, and receivers behind their 35', () => {
    const tossed = applyAction(createGame({ phase: 'coinToss' }), {
      type: 'coinToss',
      result: 'heads',
    });

    const homeReceives = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'home', choice: 'receive' });

    expect(homeReceives.turn).toBe('away');
    expect(piece(homeReceives, 'away-qb').coord).toEqual({ x: 15, y: 5 });
    expect(homeReceives.pieces.filter((item) => item.team === 'away' && item.id !== 'away-qb').every((item) => item.coord.x === 16)).toBe(true);
    expect(homeReceives.pieces.filter((item) => item.team === 'home').every((item) => item.coord.x <= 9)).toBe(true);
    expect(piece(homeReceives, 'home-ol3').coord).toEqual({ x: 9, y: 5 });
    expect(piece(homeReceives, 'home-qb').coord).toEqual({ x: 9, y: 4 });
    expect(piece(homeReceives, 'home-rb').coord).toEqual({ x: 9, y: 6 });
    expect(piece(homeReceives, 'home-wr1').coord).toEqual({ x: 5, y: 2 });
    expect(piece(homeReceives, 'home-wr2').coord).toEqual({ x: 5, y: 8 });
  });

  it('mirrors kickoff formations for home and away teams', () => {
    const homeToss = applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' });
    const awayToss = applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'tails' });
    const homeKicks = applyAction(homeToss, { type: 'chooseKickoffChoice', team: 'home', choice: 'kick' });
    const awayKicks = applyAction(awayToss, { type: 'chooseKickoffChoice', team: 'away', choice: 'kick' });
    const mirrorX = (x: number) => homeKicks.board.width - 1 - x;

    for (const homePiece of homeKicks.pieces) {
      const mirroredTeam = homePiece.team === 'home' ? 'away' : 'home';
      const mirroredPiece = piece(awayKicks, homePiece.id.replace(homePiece.team, mirroredTeam));

      expect(mirroredPiece.coord).toEqual({ x: mirrorX(homePiece.coord.x), y: homePiece.coord.y });
    }
  });

  it('ends a normal tackle at the carrier square', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => (item.id === 'away-fb' ? { ...item, coord: { x: 4, y: 4 } } : item)),
    };

    const next = applyAction(state, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-rb' });

    expect(next.play.result?.type).toBe('tackle');
    expect(next.phase).toBe('betweenDowns');
  });

  it('allows a defender to attempt a tackle from natural movement range', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 6, y: 5 } };
        if (item.id === 'home-ol3') return { ...item, coord: { x: 5, y: 3 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-rb',
      targetId: 'home-rb',
      roll: { die1: 3, die2: 4 },
    });

    expect(next.play.result?.type).toBe('tackle');
    expect(next.play.result?.type === 'tackle' ? next.play.result.roll?.required : 0).toBe(7);
  });

  it('prevents a coverage defender from tackling through opposing linemen', () => {
    let state = liveGame();
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.id === 'home-ol3') return { ...item, coord: { x: 6, y: 5 } };
        if (item.id === 'away-wr1') return { ...item, coord: { x: 8, y: 5 } };
        if (item.id !== 'home-qb' && item.id !== 'home-ol3' && item.id !== 'away-wr1') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'home-qb' },
    };

    expect(generateLegalActions(state)).not.toContainEqual({ type: 'tackle', defenderId: 'away-wr1', targetId: 'home-qb' });
    expect(() => applyAction(state, { type: 'tackle', defenderId: 'away-wr1', targetId: 'home-qb' })).toThrow('blocked');
  });

  it('makes power-role tackles through opposing linemen harder', () => {
    let state = liveGame();
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.id === 'home-ol3') return { ...item, coord: { x: 5, y: 5 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 6, y: 5 } };
        if (item.id !== 'home-qb' && item.id !== 'home-ol3' && item.id !== 'away-rb') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'home-qb' },
    };

    expect(generateLegalActions(state)).toContainEqual({ type: 'tackle', defenderId: 'away-rb', targetId: 'home-qb' });

    const failed = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-rb',
      targetId: 'home-qb',
      roll: { die1: 5, die2: 5 },
    });
    expect(failed.phase).toBe('live');
    expect(failed.turn).toBe('home');

    const succeeded = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-rb',
      targetId: 'home-qb',
      roll: { die1: 5, die2: 6 },
    });
    expect(succeeded.play.result?.type).toBe('tackle');
    expect(succeeded.play.result?.type === 'tackle' ? succeeded.play.result.roll?.required : 0).toBe(11);
  });

  it('keeps play live after a failed tackle roll', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 6, y: 5 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-rb',
      targetId: 'home-rb',
      roll: { die1: 2, die2: 2 },
    });

    expect(next.phase).toBe('live');
    expect(next.turn).toBe('home');
    expect(next.play.result).toBeUndefined();
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('home-rb');
  });

  it('creates a rare double-six fumble recovered by the tackling team', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 6, y: 5 } };
        if (item.id === 'away-rb') return { ...item, coord: { x: 4, y: 5 } };
        return item;
      }),
    };

    const next = applyAction(state, {
      type: 'tackle',
      defenderId: 'away-rb',
      targetId: 'home-rb',
      roll: { die1: 6, die2: 6 },
    });

    expect(next.play.result?.type).toBe('fumble');
    expect(next.play.result?.type === 'fumble' ? next.play.result.recoveredBy : undefined).toBe('away');
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('away-rb');
    expect(piece(next, 'away-rb').coord).toEqual({ x: 4, y: 5 });
    expect(piece(next, 'home-rb').coord).toEqual({ x: 6, y: 5 });
    expect(next.phase).toBe('betweenDowns');
    expect(next.possession).toBe('away');
  });

  it('scores touchdowns and advances to the next drive', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => (item.id === 'home-rb' ? { ...item, coord: { x: 21, y: 4 } } : item)),
      ball: { kind: 'controlled', pieceId: 'home-rb' },
    };

    const next = applyAction(state, { type: 'move', pieceId: 'home-rb', to: { x: 22, y: 4 } });

    expect(next.play.result?.type).toBe('touchdown');
    expect(next.score.home).toBe(6);
    expect(next.phase).toBe('betweenDowns');
  });

  it('handles field goals, safeties, and turnovers on downs', () => {
    let fieldGoalState = liveGame();
    fieldGoalState = {
      ...fieldGoalState,
      lineOfScrimmage: 17,
      pieces: fieldGoalState.pieces.map((item) => (item.id === 'home-qb' ? { ...item, coord: { x: 17, y: 5 } } : item)),
    };
    const missedFieldGoal = applyAction(readyKick(fieldGoalState, 'fieldGoal'), { type: 'kick', kickerId: 'home-qb', kind: 'fieldGoal', roll: { die1: 4, die2: 4 } });
    const madeFieldGoal = applyAction(readyKick(fieldGoalState, 'fieldGoal'), { type: 'kick', kickerId: 'home-qb', kind: 'fieldGoal', roll: { die1: 4, die2: 5 } });
    expect(missedFieldGoal.score.home).toBe(0);
    expect(missedFieldGoal.play.result).toMatchObject({ type: 'fieldGoal', good: false, roll: { total: 8, required: 9, distance: 7 } });
    expect(madeFieldGoal.score.home).toBe(3);
    expect(madeFieldGoal.play.result).toMatchObject({ type: 'fieldGoal', good: true, roll: { total: 9, required: 9, distance: 7 } });

    let safetyState = liveGame();
    safetyState = {
      ...safetyState,
      possession: 'away',
      direction: -1,
      turn: 'home',
      pieces: safetyState.pieces.map((item) => {
        if (item.id === 'away-rb') return { ...item, coord: { x: 23, y: 4 } };
        if (item.id === 'home-fb') return { ...item, coord: { x: 23, y: 5 } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'away-rb' },
    };
    expect(applyAction(safetyState, { type: 'tackle', defenderId: 'home-fb', targetId: 'away-rb', roll: { die1: 3, die2: 3 } }).score.home).toBe(2);

    const turnoverState = {
      ...liveGame(createGame({ down: 4, firstDownLine: 8 })),
      pieces: liveGame(createGame({ down: 4, firstDownLine: 8 })).pieces.map((item) => {
        if (item.id === 'home-qb') return item;
        if (item.team === 'home') return { ...item, coord: { x: 3, y: item.coord.y } };
        return { ...item, coord: { x: 18, y: item.coord.y } };
      }),
    };
    const next = applyAction(turnoverState, { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1', roll: { die1: 1, die2: 2 } });
    expect(next.play.result?.type).toBe('turnoverOnDowns');
    expect(next.possession).toBe('away');
  });

  it('turns missed field goals over to the defense without a kickoff', () => {
    let state = liveGame(createGame({ lineOfScrimmage: 17 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => (item.id === 'home-qb' ? { ...item, coord: { x: 17, y: 5 } } : item)),
    };

    const missed = applyAction(readyKick(state, 'fieldGoal'), { type: 'kick', kickerId: 'home-qb', kind: 'fieldGoal', roll: { die1: 1, die2: 1 } });
    const next = startNextDown(missed);

    expect(missed.play.result).toMatchObject({ type: 'fieldGoal', team: 'home', good: false });
    expect(next.phase).toBe('formation');
    expect(next.possession).toBe('away');
    expect(next.lineOfScrimmage).toBe(17);
    expect(next.score.home).toBe(0);
  });

  it('uses the same field-goal geometry when the offense moves left', () => {
    let state = liveGame(createGame({ possession: 'away', direction: -1, turn: 'away', lineOfScrimmage: 6 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => (item.id === 'away-qb' ? { ...item, coord: { x: 6, y: 5 } } : item)),
      ball: { kind: 'controlled', pieceId: 'away-qb' },
    };

    const made = applyAction(readyKick(state, 'fieldGoal'), { type: 'kick', kickerId: 'away-qb', kind: 'fieldGoal', roll: { die1: 4, die2: 5 } });

    expect(made.score.away).toBe(3);
    expect(made.play.result).toMatchObject({ type: 'fieldGoal', team: 'away', good: true, roll: { total: 9, required: 9, distance: 7 } });
  });

  it('resolves the post-touchdown extra point as a simple kick roll', () => {
    const touchdown = {
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    };

    const next = applyAction(touchdown, {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'extraPoint',
      roll: { die1: 3, die2: 2 },
    });

    expect(next.score.home).toBe(7);
    expect(next.play.result).toMatchObject({ type: 'extraPoint', team: 'home', good: true });
  });

  it('requires a conversion choice after a touchdown before kickoff', () => {
    const touchdown = {
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    };

    expect(() => startNextDown(touchdown)).toThrow('conversion');
    expect(generateLegalActions(touchdown)).toContainEqual({ type: 'kick', kickerId: 'home-qb', kind: 'extraPoint' });
    expect(generateLegalActions(touchdown)).toContainEqual({ type: 'startTwoPointTry', team: 'home' });
  });

  it('does not consume a drive on ordinary stopped downs', () => {
    let state = liveGame(createGame({ down: 1, lineOfScrimmage: 5, firstDownLine: 7 }));
    state = {
      ...state,
      turn: 'away',
      drivesThisQuarter: { home: 0, away: 0 },
      pieces: state.pieces.map((item) => {
        if (item.id === 'away-fb') return { ...item, coord: { x: 4, y: 5 } };
        return item;
      }),
    };

    const stopped = applyAction(state, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-qb', roll: { die1: 6, die2: 1 } });
    const next = startNextDown(stopped);

    expect(next.down).toBe(2);
    expect(next.drivesThisQuarter).toEqual({ home: 0, away: 0 });
  });

  it('sets up a two-point try as a goal-line formation play', () => {
    const touchdown = {
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    };

    const next = applyAction(touchdown, { type: 'startTwoPointTry', team: 'home' });

    expect(next.phase).toBe('formation');
    expect(next.possession).toBe('home');
    expect(next.conversion).toEqual({ team: 'home' });
    expect(next.lineOfScrimmage).toBe(21);
    expect(next.firstDownLine).toBe(22);
    expect(piece(next, 'home-qb').coord.x).toBe(20);
  });

  it('awards two points when a two-point try reaches the end zone', () => {
    const tryState = liveGame(applyAction({
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    }, { type: 'startTwoPointTry', team: 'home' }));
    const ready = {
      ...tryState,
      pieces: tryState.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 21, y: 5 } };
        if (item.team === 'away') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const made = applyAction(ready, { type: 'move', pieceId: 'home-qb', to: { x: 22, y: 5 } });
    const next = startNextDown(made);

    expect(made.score.home).toBe(8);
    expect(made.play.result).toMatchObject({ type: 'twoPoint', team: 'home', good: true });
    expect(next.phase).toBe('kickoff');
    expect(next.possession).toBe('home');
  });

  it('fails a two-point try when the offense is stopped', () => {
    const tryState = liveGame(applyAction({
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    }, { type: 'startTwoPointTry', team: 'home' }));
    const ready = {
      ...tryState,
      turn: 'away' as const,
      pieces: tryState.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 20, y: 5 } };
        if (item.id === 'away-fb') return { ...item, coord: { x: 20, y: 6 } };
        return item;
      }),
    };

    const stopped = applyAction(ready, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-qb', roll: { die1: 6, die2: 1 } });
    const next = startNextDown(stopped);

    expect(stopped.score.home).toBe(6);
    expect(stopped.play.result).toMatchObject({ type: 'twoPoint', team: 'home', good: false });
    expect(next.phase).toBe('kickoff');
    expect(next.possession).toBe('home');
  });

  it('sets up a kickoff by the scoring team after an extra point', () => {
    const touchdown = {
      ...createGame(),
      phase: 'betweenDowns' as const,
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown' as const, team: 'home' as const } },
    };
    const extraPoint = applyAction(touchdown, {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'extraPoint',
      roll: { die1: 3, die2: 2 },
    });

    const next = startNextDown(extraPoint);

    expect(next.phase).toBe('kickoff');
    expect(next.turn).toBe('home');
    expect(next.possession).toBe('home');
  });

  it('sets up a kickoff by the scoring team after a field goal', () => {
    let state = liveGame(createGame({ lineOfScrimmage: 17 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => (item.id === 'home-qb' ? { ...item, coord: { x: 17, y: 5 } } : item)),
    };

    const fieldGoal = applyAction(readyKick(state, 'fieldGoal'), {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'fieldGoal',
      roll: { die1: 4, die2: 5 },
    });
    const next = startNextDown(fieldGoal);

    expect(next.phase).toBe('kickoff');
    expect(next.turn).toBe('home');
    expect(next.score.home).toBe(3);
  });

  it('resolves an opening kickoff placement into a live return', () => {
    const state = createGame({
      phase: 'kickoff',
      possession: 'home',
      turn: 'home',
      openingKickoffTeam: 'home',
    });

    const kicked = applyAction(state, {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'kickoff',
      roll: { die1: 4, die2: 3 },
    });
    const next = applyAction(kicked, { type: 'placeKick', at: { x: 11, y: 5 } });

    expect(next.play.result).toBeUndefined();
    expect(next.phase).toBe('kickReturn');
    expect(next.possession).toBe('away');
    expect(next.lineOfScrimmage).toBe(11);
    expect(next.ball).toEqual({ kind: 'loose', coord: { x: 11, y: 5 } });
  });

  it('lands an away kickoff on the left side when home receives', () => {
    const state = createGame({
      phase: 'kickoff',
      possession: 'away',
      turn: 'away',
      openingKickoffTeam: 'away',
    });

    const kicked = applyAction(state, {
      type: 'kick',
      kickerId: 'away-qb',
      kind: 'kickoff',
      roll: { die1: 4, die2: 3 },
    });
    const next = applyAction(kicked, { type: 'placeKick', at: { x: 0, y: 5 } });

    expect(next.phase).toBe('betweenDowns');
    expect(next.possession).toBe('home');
    expect(next.direction).toBe(1);
    expect(next.lineOfScrimmage).toBe(7);
    expect(next.play.result).toEqual({ type: 'touchback', team: 'home', at: { x: 7, y: 5 } });
  });

  it('makes a poor kickoff land on the exact short-distance column', () => {
    const next = applyAction(createGame({
      phase: 'kickoff',
      possession: 'home',
      turn: 'home',
      openingKickoffTeam: 'home',
    }), {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'kickoff',
      roll: { die1: 1, die2: 1 },
    });

    expect(next.pendingKick?.distance).toBe(2);
    expect(generateLegalActions(next)).toContainEqual({ type: 'placeKick', at: { x: 6, y: 5 } });
    expect(generateLegalActions(next)).not.toContainEqual({ type: 'placeKick', at: { x: 7, y: 5 } });
  });

  it('keeps the return tackle spot when lining up the receiving team', () => {
    const kicked = applyAction(createGame({
      phase: 'kickoff',
      possession: 'home',
      turn: 'home',
      openingKickoffTeam: 'home',
    }), {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'kickoff',
      roll: { die1: 4, die2: 3 },
    });
    const returned = applyAction(kicked, { type: 'placeKick', at: { x: 11, y: 5 } });
    const stopped = applyAction({
      ...returned,
      turn: 'home',
      ball: { kind: 'controlled', pieceId: 'away-wr1' },
      pieces: returned.pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 11, y: 5 } };
        if (item.id === 'home-rb') return { ...item, coord: { x: 10, y: 5 } };
        return item;
      }),
    }, { type: 'tackle', defenderId: 'home-rb', targetId: 'away-wr1', roll: { die1: 3, die2: 4 } });

    const next = startNextDown(stopped);

    expect(next.phase).toBe('formation');
    expect(next.possession).toBe('away');
    expect(next.lineOfScrimmage).toBe(11);
    expect(piece(next, 'away-ol3').coord.x).toBe(11);
    expect(piece(next, 'away-qb').coord.x).toBe(12);
  });

  it('rolls a kickoff into a placement choice instead of immediately starting the drive', () => {
    const state = createGame({
      phase: 'kickoff',
      possession: 'home',
      turn: 'home',
    });

    const kicked = applyAction(state, {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'kickoff',
      roll: { die1: 3, die2: 4 },
    });

    expect(kicked.phase).toBe('kickPlacement');
    expect(kicked.pendingKick).toMatchObject({ kind: 'kickoff', kickingTeam: 'home', receivingTeam: 'away', distance: 7 });
    expect(generateLegalActions(kicked)).toContainEqual({ type: 'placeKick', at: { x: 11, y: 5 } });
    expect(generateLegalActions(kicked)).not.toContainEqual({ type: 'placeKick', at: { x: 10, y: 5 } });
    expect(generateLegalActions(kicked)).not.toContainEqual({ type: 'placeKick', at: { x: 12, y: 5 } });
  });

  it('starts a kickoff return with the ball loose at the chosen landing square', () => {
    const kicked = applyAction(createGame({
      phase: 'kickoff',
      possession: 'home',
      turn: 'home',
    }), {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'kickoff',
      roll: { die1: 3, die2: 4 },
    });

    const returned = applyAction(kicked, { type: 'placeKick', at: { x: 11, y: 5 } });

    expect(returned.phase).toBe('kickReturn');
    expect(returned.possession).toBe('away');
    expect(returned.turn).toBe('away');
    expect(returned.ball).toEqual({ kind: 'loose', coord: { x: 11, y: 5 } });
    expect(piece(returned, 'away-wr1').coord).not.toEqual({ x: 11, y: 5 });
  });

  it('treats kickoff and punt placements in the end zone as touchbacks', () => {
    const kickoff = createGame({
      phase: 'kickPlacement',
      possession: 'home',
      turn: 'home',
      pendingKick: {
        kind: 'kickoff',
        kickingTeam: 'home',
        receivingTeam: 'away',
        from: { x: 10, y: 5 },
        distance: 12,
        roll: { die1: 6, die2: 6 },
      },
    });
    const touchback = applyAction(kickoff, { type: 'placeKick', at: { x: 22, y: 5 } });

    expect(touchback.play.result).toEqual({ type: 'touchback', team: 'away', at: { x: 17, y: 5 } });
    expect(startNextDown(touchback).lineOfScrimmage).toBe(17);
    expect(startNextDown(touchback).drivesThisQuarter).toEqual({ home: 0, away: 0 });

    let puntState = liveGame(createGame({ lineOfScrimmage: 17, firstDownLine: 19 }));
    puntState = {
      ...puntState,
      pieces: puntState.pieces.map((item) => (item.id === 'home-qb' ? { ...item, coord: { x: 17, y: 5 } } : item)),
    };
    const punt = applyAction(readyKick(puntState, 'punt'), { type: 'kick', kickerId: 'home-qb', kind: 'punt', roll: { die1: 6, die2: 6 } });
    const puntTouchback = applyAction(punt, { type: 'placeKick', at: { x: 23, y: 5 } });

    expect(puntTouchback.play.result).toEqual({ type: 'touchback', team: 'away', at: { x: 17, y: 5 } });
    expect(startNextDown(puntTouchback).drivesThisQuarter).toEqual({ home: 1, away: 0 });
  });

  it('lets a receiving player collect a loose kickoff by moving onto the landing square', () => {
    const base = liveGame();
    const returned = {
      ...base,
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'away' as const,
      ball: { kind: 'loose' as const, coord: { x: 11, y: 5 } },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 4, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      pieces: base.pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 9, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    const caught = applyAction(returned, { type: 'move', pieceId: 'away-wr1', to: { x: 11, y: 5 } });

    expect(caught.phase).toBe('kickReturn');
    expect(caught.ball).toEqual({ kind: 'controlled', pieceId: 'away-wr1' });
    expect(caught.turn).toBe('home');
  });

  it('ends an untouched loose kick at the touch spot when the kicking team reaches it first', () => {
    const base = liveGame();
    const returned = {
      ...base,
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'home' as const,
      ball: { kind: 'loose' as const, coord: { x: 11, y: 5 } },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 4, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      pieces: base.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 9, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    const touched = applyAction(returned, { type: 'move', pieceId: 'home-wr1', to: { x: 11, y: 5 } });

    expect(touched.phase).toBe('betweenDowns');
    expect(touched.possession).toBe('away');
    expect(touched.lineOfScrimmage).toBe(11);
    expect(touched.ball).toEqual({ kind: 'controlled', pieceId: 'away-qb' });
    expect(touched.play.result).toEqual({ type: 'kickTouched', team: 'home', receivingTeam: 'away', at: { x: 11, y: 5 } });
    expect(startNextDown(touched).drivesThisQuarter).toEqual({ home: 0, away: 0 });

    const puntTouched = applyAction({
      ...returned,
      pendingKick: { ...returned.pendingKick, kind: 'punt' as const },
    }, { type: 'move', pieceId: 'home-wr1', to: { x: 11, y: 5 } });
    expect(startNextDown(puntTouched).drivesThisQuarter).toEqual({ home: 1, away: 0 });
  });

  it('restricts return-team movement to two squares and coverage-team movement to three', () => {
    const returned = {
      ...liveGame(),
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'away' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-wr1' },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 5, y: 5 }, distance: 16, roll: { die1: 3, die2: 4 } },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 15, y: 5 } };
        if (item.id === 'away-ol1') return { ...item, coord: { x: 10, y: 2 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 12, y: 2 } };
        if (item.id === 'home-qb') return { ...item, coord: { x: 12, y: 8 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    expect(generateLegalActions(returned).some((action) => action.type === 'move' && action.pieceId === 'away-wr1' && action.to.x === 13 && action.to.y === 5)).toBe(true);
    expect(generateLegalActions(returned).some((action) => action.type === 'move' && action.pieceId === 'away-wr1' && action.to.x === 12 && action.to.y === 5)).toBe(false);
    expect(generateLegalActions(returned).some((action) => action.type === 'move' && action.pieceId === 'away-ol1' && action.to.x === 8 && action.to.y === 2)).toBe(true);
    expect(generateLegalActions(returned).some((action) => action.type === 'move' && action.pieceId === 'away-ol1' && action.to.x === 7 && action.to.y === 2)).toBe(false);

    const coverageTurn = { ...returned, turn: 'home' as const };
    expect(generateLegalActions(coverageTurn).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 15 && action.to.y === 2)).toBe(true);
    expect(generateLegalActions(coverageTurn).some((action) => action.type === 'move' && action.pieceId === 'home-wr1' && action.to.x === 16 && action.to.y === 2)).toBe(false);
    expect(generateLegalActions(coverageTurn).some((action) => action.type === 'move' && action.pieceId === 'home-qb' && action.to.x === 15 && action.to.y === 8)).toBe(true);
    expect(generateLegalActions(coverageTurn).some((action) => action.type === 'move' && action.pieceId === 'home-qb' && action.to.x === 16 && action.to.y === 8)).toBe(false);
  });

  it('does not allow return movement to pass through an opposing player', () => {
    const returned = {
      ...liveGame(),
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'away' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-wr1' },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 5, y: 5 }, distance: 16, roll: { die1: 3, die2: 4 } },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 15, y: 5 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 14, y: 6 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    expect(generateLegalActions(returned)).not.toContainEqual({ type: 'move', pieceId: 'away-wr1', to: { x: 13, y: 7 } });
  });

  it('sets the next line of scrimmage where a kick return is tackled', () => {
    const returned = {
      ...liveGame(),
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'home' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-wr1' },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 5, y: 5 }, distance: 16, roll: { die1: 3, die2: 4 } },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 12, y: 5 } };
        if (item.id === 'home-rb') return { ...item, coord: { x: 13, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    const tackled = applyAction(returned, { type: 'tackle', defenderId: 'home-rb', targetId: 'away-wr1', roll: { die1: 3, die2: 4 } });
    const next = startNextDown(tackled);

    expect(tackled.phase).toBe('betweenDowns');
    expect(tackled.play.result).toMatchObject({ type: 'tackle', at: { x: 12, y: 5 } });
    expect(next.phase).toBe('formation');
    expect(next.lineOfScrimmage).toBe(12);
    expect(next.possession).toBe('away');

    const puntReturn = { ...returned, pendingKick: { ...returned.pendingKick, kind: 'punt' as const } };
    const puntTackled = applyAction(puntReturn, { type: 'tackle', defenderId: 'home-rb', targetId: 'away-wr1', roll: { die1: 3, die2: 4 } });
    expect(startNextDown(puntTackled).drivesThisQuarter).toEqual({ home: 1, away: 0 });
  });

  it('lets any coverage player tackle within the three-square kick return range', () => {
    const returned = {
      ...liveGame(),
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'home' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-wr1' },
      pendingKick: { kind: 'kickoff' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 4, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 12, y: 5 } };
        if (item.id === 'home-ol1') return { ...item, coord: { x: 15, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    expect(generateLegalActions(returned)).toContainEqual({ type: 'tackle', defenderId: 'home-ol1', targetId: 'away-wr1' });

    const tackled = applyAction(returned, { type: 'tackle', defenderId: 'home-ol1', targetId: 'away-wr1', roll: { die1: 5, die2: 5 } });

    expect(tackled.play.result).toMatchObject({ type: 'tackle', at: { x: 12, y: 5 } });
  });

  it('allows a double-six kick return tackle to force an immediate fumble turnover', () => {
    const returned = {
      ...liveGame(),
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'home' as const,
      ball: { kind: 'controlled' as const, pieceId: 'away-wr1' },
      pendingKick: { kind: 'punt' as const, kickingTeam: 'home' as const, receivingTeam: 'away' as const, from: { x: 8, y: 5 }, distance: 10, roll: { die1: 3, die2: 4 } },
      pieces: liveGame().pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 12, y: 5 } };
        if (item.id === 'home-rb') return { ...item, coord: { x: 13, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    const fumbled = applyAction(returned, { type: 'tackle', defenderId: 'home-rb', targetId: 'away-wr1', roll: { die1: 6, die2: 6 } });

    expect(fumbled.play.result).toMatchObject({ type: 'fumble', at: { x: 13, y: 5 }, recoveredBy: 'home' });
    expect(fumbled.possession).toBe('home');
    expect(fumbled.ball.kind === 'controlled' ? fumbled.ball.pieceId : '').toBe('home-rb');
    expect(piece(fumbled, 'home-rb').coord).toEqual({ x: 13, y: 5 });
    expect(piece(fumbled, 'away-wr1').coord).toEqual({ x: 12, y: 5 });
  });

  it('rolls a punt on any down into a placement choice', () => {
    let state = liveGame(createGame({ down: 2, lineOfScrimmage: 8, firstDownLine: 10 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => (item.id === 'home-qb' ? { ...item, coord: { x: 8, y: 5 } } : item)),
    };

    const next = applyAction(readyKick(state, 'punt'), {
      type: 'kick',
      kickerId: 'home-qb',
      kind: 'punt',
      roll: { die1: 4, die2: 3 },
    });

    expect(next.play.result).toBeUndefined();
    expect(next.phase).toBe('kickPlacement');
    expect(next.pendingKick).toMatchObject({ kind: 'punt', kickingTeam: 'home', receivingTeam: 'away', distance: 7 });
    expect(generateLegalActions(next)).toContainEqual({ type: 'placeKick', at: { x: 15, y: 5 } });
  });

  it('advances to the third quarter with the opposite halftime kickoff team', () => {
    const state = createGame({
      phase: 'betweenDowns',
      quarter: 2,
      drivesThisQuarter: { home: 2, away: 1 },
      openingKickoffTeam: 'home',
      possession: 'away',
      play: { actions: [], result: { type: 'turnoverOnDowns', team: 'home' } },
    });

    const next = startNextDown(state);

    expect(next.quarter).toBe(3);
    expect(next.phase).toBe('kickoff');
    expect(next.possession).toBe('away');
    expect(next.turn).toBe('away');
  });

  it('requires two completed drives per team before advancing a quarter', () => {
    const state = createGame({
      phase: 'betweenDowns',
      quarter: 1,
      drivesThisQuarter: { home: 1, away: 1 },
      possession: 'home',
      play: { actions: [], result: { type: 'turnoverOnDowns', team: 'away' } },
    });

    const next = startNextDown(state);

    expect(next.quarter).toBe(1);
    expect(next.drivesThisQuarter).toEqual({ home: 2, away: 1 });
  });

  it('ends the match after both teams complete their fourth-quarter drives', () => {
    const state = createGame({
      phase: 'betweenDowns',
      quarter: 4,
      drivesThisQuarter: { home: 2, away: 1 },
      possession: 'away',
      play: { actions: [], result: { type: 'turnoverOnDowns', team: 'home' } },
    });

    const next = startNextDown(state);

    expect(next.phase).toBe('final');
    expect(next.quarter).toBe(4);
    expect(next.drivesThisQuarter).toEqual({ home: 2, away: 2 });
  });

  describe('completed drive ownership', () => {
    it.each([
      ['home', 'away'],
      ['away', 'home'],
    ] as const)('does not count a %s kickoff touchback received by %s', (kickingTeam, receivingTeam) => {
      const state = stoppedFor(receivingTeam, { type: 'touchback', team: receivingTeam, at: { x: 17, y: 5 } }, {
        pendingKick: { kind: 'kickoff', kickingTeam, receivingTeam, from: { x: 10, y: 5 }, distance: 12, roll: { die1: 6, die2: 6 } },
      });
      const next = startNextDown(state);

      expect(next.drivesThisQuarter).toEqual({ home: 0, away: 0 });
      expect(next.pendingKick).toBeUndefined();
    });

    it('does not count a kickoff ended by coverage touching the loose kick', () => {
      const state = stoppedFor('away', { type: 'kickTouched', team: 'home', receivingTeam: 'away', at: { x: 11, y: 5 } }, {
        pendingKick: { kind: 'kickoff', kickingTeam: 'home', receivingTeam: 'away', from: { x: 4, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      });

      expect(startNextDown(state).drivesThisQuarter).toEqual({ home: 0, away: 0 });
    });

    it.each([
      ['touchback', { type: 'touchback', team: 'away', at: { x: 17, y: 5 } }],
      ['coverage touch', { type: 'kickTouched', team: 'home', receivingTeam: 'away', at: { x: 12, y: 5 } }],
      ['fielded return tackle', { type: 'tackle', at: { x: 12, y: 5 }, roll: { roll: { die1: 5, die2: 5 }, total: 10, required: 5, distance: 1 } }],
    ] as const)('credits the punting team after a punt %s', (_label, result) => {
      const state = stoppedFor('away', result, {
        pendingKick: { kind: 'punt', kickingTeam: 'home', receivingTeam: 'away', from: { x: 8, y: 5 }, distance: 10, roll: { die1: 5, die2: 5 } },
      });
      const next = startNextDown(state);

      expect(next.drivesThisQuarter).toEqual({ home: 1, away: 0 });
      expect(next.pendingKick).toBeUndefined();
    });

    it('credits away when away punts to a home touchback', () => {
      const state = stoppedFor('home', { type: 'touchback', team: 'home', at: { x: 6, y: 5 } }, {
        pendingKick: { kind: 'punt', kickingTeam: 'away', receivingTeam: 'home', from: { x: 15, y: 5 }, distance: 10, roll: { die1: 5, die2: 5 } },
      });

      expect(startNextDown(state).drivesThisQuarter).toEqual({ home: 0, away: 1 });
    });

    it.each([
      ['interception', { type: 'interception', team: 'away' }],
      ['turnover on downs', { type: 'turnoverOnDowns', team: 'away' }],
      ['missed field goal', { type: 'fieldGoal', team: 'home', good: false }],
      ['opponent-recovered fumble', { type: 'fumble', at: { x: 10, y: 5 }, recoveredBy: 'away' }],
    ] as const)('credits the former offense after %s', (_label, result) => {
      expect(startNextDown(stoppedFor('away', result)).drivesThisQuarter).toEqual({ home: 1, away: 0 });
    });

    it.each([
      ['made field goal', { type: 'fieldGoal', team: 'home', good: true }],
      ['made extra point after touchdown', { type: 'extraPoint', team: 'home', good: true }],
      ['missed extra point after touchdown', { type: 'extraPoint', team: 'home', good: false }],
      ['made two-point try after touchdown', { type: 'twoPoint', team: 'home', good: true }],
      ['failed two-point try after touchdown', { type: 'twoPoint', team: 'home', good: false }],
    ] as const)('keeps counting the correct offense exactly once for a %s', (_label, result) => {
      expect(startNextDown(stoppedFor('home', result)).drivesThisQuarter).toEqual({ home: 1, away: 0 });
    });

    it('credits the offense that conceded a safety', () => {
      const safety = stoppedFor('away', { type: 'safety', team: 'home' });

      expect(startNextDown(safety).drivesThisQuarter).toEqual({ home: 0, away: 1 });
    });

    it.each([
      { type: 'tackle', at: { x: 8, y: 5 } },
      { type: 'incomplete', at: { x: 8, y: 5 } },
    ] as PlayResult[])('does not count nonterminal $type results', (result) => {
      expect(startNextDown(stoppedFor('home', result)).drivesThisQuarter).toEqual({ home: 0, away: 0 });
    });

    it('uses corrected ownership before deciding quarter and final boundaries', () => {
      const quarter = stoppedFor('away', { type: 'interception', team: 'away' }, {
        quarter: 1,
        drivesThisQuarter: { home: 1, away: 2 },
      });
      const final = stoppedFor('away', { type: 'turnoverOnDowns', team: 'away' }, {
        quarter: 4,
        drivesThisQuarter: { home: 1, away: 2 },
      });

      expect(startNextDown(quarter).quarter).toBe(2);
      expect(startNextDown(final).phase).toBe('final');
    });

    it('does not let halftime or opening kickoff resolution consume a drive', () => {
      const halftimeTouchback = stoppedFor('home', { type: 'touchback', team: 'home', at: { x: 6, y: 5 } }, {
        quarter: 3,
        pendingKick: { kind: 'kickoff', kickingTeam: 'away', receivingTeam: 'home', from: { x: 19, y: 5 }, distance: 12, roll: { die1: 6, die2: 6 } },
      });

      expect(startNextDown(halftimeTouchback).drivesThisQuarter).toEqual({ home: 0, away: 0 });
    });
  });
});

describe('game flow', () => {
  it('keeps all pieces in bounds and on legal sides when the line is in an end zone', () => {
    const leftPinned = createGame({ lineOfScrimmage: 1, firstDownLine: 3 });
    expect(leftPinned.pieces).toHaveLength(22);
    expect(leftPinned.pieces.every((item) => item.coord.x >= 0 && item.coord.x < leftPinned.board.width)).toBe(true);
    expect(new Set(leftPinned.pieces.map((item) => `${item.coord.x},${item.coord.y}`)).size).toBe(22);
    expect(leftPinned.pieces.filter((item) => item.team === 'home').every((item) => item.coord.x <= leftPinned.lineOfScrimmage)).toBe(true);
    expect(leftPinned.pieces.filter((item) => item.team === 'away').every((item) => item.coord.x > leftPinned.lineOfScrimmage)).toBe(true);

    const rightPinned = createGame({ possession: 'away', direction: -1, turn: 'away', lineOfScrimmage: 22, firstDownLine: 20 });
    expect(rightPinned.pieces).toHaveLength(22);
    expect(rightPinned.pieces.every((item) => item.coord.x >= 0 && item.coord.x < rightPinned.board.width)).toBe(true);
    expect(new Set(rightPinned.pieces.map((item) => `${item.coord.x},${item.coord.y}`)).size).toBe(22);
    expect(rightPinned.pieces.filter((item) => item.team === 'away').every((item) => item.coord.x >= rightPinned.lineOfScrimmage)).toBe(true);
    expect(rightPinned.pieces.filter((item) => item.team === 'home').every((item) => item.coord.x < rightPinned.lineOfScrimmage)).toBe(true);
  });

  it('starts from formation, snaps to live play, and alternates turns', () => {
    let state = createGame();
    expect(state.phase).toBe('formation');
    expect(state.formationShiftsRemaining.home).toBe(2);

    state = applyAction(state, { type: 'confirmFormation', side: 'offense' });
    state = applyAction(state, { type: 'shift', pieceId: 'home-wr1', to: { x: 4, y: 0 } });
    expect(state.formationShiftsRemaining.home).toBe(1);

    state = applyAction(state, { type: 'confirmFormation', side: 'defense' });
    state = applyAction(state, { type: 'snap' });
    expect(state.phase).toBe('live');
    expect(state.ball.kind === 'controlled' ? state.ball.pieceId : '').toBe('home-qb');

    state = applyAction(state, { type: 'move', pieceId: 'home-qb', to: { x: 3, y: 6 } });
    expect(state.turn).toBe('away');
  });

  it('prevents pre-snap shifts across the line of scrimmage', () => {
    let state = createGame();
    state = applyAction(state, { type: 'confirmFormation', side: 'offense' });
    state = applyAction(state, { type: 'confirmFormation', side: 'defense' });

    expect(() => applyAction(state, { type: 'shift', pieceId: 'home-rb', to: { x: 6, y: 2 } })).toThrow('line of scrimmage');
    expect(() => applyAction(state, { type: 'shift', pieceId: 'away-fb', to: { x: 4, y: 2 } })).toThrow('line of scrimmage');
    expect(generateLegalActions(state)).not.toContainEqual({ type: 'shift', pieceId: 'home-rb', to: { x: 6, y: 2 } });
    expect(generateLegalActions(state)).not.toContainEqual({ type: 'shift', pieceId: 'away-fb', to: { x: 4, y: 2 } });
  });

  it('advances stopped plays into the next formation', () => {
    let state = liveGame(createGame({ down: 2 }));
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => (item.id === 'away-fb' ? { ...item, coord: { x: 3, y: 4 } } : item)),
    };

    state = applyAction(state, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-qb' });
    const next = startNextDown(state);

    expect(next.phase).toBe('formation');
    expect(next.forwardPassUsed).toBe(false);
    expect(next.formationShiftsRemaining).toEqual({ home: 2, away: 2 });
    expect(next.play.actions).toEqual([]);
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('home-qb');
    expect(piece(next, 'home-qb').coord.x).toBe(next.lineOfScrimmage - 1);
    expect(piece(next, 'away-fb').coord.x).toBe(next.lineOfScrimmage + 2);
  });

  it('places the next line of scrimmage in front of the stopped ball carrier', () => {
    let state = liveGame();
    state = applyAction(state, { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 9, y: 4 } };
        if (item.id === 'away-fb') return { ...item, coord: { x: 9, y: 5 } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'home-rb' },
    };

    state = applyAction(state, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-rb' });
    const next = startNextDown(state);

    expect(next.lineOfScrimmage).toBe(9);
    expect(piece(next, 'home-qb').coord.x).toBe(8);
  });

  it('places the next line of scrimmage at the stopped ball square when moving left', () => {
    let state = liveGame(createGame({ possession: 'away', direction: -1, turn: 'away', lineOfScrimmage: 18, firstDownLine: 16 }));
    state = applyAction(state, { type: 'handoff', fromId: 'away-qb', toId: 'away-rb' });
    state = {
      ...state,
      turn: 'home',
      pieces: state.pieces.map((item) => {
        if (item.id === 'away-rb') return { ...item, coord: { x: 14, y: 4 } };
        if (item.id === 'home-fb') return { ...item, coord: { x: 14, y: 5 } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'away-rb' },
    };

    state = applyAction(state, { type: 'tackle', defenderId: 'home-fb', targetId: 'away-rb' });
    const next = startNextDown(state);

    expect(next.lineOfScrimmage).toBe(14);
    expect(piece(next, 'away-qb').coord.x).toBe(15);
  });

  it('starts a new possession at first down after a turnover on downs', () => {
    let state = liveGame(createGame({ down: 4, firstDownLine: 8 }));
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-qb') return item;
        if (item.team === 'home') return { ...item, coord: { x: 3, y: item.coord.y } };
        return { ...item, coord: { x: 18, y: item.coord.y } };
      }),
    };

    const stopped = applyAction(state, { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1', roll: { die1: 1, die2: 2 } });
    const next = startNextDown(stopped);

    expect(stopped.possession).toBe('away');
    expect(stopped.ball).toEqual({ kind: 'controlled', pieceId: 'away-qb' });
    expect(next.possession).toBe('away');
    expect(next.down).toBe(1);
    expect(next.lineOfScrimmage).toBe(5);
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('away-qb');
  });

  it('spots a fourth-down tackle turnover where the carrier was stopped', () => {
    let state = liveGame(createGame({ down: 4, lineOfScrimmage: 5, firstDownLine: 8 }));
    state = {
      ...state,
      turn: 'away',
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-rb') return { ...item, coord: { x: 7, y: 5 } };
        if (item.id === 'away-fb') return { ...item, coord: { x: 7, y: 6 } };
        return item;
      }),
      ball: { kind: 'controlled', pieceId: 'home-rb' },
    };

    const stopped = applyAction(state, { type: 'tackle', defenderId: 'away-fb', targetId: 'home-rb', roll: { die1: 5, die2: 5 } });
    const next = startNextDown(stopped);

    expect(stopped.play.result).toEqual({ type: 'turnoverOnDowns', team: 'away' });
    expect(stopped.ball).toEqual({ kind: 'controlled', pieceId: 'away-qb' });
    expect(next.possession).toBe('away');
    expect(next.lineOfScrimmage).toBe(7);
  });

  it('starts a new possession at first down after an interception', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.id === 'away-wr1') return { ...item, coord: { x: 10, y: 6 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away' && item.id !== 'away-wr1') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const stopped = applyAction(state, { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1', roll: { die1: 1, die2: 1 } });
    const next = startNextDown(stopped);

    expect(next.possession).toBe('away');
    expect(next.down).toBe(1);
    expect(next.lineOfScrimmage).toBe(10);
    expect(next.ball.kind === 'controlled' ? next.ball.pieceId : '').toBe('away-qb');
  });

  it('spots interceptions at the defender square without overlapping the receiver', () => {
    let state = liveGame();
    state = {
      ...state,
      pieces: state.pieces.map((item) => {
        if (item.id === 'home-wr1') return { ...item, coord: { x: 10, y: 5 } };
        if (item.id === 'away-wr1') return { ...item, coord: { x: 9, y: 5 } };
        if (item.team === 'home' && item.id !== 'home-qb' && item.id !== 'home-wr1') return { ...item, coord: { x: 3, y: item.coord.y } };
        if (item.team === 'away' && item.id !== 'away-wr1') return { ...item, coord: { x: 18, y: item.coord.y } };
        return item;
      }),
    };

    const stopped = applyAction(state, { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1', roll: { die1: 1, die2: 1 } });
    const next = startNextDown(stopped);

    expect(piece(stopped, 'away-wr1').coord).toEqual({ x: 9, y: 5 });
    expect(piece(stopped, 'home-wr1').coord).toEqual({ x: 10, y: 5 });
    expect(stopped.ball).toEqual({ kind: 'controlled', pieceId: 'away-wr1' });
    expect(next.lineOfScrimmage).toBe(9);
  });
});


describe('series and conversion regression coverage', () => {
  it.each(['home', 'away'] as const)('preserves short gains and losses through Next for %s', (team) => {
    const direction = team === 'home' ? 1 : -1;
    const defense = team === 'home' ? 'away' : 'home';
    const origin = team === 'home' ? 6 : 17;
    for (const gain of [-1, 1, 2]) {
      const at = origin + gain * direction;
      const state = createGame({ phase: 'live', possession: team, turn: defense, direction,
        down: 1, lineOfScrimmage: origin, firstDownLine: origin + 2 * direction,
        ball: { kind: 'controlled', pieceId: `${team}-rb` },
        pieces: [
          { id: `${team}-rb`, team, role: 'rb', label: 'RB', coord: { x: at, y: 5 } },
          { id: `${defense}-rb`, team: defense, role: 'rb', label: 'MLB', coord: { x: at, y: 6 } },
        ],
      });
      const stopped = applyAction(state, { type: 'tackle', defenderId: `${defense}-rb`, targetId: `${team}-rb`, roll: { die1: 5, die2: 5 } });
      const next = startNextDown(stopped);
      expect(next.down).toBe(gain === 2 ? 1 : 2);
      expect(next.firstDownLine).toBe(gain === 2 ? at + 2 * direction : state.firstDownLine);
      expect(moveDistanceToFirstDown(next, { x: at, y: 5 })).toBe(gain === 2 ? 2 : 2 - gain);
      // An incomplete pass on the next down must also preserve the same target.
      const incomplete = applyAction(liveGame(next), { type: 'pass', passerId: `${team}-qb`, receiverId: `${team}-wr1`, roll: { die1: 1, die2: 2 } });
      expect(startNextDown(incomplete).firstDownLine).toBe(next.firstDownLine);
    }
  });

  it.each(['home', 'away'] as const)('rejects field goals and punts during a %s two-point try', (team) => {
    const touchdown = createGame({ phase: 'betweenDowns', possession: team, turn: team,
      score: { home: 6, away: 6 }, play: { actions: [], result: { type: 'touchdown', team } },
    });
    const state = liveGame(applyAction(touchdown, { type: 'startTwoPointTry', team }));
    expect(generateLegalActions(state).some(action => action.type === 'kick')).toBe(false);
    for (const kind of ['fieldGoal', 'punt'] as const) {
      expect(() => applyAction(state, { type: 'kick', kickerId: `${team}-qb`, kind, roll: { die1: 6, die2: 6 } })).toThrow(/two-point/i);
    }
    expect(state.score).toEqual({ home: 6, away: 6 });
  });
});
