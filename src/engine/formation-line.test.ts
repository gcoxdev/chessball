import { describe, expect, it } from 'vitest';
import { applyAction, createGame, defensiveFormations, generateLegalActions, offensiveFormations, scrimmageKickPreview, startNextDown } from './rules';
import { spotBoundary } from './field';
import { specialTeamsDefensiveFormations } from './special-teams';
import type { GameState } from './types';

function assertSides(state: GameState) {
  const boundary = spotBoundary(state.lineOfScrimmage, state.direction);
  for (const piece of state.pieces) {
    const onLeft = (piece.team === state.possession) === (state.direction === 1);
    // Compare the entire square against the painted line, not just its index.
    if (onLeft) expect(piece.coord.x + 1, piece.id).toBeLessThanOrEqual(boundary);
    else expect(piece.coord.x, piece.id).toBeGreaterThanOrEqual(boundary);
  }
  const center = state.pieces.find(p => p.id === `${state.possession}-ol3`)!;
  const nose = state.pieces.find(p => p.id === `${state.possession === 'home' ? 'away' : 'home'}-ol3`)!;
  expect(state.direction === 1 ? center.coord.x + 1 : center.coord.x).toBe(boundary);
  expect(state.direction === 1 ? nose.coord.x : nose.coord.x + 1).toBe(boundary);
  expect(new Set(state.pieces.map(p => `${p.coord.x},${p.coord.y}`)).size).toBe(22);
}

describe.each(['home', 'away'] as const)('%s formation line alignment', possession => {
  it.each([2, 5, 12, 18, 21])('puts every preset on the correct side of the painted line at column %s', lineOfScrimmage => {
    for (const offense of offensiveFormations) {
      for (const defense of defensiveFormations) {
        assertSides(createGame({ possession, lineOfScrimmage, formation: { offense, defense } }));
      }
    }
    for (const playType of ['fieldGoal', 'punt'] as const) {
      for (const defense of specialTeamsDefensiveFormations[playType]) {
        const game = createGame({ possession, lineOfScrimmage, playType, kickDefenseId: defense.id });
        assertSides(game);
        expect(scrimmageKickPreview(game, playType).kicker).toEqual(game.pieces.find(p => p.id === `${possession}-qb`)!.coord);
      }
    }
  });

  it('does not offer or apply a shift across the painted line', () => {
    const game = createGame({ possession, lineOfScrimmage: 12, formationConfirmed: { offense: true, defense: true } });
    for (const action of generateLegalActions(game)) {
      if (action.type !== 'shift') continue;
      const piece = game.pieces.find(p => p.id === action.pieceId)!;
      const bound = spotBoundary(game.lineOfScrimmage, game.direction);
      const onLeft = (piece.team === possession) === (game.direction === 1);
      expect(onLeft ? action.to.x + 1 <= bound : action.to.x >= bound).toBe(true);
    }
    const blocker = game.pieces.find(p => p.id === `${possession}-te`)!;
    expect(() => applyAction(game, { type: 'shift', pieceId: blocker.id, to: { x: blocker.coord.x + game.direction, y: blocker.coord.y } })).toThrow();
  });

  it('preserves alignment when choosing formations, starting the next down, or lining up a conversion', () => {
    let game = applyAction(createGame({ possession, lineOfScrimmage: 12 }), { type: 'chooseFormation', side: 'offense', formationId: 'shotgun' });
    game = applyAction(game, { type: 'chooseFormation', side: 'defense', formationId: 'nickel' });
    assertSides(game);
    assertSides(startNextDown({ ...game, phase: 'betweenDowns', play: { actions: [], result: { type: 'incomplete', at: { x: 12, y: 1 } } } }));
    assertSides(applyAction({ ...game, phase: 'betweenDowns', play: { actions: [], result: { type: 'touchdown', team: possession } } }, { type: 'startTwoPointTry', team: possession }));
  });
});
