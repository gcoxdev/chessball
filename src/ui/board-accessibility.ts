import type { Board, Coord, Team } from '../engine/types';

export type BoardFocusChoices = {
  board: Board;
  focused?: Coord;
  selected?: Coord;
  ball?: Coord;
};

export type BoardSquareDescription = {
  coord: Coord;
  occupant?: {
    team: Team;
    activeRole: string;
  };
  ball?: 'controlled' | 'loose';
  selected?: boolean;
  legalMove?: boolean;
  powerMove?: boolean;
  passTarget?: boolean;
  handoffTarget?: boolean;
  recoveryTarget?: boolean;
  tackleTarget?: boolean;
  kickPlacement?: boolean;
  readOnly?: boolean;
};

export function moveBoardFocus(coord: Coord, key: string, board: Board): Coord {
  switch (key) {
    case 'ArrowLeft':
      return { x: Math.max(0, coord.x - 1), y: coord.y };
    case 'ArrowRight':
      return { x: Math.min(board.width - 1, coord.x + 1), y: coord.y };
    case 'ArrowUp':
      return { x: coord.x, y: Math.max(0, coord.y - 1) };
    case 'ArrowDown':
      return { x: coord.x, y: Math.min(board.height - 1, coord.y + 1) };
    default:
      return coord;
  }
}

export function chooseBoardFocus({ board, focused, selected, ball }: BoardFocusChoices): Coord {
  return [focused, selected, ball].find((coord): coord is Coord => isOnBoard(coord, board)) ?? { x: 0, y: 0 };
}

export function describeBoardSquare(square: BoardSquareDescription): string {
  const phrases = [`Square ${square.coord.x}, ${square.coord.y}`];

  if (square.occupant) phrases.push(`${square.occupant.team} ${square.occupant.activeRole}`);
  if (square.ball) phrases.push(`${square.ball} ball`);
  if (square.selected) phrases.push('selected');

  if (square.readOnly) {
    phrases.push('read-only history');
  } else {
    if (square.legalMove) phrases.push('legal move');
    if (square.powerMove) phrases.push('power move');
    if (square.passTarget) phrases.push('pass target');
    if (square.handoffTarget) phrases.push('handoff target');
    if (square.recoveryTarget) phrases.push('recover ball');
    if (square.tackleTarget) phrases.push('tackle target');
    if (square.kickPlacement) phrases.push('kick placement');
  }

  return phrases.join('; ');
}

function isOnBoard(coord: Coord | undefined, board: Board): coord is Coord {
  return coord !== undefined && coord.x >= 0 && coord.x < board.width && coord.y >= 0 && coord.y < board.height;
}
