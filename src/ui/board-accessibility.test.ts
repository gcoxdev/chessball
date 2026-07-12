import { describe, expect, it } from 'vitest';
import { chooseBoardFocus, describeBoardSquare, moveBoardFocus } from './board-accessibility';

describe('moveBoardFocus', () => {
  it.each([
    ['ArrowLeft', { x: 2, y: 2 }, { x: 1, y: 2 }],
    ['ArrowRight', { x: 2, y: 2 }, { x: 3, y: 2 }],
    ['ArrowUp', { x: 2, y: 2 }, { x: 2, y: 1 }],
    ['ArrowDown', { x: 2, y: 2 }, { x: 2, y: 3 }],
  ])('moves %s one square', (key, coord, expected) => {
    expect(moveBoardFocus(coord, key, { width: 6, height: 5 })).toEqual(expected);
  });

  it.each([
    ['ArrowLeft', { x: 0, y: 2 }],
    ['ArrowRight', { x: 5, y: 2 }],
    ['ArrowUp', { x: 2, y: 0 }],
    ['ArrowDown', { x: 2, y: 4 }],
  ])('clamps %s at its board edge', (key, coord) => {
    expect(moveBoardFocus(coord, key, { width: 6, height: 5 })).toEqual(coord);
  });

  it('uses the supplied dimensions rather than standard field dimensions', () => {
    expect(moveBoardFocus({ x: 2, y: 1 }, 'ArrowRight', { width: 3, height: 2 })).toEqual({ x: 2, y: 1 });
    expect(moveBoardFocus({ x: 2, y: 1 }, 'ArrowDown', { width: 3, height: 2 })).toEqual({ x: 2, y: 1 });
  });

  it('returns the input coordinate for unrelated keys', () => {
    const coord = { x: 2, y: 2 };
    expect(moveBoardFocus(coord, 'Enter', { width: 6, height: 5 })).toBe(coord);
  });
});

describe('chooseBoardFocus', () => {
  const board = { width: 6, height: 5 };

  it('preserves a focused coordinate while it remains valid', () => {
    expect(chooseBoardFocus({ board, focused: { x: 4, y: 3 }, selected: { x: 2, y: 2 }, ball: { x: 1, y: 1 } }))
      .toEqual({ x: 4, y: 3 });
  });

  it('initially prioritizes the selected piece, then the visible ball, then the first square', () => {
    expect(chooseBoardFocus({ board, selected: { x: 2, y: 2 }, ball: { x: 1, y: 1 } })).toEqual({ x: 2, y: 2 });
    expect(chooseBoardFocus({ board, ball: { x: 1, y: 1 } })).toEqual({ x: 1, y: 1 });
    expect(chooseBoardFocus({ board })).toEqual({ x: 0, y: 0 });
  });

  it('falls through to the next valid choice when dimensions invalidate coordinates', () => {
    expect(chooseBoardFocus({
      board: { width: 2, height: 2 },
      focused: { x: 4, y: 3 },
      selected: { x: 2, y: 0 },
      ball: { x: 1, y: 1 },
    })).toEqual({ x: 1, y: 1 });
  });
});

describe('describeBoardSquare', () => {
  it('describes the coordinate, occupant, ball, selection, and every applicable action state', () => {
    expect(describeBoardSquare({
      coord: { x: 3, y: 4 },
      occupant: { team: 'home', activeRole: 'QB' },
      ball: 'controlled',
      selected: true,
      legalMove: true,
      powerMove: true,
      passTarget: true,
      tackleTarget: true,
      kickPlacement: true,
    })).toBe('Square 3, 4; home QB; controlled ball; selected; legal move; power move; pass target; tackle target; kick placement');
  });

  it('describes a loose ball without inventing occupant or action states', () => {
    expect(describeBoardSquare({ coord: { x: 1, y: 2 }, ball: 'loose' })).toBe('Square 1, 2; loose ball');
  });

  it('describes history as read-only and omits otherwise supplied action phrases', () => {
    const name = describeBoardSquare({
      coord: { x: 0, y: 0 },
      readOnly: true,
      legalMove: true,
      powerMove: true,
      passTarget: true,
      tackleTarget: true,
      kickPlacement: true,
    });

    expect(name).toBe('Square 0, 0; read-only history');
    expect(name).not.toMatch(/legal move|power move|pass target|tackle target|kick placement/);
  });
});
