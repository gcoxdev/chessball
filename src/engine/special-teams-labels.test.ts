import { describe, expect, it } from 'vitest';
import { activeRoleCode, activeRoleDescription, applyAction, createGame, generateLegalActions, startNextDown } from './rules';
import type { GameState, Team } from './types';

const role = (state: GameState, id: string) => activeRoleCode(state, state.pieces.find(piece => piece.id === id)!);
const labels = (state: GameState) => state.pieces.map(piece => activeRoleCode(state, piece));

describe.each(['home', 'away'] as const)('%s special teams', team => {
  const receivingTeam: Team = team === 'home' ? 'away' : 'home';

  it('keeps kickoff labels from the toss choice through placement, return and tackle, then restores normal positions', () => {
    const tossed = applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: team === 'home' ? 'heads' : 'tails' });
    const kickoff = applyAction(tossed, { type: 'chooseKickoffChoice', team, choice: 'kick' });
    expect(role(kickoff, `${team}-qb`)).toBe('K');
    expect(role(kickoff, `${team}-wr1`)).toBe('ST');
    expect(role(kickoff, `${receivingTeam}-wr1`)).toBe('KR');
    expect(role(kickoff, `${receivingTeam}-wr2`)).toBe('KR');
    expect(role(kickoff, `${receivingTeam}-qb`)).toBe('BL');
    const expected = labels(kickoff);
    const kicked = applyAction(kickoff, { type: 'kick', kind: 'kickoff', kickerId: `${team}-qb`, roll: { die1: 3, die2: 4 } });
    expect(kicked.phase).toBe('kickPlacement');
    expect(labels(kicked)).toEqual(expected);
    const at = { x: team === 'home' ? 15 : 8, y: 5 };
    const returned = applyAction(kicked, { type: 'placeKick', at });
    expect(returned.phase).toBe('kickReturn');
    expect(returned.possession).toBe(receivingTeam);
    expect(labels(returned)).toEqual(expected);
    const arranged = { ...returned, pieces: returned.pieces.map(piece => ({ ...piece, coord:
      piece.id === `${receivingTeam}-wr1` ? at : piece.id === `${team}-wr1` ? { x: at.x, y: 6 } : piece.coord,
    })) };
    const recovered = applyAction(arranged, { type: 'recover', pieceId: `${receivingTeam}-wr1` });
    const tackle = { type: 'tackle', defenderId: `${team}-wr1`, targetId: `${receivingTeam}-wr1` } as const;
    expect(generateLegalActions(recovered)).toContainEqual(tackle);
    const stopped = applyAction(recovered, { ...tackle, roll: { die1: 5, die2: 5 } });
    expect(stopped.phase).toBe('betweenDowns');
    expect(labels(stopped)).toEqual(expected);
    const next = startNextDown(stopped);
    expect(next.phase).toBe('formation');
    expect(role(next, `${receivingTeam}-qb`)).toBe('QB');
    expect(role(next, `${team}-qb`)).toBe('FS');
    expect(role(next, `${receivingTeam}-wr1`)).toBe('WR');
  });

  it('labels the actual punter even when a running back kicks', () => {
    const state = createGame({ phase: 'live', possession: team, turn: team, lineOfScrimmage: team === 'home' ? 5 : 18, ball: { kind: 'controlled', pieceId: `${team}-rb` } });
    const kicked = applyAction(state, { type: 'kick', kind: 'punt', kickerId: `${team}-rb`, roll: { die1: 3, die2: 4 } });
    expect(role(kicked, `${team}-rb`)).toBe('P');
    expect(role(kicked, `${team}-qb`)).toBe('ST');
    expect(role(kicked, `${receivingTeam}-wr1`)).toBe('PR');
    expect(role(kicked, `${receivingTeam}-ol1`)).toBe('BL');
    const placement = generateLegalActions(kicked).find(action => action.type === 'placeKick' && action.at.y === 5)!;
    const returned = applyAction(kicked, placement);
    expect(returned.phase).toBe('kickReturn');
    expect(labels(returned)).toEqual(labels(kicked));
    expect(activeRoleDescription(returned, returned.pieces.find(piece => piece.id === `${team}-rb`)!)).toBe('Punter');
  });

  it('keeps a missed field goal kicker labeled K after possession changes', () => {
    const state = createGame({ phase: 'live', possession: team, turn: team, ball: { kind: 'controlled', pieceId: `${team}-rb` } });
    const missed = applyAction(state, { type: 'kick', kind: 'fieldGoal', kickerId: `${team}-rb`, roll: { die1: 1, die2: 1 } });
    expect(missed.possession).toBe(receivingTeam);
    expect(role(missed, `${team}-rb`)).toBe('K');
    expect(role(missed, `${team}-ol1`)).toBe('BL');
    expect(role(missed, `${receivingTeam}-wr1`)).toBe('ST');
    expect(role(startNextDown(missed), `${team}-rb`)).toBe('MLB');
  });

  it('keeps punt labels through a touchback and clears them for the next down', () => {
    const state = createGame({ phase: 'live', possession: team, turn: team, lineOfScrimmage: team === 'home' ? 20 : 3 });
    const kicked = applyAction(state, { type: 'kick', kind: 'punt', kickerId: `${team}-qb`, roll: { die1: 5, die2: 5 } });
    const placement = generateLegalActions(kicked).find(action => action.type === 'placeKick' && action.at.y === 5)!;
    const stopped = applyAction(kicked, placement);
    expect(stopped.play.result?.type).toBe('touchback');
    expect(labels(stopped)).toEqual(labels(kicked));
    expect(role(startNextDown(stopped), `${team}-qb`)).toBe('FS');
  });

  it('uses the extra-point kicker instead of the old kickoff unit after a return touchdown', () => {
    const touchdown = createGame({ phase: 'betweenDowns', possession: team, turn: team,
      pendingKick: { kind: 'kickoff', kickingTeam: receivingTeam, receivingTeam: team, from: { x: 8, y: 5 }, distance: 7, roll: { die1: 3, die2: 4 } },
      play: { actions: [], result: { type: 'touchdown', team } },
    });
    const converted = applyAction(touchdown, { type: 'kick', kind: 'extraPoint', kickerId: `${team}-qb`, roll: { die1: 5, die2: 5 } });
    expect(role(converted, `${team}-qb`)).toBe('K');
    expect(role(converted, `${receivingTeam}-qb`)).toBe('ST');
    const nextKickoff = startNextDown(converted);
    expect(nextKickoff.phase).toBe('kickoff');
    expect(role(nextKickoff, `${team}-qb`)).toBe('K');
    expect(role(nextKickoff, `${receivingTeam}-wr1`)).toBe('KR');
  });
});
