// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App, COMPUTER_ACTION_DELAY_MS } from './main';
import { applyAction } from './engine/rules';
import { createOpeningGame, loadSavedMatch, saveMatch, SAVED_MATCH_KEY } from './ui/saved-match';

const humans = { home: 'human', away: 'human' } as const;
let values: Map<string, string>;
beforeEach(() => {
  values = new Map();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  });
  vi.spyOn(Math, 'random').mockReturnValue(.4);
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const click = (name: string) => fireEvent.click(screen.getByRole('button', { name }));
const signature = () => screen.getAllByRole('gridcell').map(cell => cell.getAttribute('aria-label'));
const latestGame = () => { const history = loadSavedMatch().match!.history; return history[history.length - 1]; };
function startToKick() {
  click('Start Game'); click('Flip Coin'); click('Receive'); click('Kickoff');
}

it('restores the exact kick placement, dice, players, and history after a refresh', () => {
  const view = render(<App initialPlayers={humans} />);
  startToKick();
  const before = signature();
  const dice = screen.getByLabelText('Last dice roll').textContent;
  const saved = loadSavedMatch().match!;
  expect(saved.history[saved.history.length - 1]?.game.phase).toBe('kickPlacement');
  view.unmount();
  render(<App />);
  expect(screen.getByRole('region', { name: 'Saved match' })).toBeInTheDocument();
  click('Resume Game');
  expect(signature()).toEqual(before);
  expect(screen.getByLabelText('Last dice roll')).toHaveTextContent(dice!);
  click('Open menu');
  expect(screen.getByRole('button', { name: 'Away Human' })).toHaveClass('active');
  expect(screen.getByText(/Move \d+ of \d+:/)).toHaveTextContent(`Move ${saved.history.length} of ${saved.history.length}`);
  expect(screen.getByRole('log')).toHaveTextContent('attempted kickoff');
  click('Close menu');
  fireEvent.click(screen.getAllByRole('gridcell', { name: /kick placement/ })[0]);
  expect(loadSavedMatch().match!.history.length).toBe(saved.history.length + 1);
});

it('never replaces the latest save with a historical board being reviewed', () => {
  const view = render(<App initialPlayers={humans} />);
  startToKick();
  const saved = values.get(SAVED_MATCH_KEY);
  click('Open menu'); click('Previous move');
  expect(values.get(SAVED_MATCH_KEY)).toBe(saved);
  view.unmount();
  render(<App />); click('Resume Game');
  expect(screen.getByRole('status')).toHaveTextContent('Kick Placement');
  expect(screen.getByRole('grid')).not.toHaveAttribute('aria-readonly');
});

it('resumes a decided coin toss without rolling it again', () => {
  const view = render(<App initialPlayers={humans} />);
  click('Start Game'); click('Flip Coin');
  const result = latestGame().game.coinToss.result;
  view.unmount();
  const random = vi.spyOn(Math, 'random').mockClear();
  render(<App />); click('Resume Game');
  expect(screen.getByLabelText(`Coin landed ${result}`)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Flip Coin' })).toBeDisabled();
  expect(random).not.toHaveBeenCalled();
  click('Receive');
  expect(latestGame().game.phase).toBe('kickoff');
});

it('requires confirmation to replace a saved game and preserves it on cancel', () => {
  const view = render(<App initialPlayers={humans} />); startToKick(); view.unmount();
  const saved = values.get(SAVED_MATCH_KEY);
  render(<App />); click('Start New Game'); click('Cancel');
  expect(values.get(SAVED_MATCH_KEY)).toBe(saved);
  expect(screen.getByRole('button', { name: 'Resume Game' })).toBeInTheDocument();
  click('Start New Game'); click('Confirm');
  expect(screen.getByRole('dialog', { name: 'Coin Toss' })).toBeInTheDocument();
  expect(loadSavedMatch().match!.history).toHaveLength(1);
  expect(loadSavedMatch().match!.history[0].game.coinToss).toEqual({});
});

it('clears an abandoned match when New Game is confirmed', () => {
  const view = render(<App initialPlayers={humans} />); startToKick();
  click('Open menu'); click('New Game'); click('Confirm');
  expect(values.has(SAVED_MATCH_KEY)).toBe(false);
  view.unmount(); render(<App />);
  expect(screen.queryByRole('button', { name: 'Resume Game' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Start Game' })).toBeEnabled();
});

it('offers a clean start when saved data is corrupt', () => {
  values.set(SAVED_MATCH_KEY, '{bad');
  render(<App initialPlayers={humans} />);
  expect(screen.getByRole('alert')).toHaveTextContent('could not be loaded');
  click('Start Game');
  expect(loadSavedMatch().match!.history[0].game.phase).toBe('coinToss');
});

it('keeps playing and shows a visible notice when saving fails', () => {
  vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Quota exceeded'); });
  render(<App initialPlayers={humans} />);
  click('Start Game'); click('Flip Coin'); click('Receive');
  expect(screen.getByRole('alert')).toHaveTextContent('could not be saved');
  expect(screen.getByRole('button', { name: 'Kickoff' })).toBeEnabled();
});

it.each([false, true])('waits for Resume before computer play and retains pause state (paused=%s)', paused => {
  vi.useFakeTimers();
  const game = applyAction(applyAction(createOpeningGame('short'), { type: 'coinToss', result: 'heads' }), { type: 'chooseKickoffChoice', team: 'home', choice: 'kick' });
  saveMatch({ history: [{ id: 0, game, label: 'Opening kickoff' }], events: [],
    players: { home: 'computer', away: 'computer' }, autoPaused: paused, computerMatchStarted: true, largeBoard: true });
  render(<App />);
  const before = values.get(SAVED_MATCH_KEY);
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 10));
  expect(values.get(SAVED_MATCH_KEY)).toBe(before);
  click('Resume Game');
  expect(screen.getByRole('grid').parentElement).toHaveClass('is-enlarged');
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
  expect(latestGame().game.phase).toBe(paused ? 'kickoff' : 'kickPlacement');
  if (paused) {
    click('Open menu'); click('Resume Auto');
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
    expect(latestGame().game.phase).toBe('kickPlacement');
  }
});
