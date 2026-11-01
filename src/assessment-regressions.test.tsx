// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, COMPUTER_ACTION_DELAY_MS } from './main';
import { applyAction, createGame, generateLegalActions } from './engine/rules';
import type { GameState, Team } from './engine/types';

const humanPlayers = { home: 'human', away: 'human' } as const;
const confirmed = (state: GameState) => applyAction(applyAction(state, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });
const square = (x: number, y: number) => screen.getByTitle(`${x},${y}`);
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe('assessment interaction regressions', () => {
  it.each(['button', 'escape', 'toggle', 'carrier'])('cancels pass targeting with %s without spending a turn', method => {
    const state = applyAction(confirmed(createGame({ lineOfScrimmage: 12 })), { type: 'snap' });
    render(<App initialGame={state} initialPlayers={humanPlayers} />);
    fireEvent.click(square(10, 5));
    fireEvent.click(screen.getByRole('button', { name: /^Pass$/ }));
    expect(screen.getByRole('button', { name: 'Cancel Pass' })).toBeInTheDocument();
    if (method === 'button') fireEvent.click(screen.getByRole('button', { name: 'Cancel Pass' }));
    if (method === 'escape') fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    if (method === 'toggle') fireEvent.click(screen.getByRole('button', { name: /^Pass$/ }));
    if (method === 'carrier') fireEvent.click(square(10, 5));
    expect(screen.queryByRole('button', { name: 'Cancel Pass' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/home to act/i);
    fireEvent.click(square(10, 4));
    expect(screen.getByRole('status')).toHaveTextContent(/moved to 10,4.*away to act/i);
  });

  it('lets a fake holder cancel the pass and move instead', () => {
    const setup = confirmed(createGame({ lineOfScrimmage: 12, playType: 'fieldGoal' }));
    const fake = applyAction(setup, { type: 'fakeFieldGoal' });
    const move = generateLegalActions(fake).find(a => a.type === 'move' && a.pieceId === 'home-fb');
    if (!move || move.type !== 'move') throw new Error('Fixture needs a holder move');
    render(<App initialGame={setup} initialPlayers={humanPlayers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Fake & Pass' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel Pass' }));
    fireEvent.click(square(move.to.x, move.to.y));
    expect(screen.getByRole('status')).toHaveTextContent(/home H moved.*away to act/i);
  });

  it('does not enter pass targeting with no eligible receivers', () => {
    const setup = createGame({ phase: 'live', lineOfScrimmage: 12 });
    setup.pieces = setup.pieces.filter(p => p.id === 'home-qb' || p.role === 'ol' || p.team === 'away');
    render(<App initialGame={setup} initialPlayers={humanPlayers} />);
    fireEvent.click(square(10, 5));
    expect(screen.getByRole('button', { name: /^Pass$/ })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Cancel Pass' })).not.toBeInTheDocument();
  });

  it.each(['home', 'away'] as const)('lets human defense confirm, shift, and release %s computer offense to snap', possession => {
    vi.useFakeTimers();
    const defense: Team = possession === 'home' ? 'away' : 'home';
    const state = applyAction(createGame({ possession, lineOfScrimmage: 12 }), { type: 'confirmFormation', side: 'offense' });
    const player = state.pieces.find(p => p.id === `${defense}-wr1`)!;
    const confirmedState = applyAction(state, { type: 'confirmFormation', side: 'defense' });
    const shift = generateLegalActions(confirmedState).find(a => a.type === 'shift' && a.pieceId === player.id)!;
    if (shift.type !== 'shift') throw new Error('Fixture needs a shift');
    const { container } = render(<App initialGame={state} initialPlayers={{ [possession]: 'computer', [defense]: 'human' } as typeof humanPlayers} />);
    fireEvent.click(square(player.coord.x, player.coord.y));
    expect(container.querySelectorAll('.move-target')).toHaveLength(0);
    fireEvent.click(square(shift.to.x, shift.to.y));
    expect(square(player.coord.x, player.coord.y).querySelector('.piece')).not.toBeNull();
    expect(square(shift.to.x, shift.to.y).querySelector('.piece')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Defense' }));
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
    expect(screen.getByRole('status')).toHaveTextContent(/Formation/);
    expect(screen.getByRole('button', { name: 'Ready for Snap' })).toBeEnabled();
    fireEvent.click(square(player.coord.x, player.coord.y));
    fireEvent.click(square(shift.to.x, shift.to.y));
    expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`Shift: ${defense}`));
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
    expect(screen.getByRole('status')).toHaveTextContent(/Formation/);
    fireEvent.click(screen.getByRole('button', { name: 'Ready for Snap' }));
    // A further adjustment cancels the release before the computer timer fires.
    fireEvent.click(square(shift.to.x, shift.to.y));
    fireEvent.click(square(player.coord.x, player.coord.y));
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 5));
    expect(screen.getByRole('status')).toHaveTextContent(/Formation/);
    expect(screen.getByRole('button', { name: 'Ready for Snap' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Ready for Snap' }));
    act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
    expect(screen.getByRole('status')).toHaveTextContent(/Live/);
  });

  it.each(['home', 'away'] as const)('cannot select computer defenders while %s is human offense', possession => {
    const defense: Team = possession === 'home' ? 'away' : 'home';
    const state = createGame({ possession, lineOfScrimmage: 12 });
    const player = state.pieces.find(p => p.id === `${defense}-wr1`)!;
    const { container } = render(<App initialGame={state} initialPlayers={{ [possession]: 'human', [defense]: 'computer' } as typeof humanPlayers} />);
    fireEvent.click(square(player.coord.x, player.coord.y));
    expect(container.querySelector('.is-selected')).toBeNull();
  });

  it('keeps the stated down and distance on the snap and during live movement', () => {
    render(<App initialGame={createGame({ lineOfScrimmage: 12 })} initialPlayers={humanPlayers} />);
    expect(screen.getByText('1 & 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Snap$/ }));
    expect(screen.getByText('1 & 10')).toBeInTheDocument();
    fireEvent.click(square(10, 5));
    fireEvent.click(square(10, 4));
    expect(screen.getByText('1 & 10')).toBeInTheDocument();
  });

  it('shows five yards when one column remains', () => {
    render(<App initialGame={createGame({ phase: 'live', down: 2, lineOfScrimmage: 12, firstDownLine: 13 })} initialPlayers={humanPlayers} />);
    expect(screen.getByText('2 & 5')).toBeInTheDocument();
  });

  it('announces the current move with history closed and keeps the history log silent', () => {
    render(<App initialGame={createGame({ phase: 'live', lineOfScrimmage: 12 })} initialPlayers={humanPlayers} />);
    fireEvent.click(square(10, 5)); fireEvent.click(square(10, 4));
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/Move: home QB moved to 10,4/);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('log')).toHaveAttribute('aria-live', 'off');
  });

  it('lets a finished match be reviewed and the summary reopened', () => {
    render(<App initialGame={createGame({ phase: 'final', score: { home: 7, away: 3 } })} initialPlayers={humanPlayers} />);
    fireEvent.click(screen.getByRole('button', { name: 'Review Game' }));
    expect(screen.queryByRole('dialog', { name: 'Final Result' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('log')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Final Result' }));
    expect(screen.getByRole('dialog', { name: 'Final Result' })).toHaveTextContent('Home 7 - Away 3');
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Final Result' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Final Result' })).not.toBeInTheDocument();
  });

  it('describes a stopped two-point tackle correctly in history', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.7);
    const state = createGame({ phase: 'live', turn: 'away', conversion: { team: 'home' }, lineOfScrimmage: 21 });
    state.pieces = [
      { id: 'home-qb', team: 'home', role: 'qb', label: 'QB', coord: { x: 20, y: 5 } },
      { id: 'away-rb', team: 'away', role: 'rb', label: 'MLB', coord: { x: 19, y: 5 } },
    ];
    render(<App initialGame={state} initialPlayers={humanPlayers} />);
    fireEvent.click(square(19, 5)); fireEvent.click(square(20, 5));
    expect(screen.getByRole('status')).toHaveTextContent(/Two-point try failed/);
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(screen.getByRole('log')).toHaveTextContent(/Tackle: away-rb stopped home-qb/);
    expect(screen.getByRole('log')).not.toHaveTextContent(/Missed tackle/);
  });

  it.each(['kickoff', 'halftime', 'final'] as const)('describes the actual %s transition on Next', phase => {
    const state = createGame({ phase: 'betweenDowns', quarter: phase === 'final' ? 4 : phase === 'halftime' ? 2 : 1,
      drivesThisQuarter: phase === 'kickoff' ? { home: 0, away: 0 } : { home: 1, away: 2 },
      play: { actions: [], result: { type: 'extraPoint', team: 'home', good: true } } });
    render(<App initialGame={state} initialPlayers={humanPlayers} />);
    fireEvent.click(screen.getByRole('button', { name: /^Next$/ }));
    if (phase === 'final') fireEvent.click(screen.getByRole('button', { name: 'Review Game' }));
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent(phase === 'final' ? /Final: Tie game/ : phase === 'halftime' ? /Halftime\. Kickoff:/ : /Kickoff:/);
    expect(status).not.toHaveTextContent(/lines up for/);
  });
});

it.each(['home', 'away'] as const)('moves the computer defense after %s human offense snaps and takes an action', possession => {
  vi.useFakeTimers();
  const defense = possession === 'home' ? 'away' : 'home';
  const state = createGame({ possession, lineOfScrimmage: 12 });
  render(<App initialGame={state} initialPlayers={{ [possession]: 'human', [defense]: 'computer' } as Record<Team, 'human' | 'computer'>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));
  for (let i = 0; i < 3; i++) act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
  fireEvent.click(screen.getByRole('button', { name: 'Snap' }));
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS * 3));
  expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`${possession} to act`, 'i'));
  const positions = () => [...document.querySelectorAll(`.piece.${defense}`)].map(p => p.closest('[title]')!.getAttribute('title')).sort();
  const before = positions();
  const receiver = state.pieces.find(p => p.id === `${possession}-wr1`)!;
  fireEvent.click(square(receiver.coord.x, receiver.coord.y));
  fireEvent.click(square(receiver.coord.x, 0));
  expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`${defense} to act`, 'i'));
  act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
  expect(screen.getByRole('status')).toHaveTextContent(new RegExp(`Computer ${defense}:.*moved.*${possession} to act`, 'i'));
  expect(screen.getByRole('status')).not.toHaveTextContent(/illegal/i);
  expect(positions()).not.toEqual(before);
});
