import { describe, expect, it } from 'vitest';
import { applyAction, createGame, moveDistanceToFirstDown, startNextDown } from './rules';
import { spotBoundary } from './field';
import type { GameState, Team } from './types';

const opponent = (team: Team): Team => team === 'home' ? 'away' : 'home';
const tackle = (state: GameState) => applyAction(state, {
  type: 'tackle', defenderId: `${opponent(state.possession)}-rb`, targetId: `${state.possession}-wr1`, roll: { die1: 5, die2: 5 },
});

describe.each(['home', 'away'] as const)('%s dead-ball spotting', possession => {
  const direction = possession === 'home' ? 1 : -1;
  const defense = opponent(possession);
  const frontBoundary = (x: number) => x + (direction === 1 ? 1 : 0);

  it.each(['kickoff', 'punt'] as const)('keeps the line at the returner’s front edge after a %s tackle and Next', kind => {
    for (const x of [5, 12, 18]) {
      let state = createGame({ phase: 'kickReturn', possession, turn: possession,
        lineOfScrimmage: x - direction,
        pendingKick: { kind, kickingTeam: defense, receivingTeam: possession, from: { x: 12, y: 5 }, distance: 10, roll: { die1: 5, die2: 5 } },
        ball: { kind: 'loose', coord: { x: x - direction, y: 5 } },
        pieces: [
          { id: `${possession}-wr1`, team: possession, role: 'wr', label: 'KR', coord: { x: x - direction, y: 5 } },
          { id: `${defense}-rb`, team: defense, role: 'rb', label: 'COV', coord: { x, y: 7 } },
        ],
      });
      state = applyAction(state, { type: 'recover', pieceId: `${possession}-wr1` });
      state = applyAction(state, { type: 'move', pieceId: `${defense}-rb`, to: { x, y: 6 } });
      state = applyAction(state, { type: 'move', pieceId: `${possession}-wr1`, to: { x, y: 5 } });
      const stopped = tackle(state);
      expect(stopped.play.result).toMatchObject({ type: 'tackle', at: { x, y: 5 } });
      expect(stopped.pieces.find(p => p.id === `${possession}-wr1`)!.coord.x).toBe(x);
      expect(spotBoundary(stopped.lineOfScrimmage, direction)).toBe(frontBoundary(x));
      const next = startNextDown(stopped);
      expect(next.possession).toBe(possession);
      expect(next.down).toBe(1);
      expect(spotBoundary(next.lineOfScrimmage, direction)).toBe(frontBoundary(x));
      expect(next.pieces.find(p => p.id === `${possession}-ol3`)!.coord.x).toBe(x);
      expect(moveDistanceToFirstDown(next, { x: next.lineOfScrimmage, y: 5 })).toBe(2);
      expect(next.drivesThisQuarter[defense]).toBe(kind === 'punt' ? 1 : 0);
    }
  });

  it.each([-1, 0, 1, 2])('spots a normal tackle with a gain of %s squares without adding or losing five yards', gain => {
    const line = 12;
    const x = line + (gain - 1) * direction;
    const state = createGame({ phase: 'live', possession, turn: defense, lineOfScrimmage: line,
      ball: { kind: 'controlled', pieceId: `${possession}-wr1` },
      pieces: [
        { id: `${possession}-wr1`, team: possession, role: 'wr', label: 'WR', coord: { x, y: 5 } },
        { id: `${defense}-rb`, team: defense, role: 'rb', label: 'MLB', coord: { x, y: 6 } },
      ],
    });
    const stopped = tackle(state);
    const next = startNextDown(stopped);
    expect(spotBoundary(stopped.lineOfScrimmage, direction)).toBe(frontBoundary(x));
    expect(next.lineOfScrimmage).toBe(line + gain * direction);
    expect(next.down).toBe(gain === 2 ? 1 : 2);
    expect(moveDistanceToFirstDown(next, { x: next.lineOfScrimmage, y: 5 })).toBe(gain === 2 ? 2 : 2 - gain);
    const turnover = tackle({ ...state, down: 4 });
    if (gain < 2) {
      expect(turnover.play.result?.type).toBe('turnoverOnDowns');
      expect(spotBoundary(turnover.lineOfScrimmage, turnover.direction)).toBe(frontBoundary(x));
      expect(startNextDown(turnover).lineOfScrimmage).toBe(turnover.lineOfScrimmage);
    } else expect(turnover.possession).toBe(possession);
  });

  it('keeps the same physical line when an incomplete fourth-down pass reverses possession', () => {
    const state = createGame({ phase: 'live', possession, turn: possession, lineOfScrimmage: 12, down: 4 });
    const stopped = applyAction(state, { type: 'pass', passerId: `${possession}-qb`, receiverId: `${possession}-wr1`, roll: { die1: 1, die2: 2 } });
    expect(stopped.play.result?.type).toBe('turnoverOnDowns');
    expect(spotBoundary(stopped.lineOfScrimmage, stopped.direction)).toBe(spotBoundary(state.lineOfScrimmage, direction));
    expect(startNextDown(stopped).lineOfScrimmage).toBe(stopped.lineOfScrimmage);
  });
});
