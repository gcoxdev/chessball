import { describe, expect, it } from 'vitest';
import { actionOdds, applyAction, createGame, firstDownTarget, generateLegalActions, isGoalToGo, startNextDown } from './rules';
import { chooseComputerAction } from './computer';
import type { Action, Coord, GameState, Team } from './types';

const roll = { die1: 5, die2: 5 };
const other = (team: Team): Team => team === 'home' ? 'away' : 'home';
const direction = (team: Team) => team === 'home' ? 1 as const : -1 as const;
function arrange(state: GameState, coords: Record<string, Coord>): GameState {
  let x = 0;
  return { ...state, pieces: state.pieces.map(piece => ({ ...piece, coord: coords[piece.id] ?? { x: x++, y: 0 } })) };
}
function legalApply(state: GameState, action: Action): GameState {
  const { roll: _roll, ...unrolled } = action as Action & { roll?: unknown };
  expect(generateLegalActions(state)).toContainEqual(unrolled);
  return applyAction(state, action);
}

for (const team of ['home', 'away'] as const) {
  const opponent = other(team);
  const dir = direction(team);
  describe(`${team} gameplay regressions`, () => {
    it.each([false, true])('scores an end-zone handoff (conversion=%s)', conversion => {
      const state = arrange(createGame({ phase: 'live', possession: team, turn: team, conversion: conversion ? { team } : undefined, ball: { kind: 'controlled', pieceId: `${team}-qb` } }), {
        [`${team}-qb`]: { x: dir === 1 ? 21 : 2, y: 5 },
        [`${team}-rb`]: { x: dir === 1 ? 22 : 1, y: 5 },
      });
      const next = legalApply(state, { type: 'handoff', fromId: `${team}-qb`, toId: `${team}-rb` });
      expect(next.phase).toBe('betweenDowns');
      expect(next.score[team]).toBe(conversion ? 2 : 6);
      expect(next.play.result).toMatchObject({ type: conversion ? 'twoPoint' : 'touchdown', team });
      const converted = conversion ? next : applyAction(next, { type: 'kick', kind: 'extraPoint', kickerId: `${team}-qb`, roll });
      expect(startNextDown(converted)).toMatchObject({ phase: 'kickoff', turn: team });
    });

    for (const kind of ['kickoff', 'punt'] as const) {
      it.each([-2, 0, 3])(`${kind} return starts first down after a %s-column gain`, gain => {
        const at = 12 + gain * dir;
        const returned = arrange(createGame({ phase: 'kickReturn', possession: team, turn: opponent, lineOfScrimmage: 12, pendingKick: { kind, kickingTeam: opponent, receivingTeam: team, from: { x: 5, y: 5 }, distance: 7, roll }, ball: { kind: 'controlled', pieceId: `${team}-wr1` } }), {
          [`${team}-wr1`]: { x: at, y: 5 }, [`${opponent}-wr1`]: { x: at, y: 6 },
        });
        const next = startNextDown(legalApply(returned, { type: 'tackle', defenderId: `${opponent}-wr1`, targetId: `${team}-wr1`, roll }));
        expect(next).toMatchObject({ phase: 'formation', possession: team, down: 1, lineOfScrimmage: at, firstDownLine: firstDownTarget(at, dir) });
        expect(next.drivesThisQuarter[opponent]).toBe(kind === 'punt' ? 1 : 0);
      });
    }

    it('awards an untouched punt to the receiver when it lands under coverage', () => {
      const kickerX = dir === 1 ? 5 : 18;
      const landingX = kickerX + 7 * dir;
      let state = arrange(createGame({ phase: 'live', possession: team, turn: team, ball: { kind: 'controlled', pieceId: `${team}-qb` } }), {
        [`${team}-qb`]: { x: kickerX, y: 5 }, [`${team}-wr1`]: { x: landingX, y: 5 }, [`${opponent}-wr1`]: { x: landingX, y: 8 },
      });
      state = legalApply(state, { type: 'kick', kickerId: `${team}-qb`, kind: 'punt', roll: { die1: 3, die2: 4 } });
      state = legalApply(state, { type: 'placeKick', at: { x: landingX, y: 5 } });
      state = legalApply(state, { type: 'move', pieceId: `${opponent}-wr1`, to: { x: landingX, y: 7 } });
      state = legalApply(state, { type: 'recover', pieceId: `${team}-wr1` });
      expect(state).toMatchObject({ possession: opponent, down: 1, play: { result: { type: 'kickTouched', receivingTeam: opponent } } });
      expect(startNextDown(state).drivesThisQuarter[team]).toBe(1);
    });

    it('keeps goal-to-go after losses and turns over a scoreless fourth down', () => {
      const line = dir === 1 ? 21 : 2;
      let state = createGame({ phase: 'live', possession: team, turn: opponent, lineOfScrimmage: line, ball: { kind: 'controlled', pieceId: `${team}-qb` } });
      expect(isGoalToGo(state)).toBe(true);
      for (let down = 1; down <= 4; down++) {
        const at = down === 1 ? line - dir : line;
        state = arrange({ ...state, phase: 'live', turn: opponent }, { [`${team}-qb`]: { x: at, y: 5 }, [`${opponent}-wr1`]: { x: at, y: 6 } });
        state = legalApply(state, { type: 'tackle', defenderId: `${opponent}-wr1`, targetId: `${team}-qb`, roll });
        if (down < 4) {
          state = startNextDown(state);
          expect(state.down).toBe(down + 1);
          expect(isGoalToGo(state)).toBe(true);
        }
      }
      expect(state.play.result).toEqual({ type: 'turnoverOnDowns', team: opponent });
    });

    it('allows the final ordinary first down, then establishes goal-to-go', () => {
      const line = dir === 1 ? 19 : 4;
      let state = arrange(createGame({ phase: 'live', possession: team, turn: opponent, lineOfScrimmage: line, ball: { kind: 'controlled', pieceId: `${team}-qb` } }), {
        [`${team}-qb`]: { x: line + 2 * dir, y: 5 }, [`${opponent}-wr1`]: { x: line + 2 * dir, y: 6 },
      });
      expect(isGoalToGo(state)).toBe(false);
      state = startNextDown(legalApply(state, { type: 'tackle', defenderId: `${opponent}-wr1`, targetId: `${team}-qb`, roll }));
      expect(state.down).toBe(1);
      expect(isGoalToGo(state)).toBe(true);
    });
  });
}

it.each(['offense', 'defense'] as const)('preserves confirmed %s shifts when the other formation changes', side => {
  let state = legalApply(createGame(), { type: 'confirmFormation', side });
  const shift = generateLegalActions(state).find(action => action.type === 'shift')!;
  state = legalApply(state, shift);
  const shifted = state.pieces.filter(piece => piece.team === (side === 'offense' ? 'home' : 'away'));
  const remaining = state.formationShiftsRemaining;
  state = legalApply(state, { type: 'chooseFormation', side: side === 'offense' ? 'defense' : 'offense', formationId: side === 'offense' ? 'nickel' : 'shotgun' });
  expect(state.pieces.filter(piece => piece.team === shifted[0].team)).toEqual(shifted);
  expect(state.formationShiftsRemaining[shifted[0].team]).toBe(remaining[shifted[0].team]);
  expect(new Set(state.pieces.map(piece => `${piece.coord.x},${piece.coord.y}`)).size).toBe(22);
});

it('uses another legal action when a computer returner is boxed in', () => {
  const state = arrange(createGame({ phase: 'kickReturn', possession: 'away', turn: 'away', pendingKick: { kind: 'punt', kickingTeam: 'home', receivingTeam: 'away', from: { x: 5, y: 5 }, distance: 7, roll }, ball: { kind: 'controlled', pieceId: 'away-wr1' } }), {
    'away-wr1': { x: 10, y: 5 }, 'home-qb': { x: 9, y: 4 }, 'home-rb': { x: 10, y: 4 }, 'home-fb': { x: 11, y: 4 }, 'home-wr1': { x: 9, y: 5 }, 'home-wr2': { x: 11, y: 5 }, 'home-te': { x: 9, y: 6 }, 'home-ol1': { x: 10, y: 6 }, 'home-ol2': { x: 11, y: 6 },
  });
  const legal = generateLegalActions(state);
  expect(legal.filter(action => action.type === 'move' && action.pieceId === 'away-wr1')).toHaveLength(0);
  const action = chooseComputerAction(state, legal, 1, { home: 'computer', away: 'computer' });
  expect(action).not.toBeNull();
  expect(legalApply(state, action!).turn).toBe('home');
});

it.each([1, 2] as const)('finishes a match with %s drive(s) per team per quarter and preserves halftime', drives => {
  let state = createGame({ drivesPerTeamPerQuarter: drives });
  for (let quarter = 1; quarter <= 4; quarter++) {
    for (let drive = 0; drive < drives; drive++) {
      for (const owner of ['home', 'away'] as const) {
        state = startNextDown({ ...state, phase: 'betweenDowns', possession: other(owner), direction: direction(other(owner)), lineOfScrimmage: 12, play: { actions: [], result: { type: 'fieldGoal', team: owner, good: false } } });
        if (drive === drives - 1 && owner === 'away') {
          expect(state.quarter).toBe(Math.min(4, quarter + 1));
          if (quarter === 2) expect(state).toMatchObject({ phase: 'kickoff', turn: 'away' });
        } else expect(state.quarter).toBe(quarter);
      }
    }
  }
  expect(state.phase).toBe('final');
  expect(state.drivesThisQuarter).toEqual({ home: drives, away: drives });
});

it('calculates odds from the same roll thresholds, including otherwise impossible strips', () => {
  const state = arrange(createGame({ phase: 'live', turn: 'away' }), {
    'away-rb': { x: 5, y: 5 }, 'home-qb': { x: 8, y: 5 }, 'home-ol1': { x: 6, y: 5 }, 'home-ol2': { x: 7, y: 5 },
  });
  const tackle: Action = { type: 'tackle', defenderId: 'away-rb', targetId: 'home-qb' };
  expect(generateLegalActions(state)).toContainEqual(tackle);
  expect(actionOdds(state, tackle)).toEqual({ required: 13, successChance: 1 / 36, stripChance: 1 / 36 });
  let stops = 0;
  for (let die1 = 1; die1 <= 6; die1++) for (let die2 = 1; die2 <= 6; die2++) {
    if (applyAction(state, { ...tackle, roll: { die1, die2 } }).phase === 'betweenDowns') stops++;
  }
  expect(stops / 36).toBe(actionOdds(state, tackle)?.successChance);
  expect(actionOdds(state, { type: 'kick', kind: 'extraPoint', kickerId: 'home-qb' })?.successChance).toBe(30 / 36);
  expect(actionOdds(state, { type: 'kick', kind: 'punt', kickerId: 'home-qb' })).toBeUndefined();
});

it('matches displayed success odds to all 36 rolls for passes, power moves, and scoring kicks', () => {
  const state = arrange(createGame({ phase: 'live', lineOfScrimmage: 12 }), {
    'home-qb': { x: 12, y: 5 }, 'home-wr1': { x: 14, y: 5 }, 'home-rb': { x: 9, y: 7 }, 'away-ol1': { x: 10, y: 7 },
  });
  const cases: { game: GameState; action: Action; succeeded: (next: GameState) => boolean }[] = [
    { game: state, action: { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1' }, succeeded: next => next.ball.kind === 'controlled' && next.ball.pieceId === 'home-wr1' },
    { game: state, action: { type: 'powerMove', pieceId: 'home-rb', to: { x: 11, y: 7 } }, succeeded: next => next.pieces.find(piece => piece.id === 'home-rb')?.coord.x === 11 },
    { game: state, action: { type: 'kick', kind: 'fieldGoal', kickerId: 'home-qb' }, succeeded: next => next.score.home === 3 },
    { game: { ...state, phase: 'betweenDowns', play: { actions: [], result: { type: 'touchdown', team: 'home' } } }, action: { type: 'kick', kind: 'extraPoint', kickerId: 'home-qb' }, succeeded: next => next.score.home === 1 },
  ];
  for (const { game, action, succeeded } of cases) {
    expect(generateLegalActions(game)).toContainEqual(action);
    let successes = 0;
    for (let die1 = 1; die1 <= 6; die1++) for (let die2 = 1; die2 <= 6; die2++) {
      if (succeeded(applyAction(game, { ...action, roll: { die1, die2 } } as Action))) successes++;
    }
    expect(actionOdds(game, action)?.successChance).toBe(successes / 36);
  }
});
