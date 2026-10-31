import { describe, expect, it } from 'vitest';
import { activeRoleCode, actionOdds, applyAction, createGame, generateLegalActions, startNextDown } from './rules';
import { chooseComputerAction } from './computer';
import type { GameState } from './types';

const confirm = (state: GameState) => applyAction(applyAction(state, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });

describe.each(['home', 'away'] as const)('%s fake field goal', team => {
  const base = () => createGame({ possession: team, turn: team, lineOfScrimmage: team === 'home' ? 12 : 11 });
  const setup = () => applyAction(base(), { type: 'chooseFormation', side: 'offense', formationId: 'field-goal-unit' });

  it('snaps to the holder without moving either unit and offers normal passing actions', () => {
    const ready = confirm(setup());
    const next = applyAction(ready, { type: 'fakeFieldGoal' });
    expect(next.phase).toBe('live');
    expect(next.turn).toBe(team);
    expect(next.ball).toEqual({ kind: 'controlled', pieceId: `${team}-fb` });
    expect(next.pieces).toEqual(ready.pieces);
    expect(next.down).toBe(ready.down);
    expect(next.lineOfScrimmage).toBe(ready.lineOfScrimmage);
    expect(next.firstDownLine).toBe(ready.firstDownLine);
    expect(activeRoleCode(next, next.pieces.find(piece => piece.id === `${team}-fb`)!)).toBe('H');
    expect(activeRoleCode(next, next.pieces.find(piece => piece.id === `${team}-qb`)!)).toBe('K');
    const actions = generateLegalActions(next);
    expect(actions).toContainEqual({ type: 'pass', passerId: `${team}-fb`, receiverId: `${team}-wr1` });
    expect(actions.some(action => action.type === 'pass' && action.receiverId === `${team}-ol1`)).toBe(false);
    expect(actions.some(action => action.type === 'kick' || action.type === 'fakeFieldGoal')).toBe(false);
    expect(() => applyAction(next, { type: 'kick', kind: 'fieldGoal', kickerId: `${team}-qb` })).toThrow(/before the snap/);
    const caught = applyAction(next, { type: 'pass', passerId: `${team}-fb`, receiverId: `${team}-wr1`, roll: { die1: 6, die2: 6 } });
    expect(caught.ball).toEqual({ kind: 'controlled', pieceId: `${team}-wr1` });
    expect(caught.forwardPassUsed).toBe(true);
    expect(caught.turn).not.toBe(team);
  });

  it('uses a down on an incomplete fake and turns over on fourth down', () => {
    for (const down of [1, 4] as const) {
      const fake = applyAction(confirm({ ...setup(), down }), { type: 'fakeFieldGoal' });
      const stopped = applyAction(fake, { type: 'pass', passerId: `${team}-fb`, receiverId: `${team}-wr1`, roll: { die1: 1, die2: 2 } });
      expect(stopped.play.result?.type).toBe(down === 4 ? 'turnoverOnDowns' : 'incomplete');
      expect(stopped.down).toBe(down === 4 ? 1 : 2);
      const next = startNextDown(stopped);
      expect(next.fakeFieldGoal).toBeUndefined();
      expect(next.kickDefenseId).toBeUndefined();
      expect(next.playType).toBe('normal');
      expect(next.possession === team).toBe(down !== 4);
    }
  });

  it.each([2, 5, 12, 18, 21])('safe defense preserves offense and remains valid at line %s', lineOfScrimmage => {
    let state = applyAction(createGame({ possession: team, turn: team, lineOfScrimmage }), { type: 'chooseFormation', side: 'offense', formationId: 'field-goal-unit' });
    const original = state;
    const kick = { type: 'kick', kind: 'fieldGoal', kickerId: `${team}-qb` } as const;
    state = applyAction(state, { type: 'chooseFormation', side: 'defense', formationId: 'safe-field-goal-defense' });
    expect(state.pieces.filter(piece => piece.team === team)).toEqual(original.pieces.filter(piece => piece.team === team));
    expect(state.pieces.filter(piece => piece.team !== team)).not.toEqual(original.pieces.filter(piece => piece.team !== team));
    expect(new Set(state.pieces.map(piece => `${piece.coord.x},${piece.coord.y}`)).size).toBe(22);
    expect(state.pieces.every(piece => piece.coord.x >= 0 && piece.coord.x < 24 && piece.coord.y >= 0 && piece.coord.y < 11)).toBe(true);
    expect(actionOdds(state, kick)).toEqual(actionOdds(original, kick));
  });

  it('can be chosen by the computer and is followed by a legal holder pass', () => {
    const ready = confirm(setup());
    const players = { home: 'computer', away: 'computer' } as const;
    expect(chooseComputerAction(ready, generateLegalActions(ready), 7, players)).toEqual({ type: 'fakeFieldGoal' });
    const fake = applyAction(ready, { type: 'fakeFieldGoal' });
    const action = chooseComputerAction(fake, generateLegalActions(fake), 8, players);
    expect(action).toMatchObject({ type: 'pass', passerId: `${team}-fb` });
    expect(generateLegalActions(fake)).toContainEqual(action);
  });
});

it('changes grouped offense choices atomically and resets both confirmations across groups', () => {
  let state = applyAction(createGame(), { type: 'confirmFormation', side: 'defense' });
  state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'field-goal-unit' });
  expect(state.playType).toBe('fieldGoal');
  expect(state.formationConfirmed).toEqual({ offense: false, defense: false });
  state = applyAction(state, { type: 'chooseFormation', side: 'defense', formationId: 'safe-field-goal-defense' });
  state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'punt-unit' });
  expect(state.playType).toBe('punt');
  expect(state.kickDefenseId).toBeUndefined();
  state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: 'trips' });
  expect(state.playType).toBe('normal');
  expect(state.formation.offense.id).toBe('trips');
});

it('rejects fakes without both confirmations, in a punt, during live play, or on a conversion', () => {
  for (const state of [createGame(), createGame({ playType: 'fieldGoal' }), createGame({ playType: 'punt' }), createGame({ phase: 'live', playType: 'fieldGoal' }), createGame({ playType: 'fieldGoal', conversion: { team: 'home' } })]) {
    expect(() => applyAction(state, { type: 'fakeFieldGoal' })).toThrow();
  }
  const conversion = createGame({ conversion: { team: 'home' } });
  expect(() => applyAction(conversion, { type: 'chooseFormation', side: 'offense', formationId: 'field-goal-unit' })).toThrow(/two-point/);
});
