import type { Coord, Direction, Team } from './types';

export const FIELD_WIDTH = 24;
export const FIELD_HEIGHT = 11;
export const FIELD_START = 2;
export const FIELD_END = 21;
export const YARDS_PER_COLUMN = 5;

// Stored line/yard spots use the cell boundary nearest the offense's own goal.
// A stopped carrier's occupied cell must first be converted to the line cell
// across its front edge. Mirror both cell and direction to preserve position.
export function spotBoundary(column: number, direction: Direction): number {
  return column + (direction === 1 ? 0 : 1);
}

// Formation offset zero is the offensive square touching the scrimmage line.
export function offensiveFrontColumn(line: number, direction: Direction): number {
  return spotBoundary(line, direction) - (direction === 1 ? 1 : 0);
}

export function ownYardLineColumn(team: Team, yards: number): number {
  const homeColumn = FIELD_START + Math.round(yards / YARDS_PER_COLUMN);
  const column = team === 'home' ? homeColumn : FIELD_WIDTH - 1 - homeColumn;
  return Math.max(FIELD_START, Math.min(FIELD_END, column));
}

export function fieldSpotLabel(column: number, direction: Direction): string {
  const boundary = spotBoundary(column, direction);
  if (boundary <= FIELD_START || boundary > FIELD_END) return 'End Zone';
  const yards = (boundary - FIELD_START) * YARDS_PER_COLUMN;
  if (yards === 50) return '50';
  return yards < 50 ? `Home ${yards}` : `Away ${100 - yards}`;
}

export function distanceToPosts(direction: Direction, at: Coord): number {
  const boundary = spotBoundary(at.x, direction);
  return Math.max(0, direction === 1 ? FIELD_WIDTH - boundary : boundary);
}

export function isIntegerCoord(coord: Coord): boolean {
  return Number.isInteger(coord.x) && Number.isInteger(coord.y);
}
