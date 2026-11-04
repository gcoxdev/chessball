import { applyAction, createGame, generateLegalActions, startNextDown } from '../engine/rules';
import type { Action, GameState } from '../engine/types';
import type { PlayerControl } from '../engine/computer';
import type { MatchLength } from './settings';

export const SAVED_MATCH_KEY = 'chessball.match.v1';
// Replays depend on game rules as well as the storage format. Bump this when
// a rule change would resolve an existing action differently.
const RULESET_VERSION = 1;
const MAX_SAVE_LENGTH = 4_000_000;
const MAX_MOVES = 20_000;
export type Transition = { type: 'action'; action: Action } | { type: 'nextDown' };
export type HistoryEntry = { id: number; game: GameState; label: string; transition?: Transition };
export type EventEntry = { id: number; text: string };
export type SavedMatch = {
  history: HistoryEntry[];
  events: EventEntry[];
  players: PlayerControl;
  autoPaused: boolean;
  computerMatchStarted: boolean;
  largeBoard: boolean;
};
export type SavedMatchLoad = { match?: SavedMatch; notice?: string };

export function createOpeningGame(length: MatchLength): GameState {
  return createGame({ phase: 'coinToss', drivesPerTeamPerQuarter: length === 'short' ? 1 : 2 });
}

// Persist resolved actions instead of repeating a complete board and cumulative
// action list for every history entry. Replaying never rolls fresh dice.
export function saveMatch(match: SavedMatch): boolean {
  try {
    if (!match.history.length || match.history.length > MAX_MOVES) return false;
    const first = match.history[0];
    const entries = match.history.slice(1).map(entry => {
      if (!entry.transition) throw new Error('Missing history transition');
      return { label: entry.label, transition: entry.transition };
    });
    const value = JSON.stringify({
      version: 1, ruleset: RULESET_VERSION,
      drivesPerTeamPerQuarter: first.game.drivesPerTeamPerQuarter,
      opening: first.game.play.actions, openingLabel: first.label,
      entries, events: match.events.slice(0, 80), players: match.players,
      autoPaused: match.autoPaused, computerMatchStarted: match.computerMatchStarted,
      largeBoard: match.largeBoard,
    });
    if (value.length > MAX_SAVE_LENGTH) return false;
    window.localStorage.setItem(SAVED_MATCH_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export function clearSavedMatch(): boolean {
  try { window.localStorage.removeItem(SAVED_MATCH_KEY); return true; }
  catch { return false; }
}

export function loadSavedMatch(): SavedMatchLoad {
  let raw: string | null;
  try { raw = window.localStorage.getItem(SAVED_MATCH_KEY); }
  catch { return { notice: 'Autosave is unavailable in this browser. Keep this tab open to retain your match.' }; }
  if (!raw) return {};
  try {
    if (raw.length > MAX_SAVE_LENGTH) throw new Error('Save too large');
    const value: unknown = JSON.parse(raw);
    if (!record(value)) throw new Error('Invalid save');
    if (value.version !== 1 || value.ruleset !== RULESET_VERSION) {
      return { notice: 'This saved match is from an incompatible version. You can start a new game.' };
    }
    if (![1, 2].includes(value.drivesPerTeamPerQuarter as number) || !text(value.openingLabel) ||
      !Array.isArray(value.opening) || value.opening.length > 2 ||
      !Array.isArray(value.entries) || value.entries.length >= MAX_MOVES ||
      !record(value.players) || !playerKind(value.players.home) || !playerKind(value.players.away) ||
      typeof value.autoPaused !== 'boolean' || typeof value.computerMatchStarted !== 'boolean' || typeof value.largeBoard !== 'boolean' ||
      !Array.isArray(value.events) || value.events.length > 80 || !value.events.every(event =>
        record(event) && Number.isSafeInteger(event.id) && (event.id as number) >= 0 && text(event.text))) throw new Error('Invalid save');

    let game = createOpeningGame(value.drivesPerTeamPerQuarter === 1 ? 'short' : 'standard');
    for (const action of value.opening) {
      if (!record(action) || !['coinToss', 'chooseKickoffChoice'].includes(action.type as string)) throw new Error('Invalid opening');
      game = replayAction(game, action);
    }
    const history: HistoryEntry[] = [{ id: 0, game, label: value.openingLabel }];
    for (const entry of value.entries) {
      if (!record(entry) || !text(entry.label) || !record(entry.transition)) throw new Error('Invalid history');
      const transition = entry.transition;
      if (transition.type === 'nextDown') game = startNextDown(game);
      else if (transition.type === 'action') game = replayAction(game, transition.action);
      else throw new Error('Invalid transition');
      history.push({ id: history.length, game, label: entry.label, transition: transition as Transition });
    }
    return { match: {
      history, events: value.events as EventEntry[],
      players: { home: value.players.home, away: value.players.away },
      autoPaused: value.autoPaused, computerMatchStarted: value.computerMatchStarted, largeBoard: value.largeBoard,
    } };
  } catch {
    // Keep the stored value until the user explicitly starts over.
    return { notice: 'The saved match could not be loaded. You can start a new game.' };
  }
}

function replayAction(game: GameState, value: unknown): GameState {
  if (!record(value)) throw new Error('Invalid action');
  const action = { ...value };
  if (['pass', 'powerMove', 'tackle', 'kick'].includes(value.type as string)) {
    const roll = value.roll;
    if (!record(roll) || Object.keys(roll).length !== 2 || !die(roll.die1) || !die(roll.die2)) throw new Error('Missing or invalid dice');
    delete action.roll;
  }
  if (value.type === 'coinToss') {
    if (value.result !== 'heads' && value.result !== 'tails') throw new Error('Missing coin result');
    delete action.result;
  }
  if (!generateLegalActions(game).some(legal => equal(legal, action))) throw new Error('Illegal saved action');
  return applyAction(game, value as Action);
}

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.prototype.hasOwnProperty.call(b, key) && equal(a[key], b[key]));
}
function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function text(value: unknown): value is string { return typeof value === 'string' && value.length <= 2000; }
function playerKind(value: unknown): value is 'human' | 'computer' { return value === 'human' || value === 'computer'; }
function die(value: unknown): boolean { return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 6; }
