// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SAVED_MATCH_KEY } from './saved-match';
import { App, COMPUTER_ACTION_DELAY_MS } from '../main';
import { createGame } from '../engine/rules';

beforeEach(() => window.localStorage.removeItem(SAVED_MATCH_KEY));
afterEach(() => { cleanup(); vi.useRealTimers(); });
const humans = { home: 'human', away: 'human' } as const;
const openMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
const closeMenu = () => fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));

it('keeps setup and history in the menu and formations after the field', () => {
  render(<App initialGame={createGame()} initialPlayers={humans} />);
  expect(screen.queryByRole('region', { name: 'Game setup' })).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Game history' })).not.toBeInTheDocument();
  const field = screen.getByRole('region', { name: 'Chessball field' });
  const controls = screen.getByRole('complementary', { name: 'Game controls' });
  expect(field.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(within(controls).getByRole('button', { name: 'Confirm Offense' })).toBeInTheDocument();
  openMenu();
  const menu = screen.getByRole('dialog', { name: 'Game menu' });
  for (const name of ['New Game', 'Rules', 'Settings', 'Previous move', 'Latest move']) {
    expect(within(menu).getByRole('button', { name })).toBeInTheDocument();
  }
});

it.each(['Escape', 'backdrop'])('closes via %s and restores focus to the hamburger button', method => {
  render(<App />);
  const trigger = screen.getByRole('button', { name: 'Open menu' });
  trigger.focus(); openMenu();
  const menu = screen.getByRole('dialog', { name: 'Game menu' });
  const close = within(menu).getByRole('button', { name: 'Close menu' });
  expect(close).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'true');
  fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
  expect(within(menu).getByRole('button', { name: 'Away Computer' })).toHaveFocus();
  if (method === 'Escape') fireEvent.keyDown(menu, { key: 'Escape' });
  else fireEvent.click(menu.parentElement!);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(trigger).toHaveFocus();
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  expect(document.getElementById('chessball-app')).not.toHaveAttribute('inert');
});

it('returns from Settings to the menu and keeps automation paused until the menu closes', () => {
  vi.useFakeTimers();
  render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
  openMenu(); fireEvent.click(screen.getByRole('button', { name: 'Play Auto' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  openMenu();
  const settings = screen.getByRole('button', { name: 'Settings' });
  settings.focus(); fireEvent.click(settings);
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
  fireEvent.keyDown(screen.getByRole('dialog', { name: 'Settings' }), { key: 'Escape' });
  expect(settings).toHaveFocus();
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
  expect(screen.getByRole('log')).not.toHaveTextContent('Computer home:');
  closeMenu();
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
  openMenu();
  expect(screen.getByRole('log')).toHaveTextContent('Computer home:');
});

it('keeps history read-only after closing the menu and offers a direct return to live play', () => {
  render(<App initialGame={createGame()} initialPlayers={humans} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Defense' }));
  fireEvent.click(screen.getByRole('button', { name: 'Snap' }));
  openMenu(); fireEvent.click(screen.getByRole('button', { name: 'Previous move' })); closeMenu();
  expect(screen.getByRole('grid')).toHaveAttribute('aria-readonly', 'true');
  expect(document.getElementById('history-read-only')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Snap' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Return to latest' }));
  expect(screen.getByRole('grid')).not.toHaveAttribute('aria-readonly');
  expect(screen.queryByText('Viewing history — Read-only')).not.toBeInTheDocument();
});

it('keeps Start Game on the main screen and transfers focus into the coin toss', () => {
  render(<App />);
  expect(screen.getByRole('region', { name: 'Chessball field' })).toContainElement(screen.getByRole('button', { name: 'Start Game' }));
  openMenu(); fireEvent.click(screen.getByRole('button', { name: 'Away Human' }));
  expect(within(screen.getByRole('dialog', { name: 'Game menu' })).queryByRole('button', { name: 'Start Game' })).not.toBeInTheDocument();
  closeMenu();
  fireEvent.click(screen.getByRole('button', { name: 'Start Game' }));
  expect(screen.queryByRole('dialog', { name: 'Game menu' })).not.toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Coin Toss' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Flip Coin' })).toHaveFocus();
});
