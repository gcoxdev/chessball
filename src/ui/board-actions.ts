import type { Action, Coord, GameState } from '../engine/types';

export type BoardAction = Extract<Action, { type: 'move' | 'shift' | 'powerMove' | 'pass' | 'handoff' | 'tackle' | 'recover' | 'placeKick' }>;

export const boardCoordKey = ({ x, y }: Coord) => `${x},${y}`;

// The board and click handler must agree on exactly one action per square.
// Prefer a no-roll handoff to an adjacent receiver, and a normal move when
// an alternative path reaches the same square without a power roll.
export function boardActions(game: GameState, actions: Action[], selectedId?: string): Map<string, BoardAction> {
  const targets = new Map<string, BoardAction>();
  const pieceCoord = (id: string) => game.pieces.find(piece => piece.id === id)?.coord;
  const priority = (action: BoardAction) => action.type === 'handoff' || action.type === 'move' || action.type === 'shift' ? 1 : 0;
  for (const action of actions) {
    let coord: Coord | undefined;
    switch (action.type) {
      case 'placeKick': coord = action.at; break;
      case 'move': case 'shift': case 'powerMove':
        if (action.pieceId === selectedId) coord = action.to;
        break;
      case 'pass':
        if (action.passerId === selectedId) coord = pieceCoord(action.receiverId);
        break;
      case 'handoff':
        if (action.fromId === selectedId) coord = pieceCoord(action.toId);
        break;
      case 'tackle':
        if (action.defenderId === selectedId) coord = pieceCoord(action.targetId);
        break;
      case 'recover':
        if (action.pieceId === selectedId) coord = pieceCoord(action.pieceId);
        break;
      default: continue;
    }
    if (!coord) continue;
    const key = boardCoordKey(coord);
    const previous = targets.get(key);
    if (!previous || priority(action) > priority(previous)) targets.set(key, action);
  }
  return targets;
}
