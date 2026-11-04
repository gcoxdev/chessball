// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, expect, it } from 'vitest';
import { App } from './main';
import { createGame } from './engine/rules';
import type { GameState } from './engine/types';

afterEach(cleanup);
const humans = { home: 'human', away: 'human' } as const;
it.each<[string, Partial<GameState>, string[]]>([
  ['normal setup', { formationConfirmed: { offense: true, defense: true } }, ['Snap']],
  ['field goal', { playType: 'fieldGoal', formationConfirmed: { offense: true, defense: true } }, ['Snap & Kick', 'Fake & Pass']],
  ['punt', { playType: 'punt', formationConfirmed: { offense: true, defense: true } }, ['Snap & Punt']],
  ['kickoff', { phase: 'kickoff' }, ['Kickoff']],
  ['placement', { phase: 'kickPlacement' }, []],
  ['return', { phase: 'kickReturn' }, []],
  ['live', { phase: 'live' }, []],
  ['touchdown', { phase: 'betweenDowns', play: { actions: [], result: { type: 'touchdown', team: 'home' } } }, ['Extra Point', 'Two-Point Try']],
  ['stopped play', { phase: 'betweenDowns', play: { actions: [], result: { type: 'tackle', at: { x: 4, y: 5 } } } }, ['Next']],
])('shows only relevant commands during %s', (_name, state, expected) => {
  render(<App initialGame={createGame(state)} initialPlayers={humans} />);
  const panel = screen.getByRole('heading', { name: 'Command' }).parentElement!;
  expect(within(panel).queryAllByRole('button').map(button => button.textContent?.trim())).toEqual(expected);
  expect(panel.querySelector('.hint')?.textContent).toBeTruthy();
});

it('keeps keyboard focus in the workspace when Snap disappears', () => {
  render(<App initialGame={createGame({ formationConfirmed: { offense: true, defense: true } })} initialPlayers={humans} />);
  const snap = screen.getByRole('button', { name: 'Snap' });
  snap.focus(); fireEvent.click(snap);
  expect(screen.queryByRole('button', { name: 'Snap' })).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Chessball' })).toHaveFocus();
  expect(screen.getByText(/Select a Home player, then click/)).toBeInTheDocument();
});
