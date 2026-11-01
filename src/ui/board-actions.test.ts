import { expect, it } from 'vitest';
import { createGame, generateLegalActions } from '../engine/rules';
import { boardActions, boardCoordKey } from './board-actions';
import type { Action } from '../engine/types';

it('shows moves, handoffs, and passes together, with no-roll handoffs taking precedence', () => {
  const game = createGame({ phase: 'live', lineOfScrimmage: 12 });
  const legal = generateLegalActions(game);
  // The same result regardless of engine action ordering.
  for (const actions of [legal, [...legal].reverse()]) {
    const targets = boardActions(game, actions, 'home-qb');
    for (const type of ['move', 'handoff', 'pass']) expect([...targets.values()].some(action => action.type === type)).toBe(true);
    for (const handoff of legal.filter(action => action.type === 'handoff')) {
      const receiver = game.pieces.find(piece => piece.id === handoff.toId)!;
      expect(targets.get(boardCoordKey(receiver.coord))?.type).toBe('handoff');
    }
  }
  expect(boardActions(game, legal).size).toBe(0);
  expect(boardActions(game, legal, 'away-qb').size).toBe(0);
});

it('prefers an ordinary path over a power roll to the same destination', () => {
  const game = createGame({ phase: 'live' });
  const actions: Action[] = [
    { type: 'powerMove', pieceId: 'home-rb', to: { x: 5, y: 5 } },
    { type: 'move', pieceId: 'home-rb', to: { x: 5, y: 5 } },
  ];
  for (const order of [actions, [...actions].reverse()]) expect(boardActions(game, order, 'home-rb').get('5,5')?.type).toBe('move');
});
