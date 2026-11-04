import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAction, generateLegalActions, startNextDown } from '../engine/rules';
import { chooseComputerAction } from '../engine/computer';
import type { Action } from '../engine/types';
import { clearSavedMatch, createOpeningGame, loadSavedMatch, saveMatch, SAVED_MATCH_KEY, type SavedMatch, type HistoryEntry } from './saved-match';

let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('window', { localStorage: {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  } });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function match(history: HistoryEntry[]): SavedMatch {
  return { history, events: [{ id: 7, text: 'Saved event' }], players: { home: 'human', away: 'computer' },
    autoPaused: true, computerMatchStarted: true, largeBoard: true };
}
function append(history: HistoryEntry[], action: Action) {
  history.push({ id: history.length, game: applyAction(history[history.length - 1].game, action), label: action.type, transition: { type: 'action', action } });
}

it('restores the coin choice and preferences without generating another coin toss', () => {
  const history = [{ id: 0, game: createOpeningGame('short'), label: 'Opening' }];
  append(history, { type: 'coinToss', result: 'tails' });
  expect(saveMatch(match(history))).toBe(true);
  const random = vi.spyOn(Math, 'random');
  expect(loadSavedMatch().match).toEqual(match(history));
  expect(random).not.toHaveBeenCalled();
});

it('restores automatic computer openings with no separate coin-toss history entries', () => {
  const opening = applyAction(applyAction(createOpeningGame('standard'), { type: 'coinToss', result: 'heads' }), { type: 'chooseKickoffChoice', team: 'home', choice: 'receive' });
  const saved = match([{ id: 0, game: opening, label: 'Automatic opening' }]);
  expect(saveMatch(saved)).toBe(true);
  expect(loadSavedMatch().match).toEqual(saved);
});

it('replays an entire match including next-down transitions and every history position', () => {
  const history: HistoryEntry[] = [{ id: 0, game: createOpeningGame('short'), label: 'Opening' }];
  const players = { home: 'computer', away: 'computer' } as const;
  for (let step = 0; step < 3000 && history[history.length - 1].game.phase !== 'final'; step++) {
    const game = history[history.length - 1].game;
    if (game.phase === 'betweenDowns' && game.play.result?.type !== 'touchdown') {
      history.push({ id: history.length, game: startNextDown(game), label: 'Next', transition: { type: 'nextDown' } });
    } else {
      const action = chooseComputerAction(game, generateLegalActions(game), history.length, players)!;
      expect(action).toBeTruthy();
      const resolved: Action = action.type === 'coinToss' ? { ...action, result: 'heads' }
        : ['pass', 'powerMove', 'tackle', 'kick'].includes(action.type) ? { ...action, roll: { die1: 6, die2: 6 } } as Action : action;
      append(history, resolved);
    }
  }
  expect(history[history.length - 1].game.phase).toBe('final');
  const saved = { ...match(history), players };
  expect(saveMatch(saved)).toBe(true);
  expect(loadSavedMatch().match).toEqual(saved);
  // Saving a journal stays much smaller than serializing all board snapshots.
  expect(values.get(SAVED_MATCH_KEY)!.length).toBeLessThan(JSON.stringify(saved).length / 3);
}, 30000);

describe('invalid and unavailable saves', () => {
  it.each(['{', 'null', '{"version":1,"ruleset":1}'])('handles malformed data: %s', raw => {
    values.set(SAVED_MATCH_KEY, raw);
    expect(loadSavedMatch()).toEqual({ notice: 'The saved match could not be loaded. You can start a new game.' });
    expect(values.get(SAVED_MATCH_KEY)).toBe(raw);
  });

  it('rejects incompatible versions without deleting the save', () => {
    const raw = JSON.stringify({ version: 2, ruleset: 1 });
    values.set(SAVED_MATCH_KEY, raw);
    expect(loadSavedMatch().notice).toMatch(/incompatible/);
    expect(values.get(SAVED_MATCH_KEY)).toBe(raw);
  });

  it.each([
    { type: 'coinToss' },
    { type: 'coinToss', result: 'edge' },
    { type: 'move', pieceId: 'home-qb', to: { x: 99, y: 5 } },
  ])('rejects an unresolved or illegal action: $type', action => {
    saveMatch(match([{ id: 0, game: createOpeningGame('standard'), label: 'Opening' }]));
    const data = JSON.parse(values.get(SAVED_MATCH_KEY)!);
    data.entries.push({ label: 'Bad move', transition: { type: 'action', action } });
    values.set(SAVED_MATCH_KEY, JSON.stringify(data));
    expect(loadSavedMatch().match).toBeUndefined();
    expect(loadSavedMatch().notice).toMatch(/could not be loaded/);
  });

  it('rejects a kick without its original dice instead of replaying with default dice', () => {
    const history = [{ id: 0, game: createOpeningGame('standard'), label: 'Opening' }];
    append(history, { type: 'coinToss', result: 'heads' });
    append(history, { type: 'chooseKickoffChoice', team: 'home', choice: 'kick' });
    append(history, { type: 'kick', kind: 'kickoff', kickerId: 'home-qb', roll: { die1: 3, die2: 4 } });
    saveMatch(match(history));
    const data = JSON.parse(values.get(SAVED_MATCH_KEY)!);
    delete data.entries[2].transition.action.roll;
    values.set(SAVED_MATCH_KEY, JSON.stringify(data));
    expect(loadSavedMatch().notice).toMatch(/could not be loaded/);
  });

  it('keeps the previous save when writing exceeds quota, and supports explicit deletion', () => {
    const saved = match([{ id: 0, game: createOpeningGame('standard'), label: 'Opening' }]);
    expect(saveMatch(saved)).toBe(true);
    const raw = values.get(SAVED_MATCH_KEY);
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota'); });
    expect(saveMatch(saved)).toBe(false);
    expect(values.get(SAVED_MATCH_KEY)).toBe(raw);
    expect(clearSavedMatch()).toBe(true);
    expect(loadSavedMatch()).toEqual({});
  });

  it('does not throw when browser storage is denied', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('Denied'); });
    vi.spyOn(window.localStorage, 'removeItem').mockImplementation(() => { throw new Error('Denied'); });
    expect(loadSavedMatch().notice).toMatch(/unavailable/);
    expect(clearSavedMatch()).toBe(false);
  });
});
