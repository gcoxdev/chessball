import { describe, expect, it } from 'vitest';
import { actionTeam, applyAction, createGame, fieldGoalAttempt, generateLegalActions, startNextDown } from './rules';
import { fieldSpotLabel, ownYardLineColumn, spotBoundary } from './field';
import { actionOpportunityKeys, chooseActionForTeamPolicies, driveOutcomeForTransition, simulateGame, validateGameStateInvariants } from './simulator';
import type { Action, GameState, Team } from './types';

const ready = (state: GameState) => applyAction(applyAction(state, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });

describe('assessment engine regressions', () => {
  it.each(['home', 'away'] as const)('starts a fresh conversion play for %s', team => {
    const touchdown = createGame({ phase: 'betweenDowns', possession: team, score: { home: 6, away: 6 }, play: { result: { type: 'touchdown', team }, actions: [{ type: 'move', pieceId: `${team}-qb`, to: { x: team === 'home' ? 22 : 1, y: 5 } }] } });
    let state = applyAction(touchdown, { type: 'startTwoPointTry', team });
    expect(state.play).toEqual({ actions: [{ type: 'startTwoPointTry', team }] });
    state = ready(state);
    const shift = generateLegalActions(state).find(a => a.type === 'shift')!;
    state = applyAction(state, shift);
    state = applyAction(state, { type: 'snap' });
    const move = generateLegalActions(state).find(a => a.type === 'move' && a.pieceId !== `${team}-qb`)!;
    state = applyAction(state, move);
    expect(state.play.result).toBeUndefined();
    expect(state.score).toEqual(touchdown.score);
    expect(touchdown.play.result?.type).toBe('touchdown');
  });

  it('rejects distant, diagonal, fractional and unconfirmed shifts', () => {
    const unconfirmed = createGame({ lineOfScrimmage: 12 });
    const state = ready(unconfirmed);
    for (const to of [{ x: 2, y: 0 }, { x: 9, y: 0 }, { x: 10.5, y: 0 }]) {
      expect(() => applyAction(state, { type: 'shift', pieceId: 'home-wr1', to })).toThrow();
    }
    const shift = { type: 'shift', pieceId: 'home-wr1', to: { x: 10, y: 0 } } as const;
    expect(generateLegalActions(state)).toContainEqual(shift);
    expect(applyAction(state, shift).formationShiftsRemaining.home).toBe(1);
    expect(() => applyAction(unconfirmed, shift)).toThrow('Confirm');
    expect(generateLegalActions(unconfirmed).some(a => a.type === 'shift')).toBe(false);
  });

  it.each([0, 7, 99, -1, 1.5, NaN, Infinity])('rejects invalid dice %s before resolving a kick', die1 => {
    const state = ready(createGame({ playType: 'fieldGoal', lineOfScrimmage: 18 }));
    expect(() => applyAction(state, { type: 'kick', kind: 'fieldGoal', kickerId: 'home-qb', roll: { die1, die2: 6 } })).toThrow('Dice');
  });

  it('detects malformed states and rejects unsupported constructors', () => {
    const state = createGame();
    state.pieces[0].coord.x += 0.5;
    state.score.home = -1;
    state.play.actions = [{ type: 'kick', kind: 'fieldGoal', kickerId: 'home-qb', roll: { die1: 99, die2: 1 } }];
    expect(validateGameStateInvariants(state).join(' ')).toMatch(/noninteger/);
    expect(validateGameStateInvariants(state).join(' ')).toMatch(/Scores/);
    expect(validateGameStateInvariants(state).join(' ')).toMatch(/dice/);
    expect(() => createGame({ board: { width: 12, height: 11 } })).toThrow('field');
    expect(() => createGame({ possession: 'away', direction: 1 })).toThrow('Direction');
  });

  it.each([5, 20, 25, 35, 50, 75, 95])('mirrors %s-yard spots, labels and distance to posts', yards => {
    const home = ownYardLineColumn('home', yards), away = ownYardLineColumn('away', yards);
    expect(home + away).toBe(23);
    expect((spotBoundary(home, 1) - 2) * 5).toBe(yards);
    expect((22 - spotBoundary(away, -1)) * 5).toBe(yards);
    expect(fieldGoalAttempt(1, { x: home, y: 5 })).toEqual(fieldGoalAttempt(-1, { x: away, y: 5 }));
    expect(fieldGoalAttempt(1, { x: home, y: 5 }).yards).toBe(110 - yards);
    expect(fieldSpotLabel(home, 1)).toBe(yards === 50 ? '50' : yards < 50 ? `Home ${yards}` : `Away ${100 - yards}`);
    expect(fieldSpotLabel(away, -1)).toBe(yards === 50 ? '50' : yards < 50 ? `Away ${yards}` : `Home ${100 - yards}`);
  });

  it.each(['home', 'away'] as const)('places the %s kicker on its stated spot', team => {
    let state = applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: team === 'home' ? 'heads' : 'tails' });
    state = applyAction(state, { type: 'chooseKickoffChoice', team, choice: 'kick' });
    expect(state.pieces.find(p => p.id === `${team}-qb`)?.coord.x).toBe(state.lineOfScrimmage);
    expect(fieldSpotLabel(state.lineOfScrimmage, state.direction)).toBe(`${team === 'home' ? 'Home' : 'Away'} 35`);
  });

  it.each(['home', 'away'] as const)('uses the defensive policy and owner when %s attacks', possession => {
    const defense: Team = possession === 'home' ? 'away' : 'home';
    const state = applyAction(createGame({ possession }), { type: 'confirmFormation', side: 'offense' });
    const legal = generateLegalActions(state);
    const select = (offensePolicy: 'random' | 'heuristic') => chooseActionForTeamPolicies(state, legal, () => .5, { [possession]: offensePolicy, [defense]: 'random' } as Record<Team, 'random' | 'heuristic'>, 0);
    expect(select('random')).toEqual(select('heuristic'));
    expect(select('random')).toMatchObject({ type: 'chooseFormation', side: 'defense' });
    expect(actionTeam(state, select('random')!)).toBe(defense);
    const contexts = actionOpportunityKeys(state, { home: 'heuristic', away: 'random' }, legal);
    expect(contexts.length).toBeGreaterThan(0);
    expect(contexts.every(key => key.startsWith(`team=${defense}|policy=${defense === 'home' ? 'heuristic' : 'random'}|`))).toBe(true);
  });

  it('counts a punt drive once at Next, including a touchback', () => {
    const state = ready(createGame({ playType: 'punt', lineOfScrimmage: 20 }));
    const kick = applyAction(state, { type: 'kick', kind: 'punt', kickerId: 'home-qb', roll: { die1: 6, die2: 6 } });
    const place = generateLegalActions(kick).find(a => a.type === 'placeKick')!;
    const stopped = applyAction(kick, place);
    expect(stopped.play.result?.type).toBe('touchback');
    expect(driveOutcomeForTransition(state, kick)).toBeNull();
    expect(driveOutcomeForTransition(kick, stopped)).toBeNull();
    const next = startNextDown(stopped);
    expect(driveOutcomeForTransition(stopped, next)).toBe('punt');
    expect(driveOutcomeForTransition(next, next)).toBeNull();
  });

  it('counts a converted touchdown once and keeps conversion stats separate', () => {
    const td = createGame({ phase: 'betweenDowns', score: { home: 6, away: 0 }, play: { actions: [], result: { type: 'touchdown', team: 'home' } } });
    const converted = applyAction(td, { type: 'kick', kind: 'extraPoint', kickerId: 'home-qb', roll: { die1: 3, die2: 4 } });
    expect(driveOutcomeForTransition(td, converted)).toBeNull();
    expect(driveOutcomeForTransition(converted, startNextDown(converted))).toBe('touchdown');
  });

  it('records a strip turnover when its drive is consumed', () => {
    const state = createGame({ phase: 'live', turn: 'away', lineOfScrimmage: 12, pieces: [
      { id: 'home-qb', team: 'home', role: 'qb', label: 'QB', coord: { x: 11, y: 5 } },
      { id: 'away-rb', team: 'away', role: 'rb', label: 'MLB', coord: { x: 10, y: 5 } },
    ] });
    const stopped = applyAction(state, { type: 'tackle', defenderId: 'away-rb', targetId: 'home-qb', roll: { die1: 6, die2: 6 } });
    expect(stopped.play.result?.type).toBe('fumble');
    const next = startNextDown(stopped);
    expect(next.drivesThisQuarter).toEqual({ home: 1, away: 0 });
    expect(driveOutcomeForTransition(stopped, next)).toBe('fumble');
  });

  it.each(['kickoff', 'punt'] as const)('accounts for a %s return touchdown through its conversion', kind => {
    const td = createGame({ phase: 'betweenDowns', possession: 'away', score: { home: 0, away: 6 },
      pendingKick: { kind, kickingTeam: 'home', receivingTeam: 'away', from: { x: 9, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      play: { actions: [], result: { type: 'touchdown', team: 'away' } } });
    const converted = applyAction(td, { type: 'kick', kind: 'extraPoint', kickerId: 'away-qb', roll: { die1: 5, die2: 5 } });
    const next = startNextDown(converted);
    expect(driveOutcomeForTransition(converted, next)).toBe(kind === 'punt' ? 'punt' : null);
    expect(next.drivesThisQuarter).toEqual({ home: kind === 'punt' ? 1 : 0, away: 0 });
    expect(next.score.away).toBe(7);
  });

  it.each([2, 4] as const)('counts the last drive even when Q%s advances to halftime or final', quarter => {
    const stopped = createGame({ phase: 'betweenDowns', quarter, drivesThisQuarter: { home: 1, away: 2 },
      play: { actions: [], result: { type: 'fieldGoal', team: 'home', good: true } } });
    const next = startNextDown(stopped);
    expect(next.phase).toBe(quarter === 2 ? 'kickoff' : 'final');
    expect(driveOutcomeForTransition(stopped, next)).toBe('fieldGoalGood');
  });

  it('places goal-to-go at the goal line, one square beyond the five', () => {
    expect(fieldSpotLabel(21, 1)).toBe('Away 5');
    expect(fieldSpotLabel(2, -1)).toBe('Home 5');
    expect(spotBoundary(22, 1)).toBe(22);
    expect(spotBoundary(1, -1)).toBe(2);
  });

  it.each(['heuristic', 'random', 'computer'] as const)('applies generated actions through a complete %s game without invariant errors', policy => {
    const result = simulateGame({ seed: 17, policy, drivesPerTeamPerQuarter: 1, maxActions: 5000 });
    expect(result.status).toBe('completed');
    expect(result.anomalies).toEqual([]);
    expect(result.summary.driveOutcomes.total).toBeGreaterThan(0);
    expect(Object.keys(result.summary.driveOutcomes).some(k => /extraPoint|twoPoint/.test(k))).toBe(false);
  });

  it('can apply every offered setup action for each owner', () => {
    for (const possession of ['home', 'away'] as const) {
      const state = createGame({ possession, lineOfScrimmage: 12 });
      for (const action of generateLegalActions(state)) {
        expect(() => applyAction(state, action as Action)).not.toThrow();
      }
    }
  });
});

it.each(['home', 'away'] as const)('allows at most two confirmed %s shifts and none after the snap', possession => {
  let state = ready(createGame({ possession, lineOfScrimmage: 12 }));
  const receiver = state.pieces.find(p => p.id === `${possession}-wr1`)!;
  const shift = { type: 'shift', pieceId: receiver.id, to: { x: receiver.coord.x, y: 0 } } as const;
  state = applyAction(state, shift);
  state = applyAction(state, { ...shift, to: receiver.coord });
  expect(state.formationShiftsRemaining[possession]).toBe(0);
  expect(() => applyAction(state, shift)).toThrow('no formation shifts remaining');
  expect(generateLegalActions(state).some(a => a.type === 'shift' && a.pieceId.startsWith(possession))).toBe(false);
  expect(() => applyAction(applyAction(state, { type: 'snap' }), shift)).toThrow('during formation');
});
