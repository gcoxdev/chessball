import { describe, expect, it } from 'vitest';
import { activeRoleCode, activeRoleDescription, applyAction, createGame, generateLegalActions, offensiveFormations } from './rules';
import type { GameState } from './types';

const confirm = (state: GameState) => applyAction(applyAction(state, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });

describe.each(['home', 'away'] as const)('%s center', team => {
  it.each(offensiveFormations)('holds the ball in $name and snaps it to the QB', formation => {
    let state = createGame({ possession: team, lineOfScrimmage: 12 });
    state = applyAction(state, { type: 'chooseFormation', side: 'offense', formationId: formation.id });
    const center = state.pieces.find(piece => piece.id === `${team}-ol3`)!;
    expect(activeRoleCode(state, center)).toBe('C');
    expect(activeRoleDescription(state, center)).toBe('Center');
    expect(center.role).toBe('ol');
    expect(state.ball).toEqual({ kind: 'controlled', pieceId: center.id });
    expect(generateLegalActions(state).some(action => action.type === 'handoff' || action.type === 'pass')).toBe(false);
    state = applyAction(confirm(state), { type: 'snap' });
    expect(state.ball).toEqual({ kind: 'controlled', pieceId: `${team}-qb` });
    expect(state.turn).toBe(team);
    expect(generateLegalActions(state).some(action => action.type === 'pass' && action.receiverId === center.id)).toBe(false);
  });

  it.each(['fieldGoal', 'punt'] as const)('snaps from the long snapper for a %s', playType => {
    const setup = confirm(createGame({ possession: team, playType, lineOfScrimmage: 12 }));
    const center = setup.pieces.find(piece => piece.id === `${team}-ol3`)!;
    expect(setup.ball).toEqual({ kind: 'controlled', pieceId: center.id });
    expect(activeRoleCode(setup, center)).toBe('LS');
    const kicked = applyAction(setup, { type: 'kick', kind: playType, kickerId: `${team}-qb`, roll: { die1: 6, die2: 6 } });
    expect(kicked.phase).toBe(playType === 'punt' ? 'kickPlacement' : 'betweenDowns');
    if (playType === 'fieldGoal') {
      const fake = applyAction(setup, { type: 'fakeFieldGoal' });
      expect(fake.ball).toEqual({ kind: 'controlled', pieceId: `${team}-fb` });
    }
  });

  it('starts a two-point try on the Center and switches back from kicking formations', () => {
    const touchdown = createGame({ possession: team, phase: 'betweenDowns', play: { actions: [], result: { type: 'touchdown', team } } });
    const trySetup = applyAction(touchdown, { type: 'startTwoPointTry', team });
    expect(trySetup.ball).toEqual({ kind: 'controlled', pieceId: `${team}-ol3` });
    const normal = applyAction(createGame({ possession: team, playType: 'punt' }), { type: 'choosePlayType', playType: 'normal' });
    expect(normal.ball).toEqual({ kind: 'controlled', pieceId: `${team}-ol3` });
  });
});
