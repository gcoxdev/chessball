// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { App, COMPUTER_ACTION_DELAY_MS } from '../main';
import { createGame } from '../engine/rules';
import { loadPieceStyle, SETTINGS_STORAGE_KEY } from './settings';

const openMenu = () => {
  if (!screen.queryByRole('dialog', { name: 'Game menu' })) fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
};
const closeMenu = () => {
  const close = screen.queryByRole('button', { name: 'Close menu' });
  if (close) fireEvent.click(close);
};
const menuButton = (name: string | RegExp) => {
  if (/start game/i.test(String(name))) closeMenu();
  const existing = screen.queryByRole('button', { name });
  if (existing) return existing;
  openMenu();
  return screen.getByRole('button', { name });
};
const historyLog = () => {
  openMenu();
  return screen.getByRole('log', { name: /event log/i });
};

const humans = { home: 'human', away: 'human' } as const;

// Supply browser storage explicitly: this Vitest/Node environment exposes it as undefined.
beforeEach(() => {
  const values = new Map<string, string>();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
    clear: () => values.clear(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('player appearance settings', () => {
  it('switches all board pieces immediately while preserving the match and ball', () => {
    render(<App initialGame={createGame()} initialPlayers={humans} />);
    const board = screen.getByRole('grid', { name: 'Chessball board' });
    const signature = () => Array.from(board.querySelectorAll('.square.occupied')).map(node => `${node.getAttribute('title')}:${node.getAttribute('aria-label')}`);
    const before = signature();
    expect(board.querySelectorAll('.piece--player')).toHaveLength(22);
    const trigger = menuButton('Settings');
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('radio', { name: 'Football players' })).toBeChecked();
    for (const [label, style] of [['Football players', 'player'], ['Helmets', 'helmet'], ['Circles', 'circle']]) {
      fireEvent.click(within(dialog).getByRole('radio', { name: label }));
      expect(board.querySelectorAll(`.piece--${style}`)).toHaveLength(22);
      expect(signature()).toEqual(before);
      expect(board.querySelector('.football-marker')).toHaveAttribute('aria-label', 'Ball: controlled by QB');
    }
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(trigger).toHaveFocus();
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('retains the selected style across remounts and a new game', () => {
    const view = render(<App initialGame={createGame()} initialPlayers={humans} />);
    fireEvent.click(menuButton('Settings'));
    fireEvent.click(screen.getByRole('radio', { name: 'Helmets' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    fireEvent.click(menuButton('New Game'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'New Game' })).getByRole('button', { name: 'Confirm' }));
    fireEvent.click(menuButton('Settings'));
    expect(screen.getByRole('radio', { name: 'Helmets' })).toBeChecked();
    view.unmount();
    render(<App initialGame={createGame()} initialPlayers={humans} />);
    expect(screen.getByRole('grid').querySelectorAll('.piece--helmet')).toHaveLength(22);
  });

  it.each(['invalid JSON', '{"pieceStyle":"unknown"}', 'null', '42'])('uses football players for an invalid stored preference: %s', value => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, value);
    expect(loadPieceStyle()).toBe('player');
  });

  it('allows changing styles even when browser storage is unavailable', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => { throw new Error('Storage denied'); });
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => { throw new Error('Storage denied'); });
    render(<App initialGame={createGame()} initialPlayers={humans} />);
    fireEvent.click(menuButton('Settings'));
    fireEvent.click(screen.getByRole('radio', { name: 'Football players' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    expect(screen.getByRole('grid').querySelectorAll('.piece--player')).toHaveLength(22);
  });

  it('pauses computer play while Settings is open and resumes on close', () => {
    vi.useFakeTimers();
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    fireEvent.click(menuButton('Play Auto'));
    fireEvent.click(menuButton('Settings'));
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
    fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
    const log = historyLog();
    expect(log.textContent).not.toMatch(/Computer home:/);
    closeMenu();
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
    expect(historyLog()).toHaveTextContent(/Computer home:/);
  });
});

it('saves match length independently and applies it to the next match only', () => {
  const view = render(<App initialGame={createGame()} initialPlayers={humans} />);
  expect(screen.getByText('Drive 0 of 16')).toBeInTheDocument();
  fireEvent.click(menuButton('Settings'));
  fireEvent.click(screen.getByRole('radio', { name: 'Short match' }));
  fireEvent.click(screen.getByRole('radio', { name: 'Helmets' }));
  expect(JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY)!)).toEqual({ matchLength: 'short', pieceStyle: 'helmet' });
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
  expect(screen.getByText('Drive 0 of 16')).toBeInTheDocument();
  fireEvent.click(menuButton('New Game'));
  fireEvent.click(within(screen.getByRole('dialog', { name: 'New Game' })).getByRole('button', { name: 'Confirm' }));
  fireEvent.click(menuButton('Start Game'));
  expect(screen.getByText('Drive 0 of 8')).toBeInTheDocument();
  expect(screen.getByText('Q1: Home 0/1, Away 0/1')).toBeInTheDocument();
  view.unmount();
  render(<App />);
  fireEvent.click(menuButton('Settings'));
  expect(screen.getByRole('radio', { name: 'Short match' })).toBeChecked();
  expect(screen.getByRole('radio', { name: 'Helmets' })).toBeChecked();
});

it('shows pass odds before committing a pass', () => {
  const game = createGame({ phase: 'live' });
  render(<App initialGame={game} initialPlayers={humans} />);
  const qb = game.pieces.find(piece => piece.id === 'home-qb')!;
  fireEvent.click(screen.getByTitle(`${qb.coord.x},${qb.coord.y}`));
  fireEvent.click(screen.getByRole('button', { name: 'Pass' }));
  const passes = screen.getAllByRole('button', { name: /^Pass to .*% success/ });
  expect(passes.length).toBeGreaterThan(0);
  expect(screen.getByRole('img', { name: 'Ball: controlled by QB' })).toBeInTheDocument();
  const targets = screen.getAllByRole('gridcell').filter(cell => cell.classList.contains('pass-target'));
  expect(targets.length).toBe(passes.length);
  expect(targets.every(cell => cell.getAttribute('aria-description')?.includes('% success'))).toBe(true);
});
