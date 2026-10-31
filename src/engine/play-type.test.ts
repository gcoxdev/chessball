import { describe, expect, it } from 'vitest';
import { activeRoleCode, actionOdds, applyAction, createGame, generateLegalActions, scrimmageKickPreview, startNextDown } from './rules';
import { chooseComputerAction } from './computer';
import type { GameState } from './types';

const confirm = (game: GameState) => applyAction(applyAction(game, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });

describe.each(['home', 'away'] as const)('%s pre-snap kicking', team => {
  const opponent = team === 'home' ? 'away' : 'home';
  for (const kind of ['fieldGoal', 'punt'] as const) {
    it.each([2, 5, 12, 18, 21])(`${kind} has distinct, legal positions near line %s`, lineOfScrimmage => {
      const base = createGame({ possession: team, turn: team, lineOfScrimmage });
      const setup = applyAction(base, { type: 'choosePlayType', playType: kind });
      expect(setup.pieces).toHaveLength(22);
      expect(new Set(setup.pieces.map(piece => `${piece.coord.x},${piece.coord.y}`)).size).toBe(22);
      for (const piece of setup.pieces) {
        expect(piece.coord.x).toBeGreaterThanOrEqual(0);
        expect(piece.coord.x).toBeLessThan(24);
        expect(piece.coord.y).toBeGreaterThanOrEqual(0);
        expect(piece.coord.y).toBeLessThan(11);
        const relative = (piece.coord.x - lineOfScrimmage) * setup.direction;
        if (piece.team === team) expect(relative).toBeLessThanOrEqual(0);
        else expect(relative).toBeGreaterThan(0);
      }
      expect(generateLegalActions(setup).some(action => ['move', 'shift', 'snap', 'kick', 'fakeFieldGoal'].includes(action.type))).toBe(false);
      const kicker = setup.pieces.find(piece => piece.id === `${team}-qb`)!;
      expect(activeRoleCode(setup, kicker)).toBe(kind === 'punt' ? 'P' : 'K');
      expect(activeRoleCode(setup, setup.pieces.find(piece => piece.id === `${team}-ol3`)!)).toBe('LS');
      expect(scrimmageKickPreview(base, kind).kicker).toEqual(kicker.coord);
      const kick = { type: 'kick', kind, kickerId: kicker.id } as const;
      expect(() => applyAction(setup, kick)).toThrow(/confirmed/);
      const ready = confirm(setup);
      expect(generateLegalActions(ready)).toEqual(kind === 'fieldGoal' ? [kick, { type: 'fakeFieldGoal' }] : [kick]);
      expect(() => applyAction(ready, { type: 'snap' })).toThrow(/combined/);
      expect(() => applyAction(ready, { ...kick, kickerId: `${team}-rb` })).toThrow(/designated/);
      const kicked = applyAction(ready, { ...kick, roll: { die1: 4, die2: 4 } });
      expect(kicked.phase).toBe(kind === 'punt' ? 'kickPlacement' : 'betweenDowns');
      if (kind === 'punt') {
        const preview = scrimmageKickPreview(setup, kind);
        for (const total of [2, 12]) {
          const result = applyAction(ready, { ...kick, roll: { die1: total / 2, die2: total / 2 } });
          expect(generateLegalActions(result).every(action => action.type === 'placeKick' && action.at.x === (total === 2 ? preview.minLandingX : preview.maxLandingX))).toBe(true);
        }
      } else {
        const odds = actionOdds(ready, kick)!;
        expect(kicked.play.result).toMatchObject({ type: 'fieldGoal', good: 8 >= odds.required });
        const next = startNextDown(kicked);
        expect(next.playType).toBe('normal');
      }
    });
  }

  it('lets a computer select and execute a kick while waiting for a human defense', () => {
    let state = createGame({ possession: team, turn: team, down: 4, lineOfScrimmage: team === 'home' ? 19 : 4 });
    const players = { [team]: 'computer', [opponent]: 'human' } as Record<'home' | 'away', 'computer' | 'human'>;
    const choose = () => chooseComputerAction(state, generateLegalActions(state), 1, players);
    expect(choose()).toEqual({ type: 'choosePlayType', playType: 'fieldGoal' });
    state = applyAction(state, choose()!);
    state = applyAction(state, choose()!);
    expect(choose()).toBeNull();
    state = applyAction(state, { type: 'confirmFormation', side: 'defense' });
    expect(choose()).toEqual({ type: 'kick', kind: 'fieldGoal', kickerId: `${team}-qb` });
    expect(generateLegalActions(state)).toContainEqual(choose());
  });
});

it('switching play type resets confirmations and restores normal formation choices and shifts', () => {
  let state = applyAction(createGame(), { type: 'chooseFormation', side: 'offense', formationId: 'trips' });
  const normalPieces = state.pieces;
  state = applyAction(state, { type: 'confirmFormation', side: 'defense' });
  state = applyAction(state, { type: 'choosePlayType', playType: 'punt' });
  expect(state.formationConfirmed).toEqual({ offense: false, defense: false });
  expect(state.formationShiftsRemaining).toEqual({ home: 0, away: 0 });
  expect(() => applyAction(state, { type: 'chooseFormation', side: 'defense', formationId: '4-3' })).toThrow(/Unknown/);
  expect(() => applyAction(state, { type: 'shift', pieceId: 'home-qb', to: { x: 1, y: 5 } })).toThrow(/cannot be shifted/);
  state = applyAction(state, { type: 'choosePlayType', playType: 'normal' });
  expect(state.pieces).toEqual(normalPieces);
  expect(state.formationShiftsRemaining).toEqual({ home: 2, away: 2 });
  state = applyAction(state, { type: 'confirmFormation', side: 'offense' });
  expect(() => applyAction(state, { type: 'choosePlayType', playType: 'punt' })).toThrow(/before confirming/);
});

it('rejects live kicks and disallows kicking formations on a two-point try', () => {
  for (const kind of ['fieldGoal', 'punt'] as const) {
    const live = createGame({ phase: 'live' });
    expect(generateLegalActions(live).some(action => action.type === 'kick')).toBe(false);
    expect(() => applyAction(live, { type: 'kick', kind, kickerId: 'home-qb' })).toThrow(/before the snap/);
    const conversion = createGame({ conversion: { team: 'home' } });
    expect(generateLegalActions(conversion).some(action => action.type === 'choosePlayType')).toBe(false);
    expect(() => applyAction(conversion, { type: 'choosePlayType', playType: kind })).toThrow(/two-point/);
  }
});

it('restores normal roles for a two-point try after a punt-return touchdown', () => {
  const touchdown = createGame({ phase: 'betweenDowns', playType: 'punt', possession: 'away', turn: 'away',
    pendingKick: { kind: 'punt', kickingTeam: 'home', receivingTeam: 'away', from: { x: 5, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
    play: { actions: [], result: { type: 'touchdown', team: 'away' } },
  });
  const conversion = applyAction(touchdown, { type: 'startTwoPointTry', team: 'away' });
  expect(conversion.playType).toBe('normal');
  expect(conversion.pendingKick?.kind).toBe('punt');
  expect(activeRoleCode(conversion, conversion.pieces.find(piece => piece.id === 'away-qb')!)).toBe('QB');
  expect(activeRoleCode(conversion, conversion.pieces.find(piece => piece.id === 'home-qb')!)).toBe('FS');
});
