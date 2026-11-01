import { describe, expect, it } from 'vitest';
import { chooseComputerAction } from './computer';
import { actionOdds, applyAction, createGame, defensiveFormations, generateLegalActions } from './rules';
import type { GameState } from './types';

const players = { home: 'computer', away: 'computer' } as const;

describe.each(['home', 'away'] as const)('computer defense against %s offense', possession => {
  const defense = possession === 'home' ? 'away' : 'home';
  it.each(defensiveFormations)('moves out of the $name front instead of repeating a double-six-only tackle', formation => {
    let game = createGame({ possession, lineOfScrimmage: 12, formationConfirmed: { offense: true, defense: false } });
    game = applyAction(game, { type: 'chooseFormation', side: 'defense', formationId: formation.id });
    game = applyAction(game, { type: 'confirmFormation', side: 'defense' });
    game = applyAction(game, { type: 'snap' });
    const receiver = game.pieces.find(p => p.id === `${possession}-wr1`)!;
    game = applyAction(game, { type: 'move', pieceId: receiver.id, to: { x: receiver.coord.x, y: 0 } });
    const legal = generateLegalActions(game);
    const tackles = legal.filter(a => a.type === 'tackle');
    expect(tackles.length).toBeGreaterThan(0);
    expect(tackles.every(a => actionOdds(game, a)!.successChance < .5)).toBe(true);
    for (let seed = 0; seed < 8; seed++) {
      const action = chooseComputerAction(game, legal, seed, players)!;
      expect(action.type).toBe('move');
      expect(legal).toContainEqual(action);
      if (action.type !== 'move') throw new Error('Expected an open movement route');
      const carrier = game.pieces.find(p => p.id === `${possession}-qb`)!;
      const mover = game.pieces.find(p => p.id === action.pieceId)!;
      const distance = (x: number, y: number) => Math.max(Math.abs(x - carrier.coord.x), Math.abs(y - carrier.coord.y));
      expect(distance(action.to.x, action.to.y)).toBeLessThan(distance(mover.coord.x, mover.coord.y));
      const next = applyAction(game, action);
      expect(next.turn).toBe(possession);
      expect(next.pieces.filter(p => p.team === defense)).not.toEqual(game.pieces.filter(p => p.team === defense));
    }
    // A poor tackle remains available if movement is exhausted.
    expect(chooseComputerAction(game, tackles, 0, players)?.type).toBe('tackle');
  });

  it('chooses the strongest available tackle instead of a weaker distant attempt', () => {
    const game: GameState = createGame({ phase: 'live', possession, turn: defense,
      ball: { kind: 'controlled', pieceId: `${possession}-qb` },
      pieces: [
        { id: `${possession}-qb`, team: possession, role: 'qb', label: 'QB', coord: { x: 12, y: 5 } },
        { id: `${defense}-wr1`, team: defense, role: 'wr', label: 'CB', coord: { x: 12, y: 6 } },
        { id: `${defense}-rb`, team: defense, role: 'rb', label: 'MLB', coord: { x: 15, y: 5 } },
      ],
    });
    for (let seed = 0; seed < 8; seed++) {
      expect(chooseComputerAction(game, generateLegalActions(game), seed, players)).toEqual({ type: 'tackle', defenderId: `${defense}-wr1`, targetId: `${possession}-qb` });
    }
  });
});
