import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, chooseComputerAction, COMPUTER_ACTION_DELAY_MS } from './main';
import { cleanup } from '@testing-library/react';
import { applyAction, createGame, generateLegalActions } from './engine/rules';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibleBoard } from './ui/AccessibleBoard';
import { Modal } from './ui/Modal';
import { useRef, useState } from 'react';

const originalScrollIntoView = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollIntoView');

afterEach(() => {
  vi.restoreAllMocks();
  if (originalScrollIntoView) Object.defineProperty(Element.prototype, 'scrollIntoView', originalScrollIntoView);
  else delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
  cleanup();
});

const confirmBothFormations = () => {
  fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
  fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));
};

function ModalTestShell({ initiallyInert = false }: { initiallyInert?: boolean }) {
  const [firstOpen, setFirstOpen] = useState(true);
  const [secondOpen, setSecondOpen] = useState(true);
  const fallback = useRef<HTMLHeadingElement>(null);
  const first = firstOpen ? <Modal label="First modal" fallbackFocus={fallback} dismissible onClose={() => setFirstOpen(false)}><button type="button" onClick={() => setFirstOpen(false)}>First action</button></Modal> : null;
  const second = secondOpen ? <Modal label="Second modal" fallbackFocus={fallback} dismissible onClose={() => setSecondOpen(false)}><button type="button" onClick={() => setSecondOpen(false)}>Second action</button></Modal> : null;
  return <><main id="chessball-app" inert={initiallyInert || undefined}><h1 ref={fallback} tabIndex={-1}>Workspace</h1></main>{first}{second}</>;
}

function RerenderingModalShell() {
  const [count, setCount] = useState(0);
  const fallback = useRef<HTMLHeadingElement>(null);
  return <><main id="chessball-app"><h1 ref={fallback} tabIndex={-1}>Workspace</h1></main><Modal label="Rerender modal" fallbackFocus={fallback} dismissible onClose={() => undefined}><button type="button">First</button><button type="button" onClick={() => setCount((value) => value + 1)}>Rerender {count}</button></Modal></>;
}

function CandidateFilteringModal() {
  const fallback = useRef<HTMLHeadingElement>(null);
  return <><main id="chessball-app"><h1 ref={fallback} tabIndex={-1}>Workspace</h1></main><Modal label="Filtered modal" fallbackFocus={fallback}><button type="button" hidden>Hidden</button><div aria-hidden="true"><button type="button">Aria hidden</button></div><div inert><button type="button">Inert</button></div><button type="button" style={{ display: 'none' }}>Not rendered</button><button type="button" tabIndex={-1}>Negative</button><button type="button">Available</button></Modal></>;
}

function InvalidInitialFocusModal({ target }: { target: 'outside' | 'disabled' }) {
  const fallback = useRef<HTMLHeadingElement>(null);
  const outside = useRef<HTMLButtonElement>(null);
  const disabled = useRef<HTMLButtonElement>(null);
  return <><main id="chessball-app"><h1 ref={fallback} tabIndex={-1}>Workspace</h1></main><button ref={outside} type="button">Outside</button><Modal label="Initial focus modal" fallbackFocus={fallback} initialFocus={target === 'outside' ? outside : disabled}><button ref={disabled} type="button" disabled>Disabled target</button><button type="button">Available target</button></Modal></>;
}

describe('Modal lifecycle', () => {
  it.each([true, false])('keeps shared isolation until the final modal closes (close first modal first: %s)', (closeFirstFirst) => {
    document.body.style.overflow = 'clip';
    render(<ModalTestShell initiallyInert={closeFirstFirst} />);
    const closingAction = closeFirstFirst ? 'First action' : 'Second action';
    const remainingName = closeFirstFirst ? /second modal/i : /first modal/i;
    fireEvent.click(screen.getByRole('button', { name: closingAction }));
    expect(screen.queryByRole('button', { name: closingAction })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: remainingName })).toBeInTheDocument();
    expect(document.getElementById('chessball-app')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(screen.getByRole('dialog', { name: remainingName }), { key: 'Escape' });
    if (closeFirstFirst) expect(document.getElementById('chessball-app')).toHaveAttribute('inert');
    else expect(document.getElementById('chessball-app')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('clip');
    document.body.style.overflow = '';
  });

  it('lets only the topmost modal own keyboard trapping', () => {
    render(<ModalTestShell />);
    const lowerAction = screen.getByRole('button', { name: 'First action' });
    lowerAction.focus();
    fireEvent.keyDown(lowerAction, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Second action' })).toHaveFocus();
  });

  it('moves focus into the remaining modal when the topmost modal closes with no usable trigger', () => {
    render(<ModalTestShell />);
    fireEvent.click(screen.getByRole('button', { name: 'Second action' }));
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();
  });

  it('does not restart modal lifecycle when an onClose identity changes during rerender', () => {
    render(<RerenderingModalShell />);
    const rerender = screen.getByRole('button', { name: /rerender 0/i });
    rerender.focus();
    fireEvent.click(rerender);
    expect(screen.getByRole('button', { name: /rerender 1/i })).toHaveFocus();
    expect(document.getElementById('chessball-app')).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('focuses only currently visible, non-inert, tabbable candidates', () => {
    render(<CandidateFilteringModal />);
    expect(screen.getByRole('button', { name: 'Available' })).toHaveFocus();
  });

  it.each(['outside', 'disabled'] as const)('rejects an %s initial-focus target', (target) => {
    render(<InvalidInitialFocusModal target={target} />);
    expect(screen.getByRole('button', { name: 'Available target' })).toHaveFocus();
  });
});

describe('Chessball UI interactions', () => {
  it('provides one main landmark and a first-link skip target for the named game workspace', () => {
    const { container } = render(<App initialGame={createGame()} />);

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAccessibleName('Skip to game workspace');
    expect(links[0]).toHaveAttribute('href', '#game-workspace');
    const workspaceHeading = screen.getByRole('heading', { name: 'Chessball', level: 1 });
    expect(workspaceHeading).toHaveAttribute('id', 'game-workspace');
    expect(workspaceHeading).toHaveAttribute('tabindex', '-1');
    fireEvent.click(links[0]);
    expect(workspaceHeading).toHaveFocus();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByRole('complementary', { name: /game controls/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /chessball field/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /game setup/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /game history/i })).toBeInTheDocument();
  });

  it('uses one concise polite status without copying the event log', () => {
    const { container } = render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(statuses[0]).not.toHaveTextContent(/snap: home started the play/i);
    expect(statuses[0]).toHaveTextContent(/live.*home to act/i);
    expect(statuses[0]).toHaveTextContent(/home 0.*away 0/i);
    expect(statuses[0]).not.toHaveTextContent(/offense formation confirmed.*defense formation confirmed/i);
    expect(statuses[0].contains(screen.getByRole('log', { name: /event log/i }))).toBe(false);
  });

  it('keeps the event log implicit live behavior without echoing its newest entry in status', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));

    const log = screen.getByRole('log', { name: /event log/i });
    const newestEntry = within(log).getAllByText(/snap: home started the play/i)[0].textContent ?? '';
    expect(log).toHaveAttribute('role', 'log');
    expect(screen.getByRole('status')).not.toHaveTextContent(newestEntry);
    expect(screen.getByRole('status')).toHaveTextContent(/live.*home to act.*home 0.*away 0/i);

    fireEvent.click(screen.getByTitle('4,5'));
    expect(screen.getByRole('status')).toHaveTextContent(/QB selected/i);
  });

  it('announces and exposes read-only history, then restores actionable latest state', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByRole('button', { name: /previous move/i }));

    const field = screen.getByRole('region', { name: /chessball field/i });
    const historyRegion = screen.getByRole('region', { name: /game history/i });
    expect(within(historyRegion).getByText(/viewing history.*read-only/i)).toBeInTheDocument();
    const grid = screen.getByRole('grid', { name: /chessball board/i });
    expect(field).not.toHaveAttribute('aria-readonly');
    expect(grid).toHaveAttribute('aria-readonly', 'true');
    expect(grid).toHaveAttribute('aria-describedby', 'history-read-only');
    expect(screen.getByRole('status')).toHaveTextContent(/formation: defense confirmed/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/snap: home started the play/i);
    expect(screen.getByRole('status')).toHaveTextContent(/viewing history.*read-only.*history position \d+ of \d+/i);
    expect(screen.getByRole('button', { name: /snap/i })).toBeDisabled();
    expect(screen.getAllByRole('gridcell', { name: /read-only history/i }).some((cell) => cell.tabIndex === 0)).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /latest move/i }));
    expect(field).not.toHaveAttribute('aria-readonly');
    expect(within(historyRegion).queryByText(/viewing history.*read-only/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('4,5')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('status')).toHaveTextContent(/latest position/i);
  });

  it('keeps utility mutations disabled in history while Rules and Latest remain available', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByRole('button', { name: /previous move/i }));

    const newGame = screen.getByRole('button', { name: /new game/i });
    expect(newGame).toBeDisabled();
    expect(screen.getByRole('button', { name: /rules/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /latest move/i })).toBeEnabled();
    fireEvent.click(newGame);
    expect(screen.queryByRole('dialog', { name: /new game/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /latest move/i }));
    expect(newGame).toBeEnabled();
  });

  it('cannot resume computer automation from history and restores it at Latest', async () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    fireEvent.click(screen.getByRole('button', { name: /play auto/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /previous move/i })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: /pause auto/i }));
    const log = screen.getByRole('log', { name: /event log/i });
    const logBefore = log.textContent;
    fireEvent.click(screen.getByRole('button', { name: /previous move/i }));

    const resume = screen.getByRole('button', { name: /resume auto/i });
    expect(resume).toBeDisabled();
    fireEvent.click(resume);
    expect(log).toHaveTextContent(logBefore ?? '');

    fireEvent.click(screen.getByRole('button', { name: /latest move/i }));
    expect(resume).toBeEnabled();
  });

  it('exposes the field as one labelled roving-tab-stop grid', () => {
    render(<App initialGame={createGame()} />);

    const grid = screen.getByRole('grid', { name: /chessball board/i });
    const rows = within(grid).getAllByRole('row');
    const cells = within(grid).getAllByRole('gridcell');
    expect(grid).toHaveAttribute('aria-rowcount', '11');
    expect(grid).toHaveAttribute('aria-colcount', '24');
    expect(rows).toHaveLength(11);
    rows.forEach((row) => expect(within(row).getAllByRole('gridcell')).toHaveLength(24));
    expect(cells).toHaveLength(264);
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([screen.getByTitle('4,5')]);
    expect(cells.filter((cell) => cell.tabIndex === -1)).toHaveLength(263);
  });

  it('prioritizes a selected piece when the board initially chooses its tab stop', () => {
    const game = createGame();
    const selectedPiece = game.pieces.find((piece) => piece.id === 'home-wr1');
    render(
      <AccessibleBoard
        game={game}
        displayGame={game}
        legalActions={[]}
        selectedPiece={selectedPiece}
        targetMode={null}
        ballCoord={{ x: 4, y: 5 }}
        showBallMarker
        readOnly={false}
        onSquareClick={vi.fn()}
        squareClass={() => 'square'}
        renderYardTicks={() => null}
        renderYardMarker={() => null}
        ballLabel="Ball"
      />,
    );

    expect(screen.getByTitle('4,1')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTitle('4,5')).toHaveAttribute('tabindex', '-1');
  });

  it('maps power, pass, tackle, and kick actions to distinct semantic cell classes', () => {
    const game = { ...createGame(), phase: 'kickPlacement' as const };
    const qb = game.pieces.find((piece) => piece.id === 'home-qb');
    const receiver = game.pieces.find((piece) => piece.id === 'home-wr1');
    const tackleTarget = game.pieces.find((piece) => piece.id === 'away-wr1');
    render(
      <AccessibleBoard
        game={game}
        displayGame={game}
        legalActions={[
          { type: 'powerMove', pieceId: 'home-qb', to: { x: 6, y: 5 } },
          { type: 'pass', passerId: 'home-qb', receiverId: 'home-wr1' },
          { type: 'tackle', defenderId: 'home-qb', targetId: 'away-wr1' },
          { type: 'placeKick', at: { x: 8, y: 5 } },
        ]}
        selectedPiece={qb}
        selectedBallCarrier={qb}
        targetMode="pass"
        ballCoord={{ x: 4, y: 5 }}
        showBallMarker
        readOnly={false}
        onSquareClick={vi.fn()}
        squareClass={() => 'square'}
        renderYardTicks={() => null}
        renderYardMarker={() => null}
        ballLabel="Ball"
      />,
    );

    expect(screen.getByTitle('6,5')).toHaveClass('power-target');
    expect(screen.getByTitle(`${receiver?.coord.x},${receiver?.coord.y}`)).toHaveClass('pass-target');
    expect(screen.getByTitle(`${tackleTarget?.coord.x},${tackleTarget?.coord.y}`)).toHaveClass('tackle-target');
    expect(screen.getByTitle('8,5')).toHaveClass('kick-target');
  });

  it('falls back to the first square when neither a selection nor visible ball exists', () => {
    render(<App />);

    expect(screen.getByTitle('0,0')).toHaveAttribute('tabindex', '0');
    expect(screen.getByTitle('0,0')).not.toHaveAccessibleName(/selected/i);
  });

  it('moves board focus with clamped arrow keys and preserves it across ordinary rerenders', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(Element.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
    render(<App initialGame={createGame()} />);
    const ballSquare = screen.getByTitle('4,5');
    act(() => ballSquare.focus());

    fireEvent.keyDown(ballSquare, { key: 'ArrowRight' });
    expect(screen.getByTitle('5,5')).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    scrollIntoView.mockClear();

    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    expect(screen.getByTitle('5,5')).toHaveAttribute('tabindex', '0');
    expect(scrollIntoView).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTitle('6,5'));
    expect(scrollIntoView).not.toHaveBeenCalled();

    const leftEdge = screen.getByTitle('0,5');
    act(() => leftEdge.focus());
    fireEvent.keyDown(leftEdge, { key: 'ArrowLeft' });
    expect(leftEdge).toHaveFocus();

    const topEdge = screen.getByTitle('5,0');
    act(() => topEdge.focus());
    fireEvent.keyDown(topEdge, { key: 'ArrowUp' });
    expect(topEdge).toHaveFocus();
    const bottomEdge = screen.getByTitle('5,10');
    act(() => bottomEdge.focus());
    fireEvent.keyDown(bottomEdge, { key: 'ArrowDown' });
    expect(bottomEdge).toHaveFocus();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('makes a clicked square the board tab stop without relying on browser focus behavior', () => {
    render(<App initialGame={createGame()} />);
    const target = screen.getByTitle('6,5');

    fireEvent.click(target);

    expect(target).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('gridcell').filter((cell) => cell.tabIndex === 0)).toEqual([target]);
  });

  it('gives Enter and Space the same square behavior as pointer activation', () => {
    render(<App initialGame={createGame()} />);

    const receiver = screen.getByTitle('4,1');
    fireEvent.keyDown(receiver, { key: 'Enter' });
    expect(screen.getByText('WR selected.')).toBeInTheDocument();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    fireEvent(receiver, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Selection cleared.')).toBeInTheDocument();
  });

  it('describes board occupants, ball, selection, and available square actions', () => {
    render(<App initialGame={createGame()} />);

    const qb = screen.getByTitle('4,5');
    expect(qb).toHaveAccessibleName(/square 4, 5; home qb; controlled ball/i);
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    fireEvent.click(screen.getByTitle('4,1'));
    expect(screen.getByTitle('4,1')).toHaveAccessibleName(/selected/i);
    expect(screen.getByTitle('4,1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('gridcell', { name: /legal move/i }).length).toBeGreaterThan(0);
  });

  it('keeps history board cells inspectable but prevents pointer and keyboard mutation', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));
    fireEvent.click(screen.getByRole('button', { name: /previous move/i }));

    const historySquare = screen.getByTitle('4,5');
    const historyIndex = screen.getByText(/move \d+ of \d+/i).textContent;
    expect(historySquare).toHaveAccessibleName(/read-only history/i);
    expect(historySquare).toHaveAttribute('aria-disabled', 'true');
    expect(historySquare).toHaveAttribute('tabindex');

    fireEvent.click(historySquare);
    fireEvent.keyDown(historySquare, { key: 'Enter' });
    fireEvent.keyDown(historySquare, { key: ' ' });
    expect(screen.getByText(/move \d+ of \d+/i)).toHaveTextContent(historyIndex ?? '');
  });

  it('selects a piece with one click before the snap without spending a formation shift', () => {
    render(<App initialGame={createGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));

    expect(screen.getByText(/WR\/CB · 4,1/)).toBeInTheDocument();
    expect(screen.getByText('WR selected.')).toBeInTheDocument();
  });

  it('changes selected piece with one click instead of attempting a pre-snap move', () => {
    render(<App initialGame={createGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,5'));

    expect(screen.getByText(/QB\/FS · 4,5/)).toBeInTheDocument();
    expect(screen.queryByText('shift resolved.')).not.toBeInTheDocument();
  });

  it('deselects a selected piece when it is clicked again', () => {
    render(<App initialGame={createGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,1'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
    expect(screen.getByText('Selection cleared.')).toBeInTheDocument();
  });

  it('clears selection after a pre-snap shift resolves', () => {
    render(<App initialGame={createGame()} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,0'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it.each(['Cancel', 'Escape'])('asks before New Game and %s preserves the complete active match state', (dismissal) => {
    render(<App initialGame={createGame({ score: { home: 7, away: 3 } })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    fireEvent.click(screen.getByTitle('4,1'));

    const historyBefore = screen.getByText(/move \d+ of \d+/i).textContent;
    const newGame = screen.getByRole('button', { name: /new game/i });
    newGame.focus();
    fireEvent.click(newGame);

    const confirmation = screen.getByRole('dialog', { name: /new game/i });
    expect(within(confirmation).getByRole('button', { name: /cancel/i })).toHaveFocus();
    if (dismissal === 'Cancel') fireEvent.click(within(confirmation).getByRole('button', { name: /cancel/i }));
    else fireEvent.keyDown(confirmation, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /new game/i })).not.toBeInTheDocument();
    expect(screen.getByText(/move \d+ of \d+/i)).toHaveTextContent(historyBefore ?? '');
    const gameStatus = screen.getByRole('region', { name: /game status/i });
    expect(within(gameStatus).getByText('7')).toBeInTheDocument();
    expect(within(gameStatus).getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Formation')).toBeInTheDocument();
    expect(screen.getByText(/WR\/CB · 4,1/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home human/i })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /away human/i })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /next move/i })).toBeDisabled();
    expect(newGame).toHaveFocus();
  });

  it('pauses computer automation while New Game confirmation is open', () => {
    vi.useFakeTimers();
    try {
      render(<App initialGame={createGame({ phase: 'live' })} initialPlayers={{ home: 'computer', away: 'computer' }} />);
      fireEvent.click(screen.getByRole('button', { name: /play auto/i }));
      fireEvent.click(screen.getByRole('button', { name: /new game/i }));

      act(() => vi.advanceTimersByTime(500));

      expect(screen.getByRole('dialog', { name: /new game/i })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /final result/i })).not.toBeInTheDocument();
      expect(screen.getByText(/move 1 of 1/i)).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('dialog', { name: /new game/i })).getByRole('button', { name: /cancel/i }));
      act(() => vi.advanceTimersByTime(500));
      expect(screen.queryByText(/move 1 of 1/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only resets an active match after New Game is confirmed', () => {
    render(<App initialGame={createGame({ score: { home: 7, away: 3 } })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByTitle('4,1'));
    const newGame = screen.getByRole('button', { name: /new game/i });
    const rules = screen.getByRole('button', { name: /rules/i });
    fireEvent.click(rules);
    fireEvent.click(newGame);
    fireEvent.click(within(screen.getByRole('dialog', { name: /new game/i })).getByRole('button', { name: /^confirm$/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
    expect(screen.getByText('Choose player types, then press Start Game.')).toBeInTheDocument();
    expect(screen.getByText(/move 1 of 1/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home human/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /away computer/i })).toBeEnabled();
  });

  it('shows Start Game before a match and New Game once a match is active', () => {
    const { unmount } = render(<App />);

    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new game/i })).not.toBeInTheDocument();

    unmount();
    render(<App initialGame={createGame()} />);

    expect(screen.getByRole('button', { name: /new game/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /start game/i })).not.toBeInTheDocument();
  });

  it('loads into an empty pre-game board until Start Game is pressed', () => {
    const { container } = render(<App />);

    expect(screen.getByRole('heading', { name: 'Chessball' })).toBeInTheDocument();
    expect(screen.queryByText(/gridiron tactics lab/i)).not.toBeInTheDocument();
    expect(screen.getByText((_, node) => node?.textContent === 'Q1')).toBeInTheDocument();
    expect(screen.getByText('Drive 0 of 16')).toBeInTheDocument();
    expect(screen.getByText('16 drives left')).toBeInTheDocument();
    expect(screen.getByText('Pregame')).toBeInTheDocument();
    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('Ready')).toBeInTheDocument();
    expect(screen.queryByText('Not Started')).not.toBeInTheDocument();
    expect(screen.queryByText(/1 &/)).not.toBeInTheDocument();
    expect(screen.getByText('Choose player types, then press Start Game.')).toBeInTheDocument();
    expect(container.querySelectorAll('.piece')).toHaveLength(0);
    expect(screen.queryByLabelText(/^Ball:/)).not.toBeInTheDocument();
    expect(screen.queryByText(/line of scrimmage/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/line to gain/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('5,5')).not.toHaveClass('scrimmage-forward');
    expect(screen.getByTitle('7,5')).not.toHaveClass('first-down-forward');
    expect(screen.getByTitle('12,5')).toHaveClass('midfield');
    expect(screen.queryByRole('dialog', { name: /coin toss/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /flip coin/i })).not.toBeInTheDocument();
  });

  it('shows football-style yard numbers at the top and bottom of the field', () => {
    render(<App />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    const bottom50Left = within(screen.getByTitle('11,9')).getByLabelText('Bottom 50 yard marker left digit');
    const bottom50Right = within(screen.getByTitle('12,9')).getByLabelText('Bottom 50 yard marker right digit');
    const top50Left = within(screen.getByTitle('11,1')).getByLabelText('Top 50 yard marker left digit');
    const top50Right = within(screen.getByTitle('12,1')).getByLabelText('Top 50 yard marker right digit');
    const bottomLeft40Left = within(screen.getByTitle('9,9')).getByLabelText('Bottom 40 yard marker left digit, arrow left');
    const bottomLeft40Right = within(screen.getByTitle('10,9')).getByLabelText('Bottom 40 yard marker right digit');
    const topRight40Left = within(screen.getByTitle('13,1')).getByLabelText('Top 40 yard marker left digit');
    const topRight40Right = within(screen.getByTitle('14,1')).getByLabelText('Top 40 yard marker right digit, arrow right');

    expect(bottom50Left).toHaveTextContent('5');
    expect(bottom50Left).toHaveClass('yard-digit-left');
    expect(bottom50Right).toHaveTextContent('0');
    expect(bottom50Right).toHaveClass('yard-digit-right');
    expect(top50Left).toHaveTextContent('0');
    expect(top50Left).toHaveClass('inverted');
    expect(top50Right).toHaveTextContent('5');
    expect(top50Right).toHaveClass('inverted');
    expect(bottomLeft40Left).toHaveTextContent('4');
    expect(bottomLeft40Left).toHaveClass('arrow-left');
    expect(bottomLeft40Right).toHaveTextContent('0');
    expect(topRight40Left).toHaveTextContent('0');
    expect(topRight40Left).toHaveClass('inverted');
    expect(topRight40Right).toHaveTextContent('4');
    expect(topRight40Right).toHaveClass('arrow-left');
    expect(topRight40Right).toHaveClass('inverted');
    expect(screen.getByTitle('11,10')).not.toHaveTextContent('5');
    expect(screen.getByTitle('11,0')).not.toHaveTextContent('0');
    expect(cssText).toMatch(/\.yard-number\s*{[^}]*font-size: 2\.05rem/s);
  });

  it('renders five left-aligned one-yard ticks on every top and bottom field square', () => {
    const { container } = render(<App />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(screen.getByTitle('0,0').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('1,10').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('22,0').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('23,10').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('2,0').querySelectorAll('.yard-tick')).toHaveLength(5);
    expect(screen.getByTitle('12,10').querySelectorAll('.yard-tick')).toHaveLength(5);
    expect(screen.getByTitle('2,4').querySelectorAll('.yard-ticks.interior.top .yard-tick')).toHaveLength(5);
    expect(screen.getByTitle('12,6').querySelectorAll('.yard-ticks.interior.bottom .yard-tick')).toHaveLength(5);
    expect(screen.getByTitle('1,4').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('22,6').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(screen.getByTitle('12,5').querySelector('.yard-ticks')).not.toBeInTheDocument();
    expect(container.querySelectorAll('.yard-ticks.sideline.top')).toHaveLength(20);
    expect(container.querySelectorAll('.yard-ticks.sideline.bottom')).toHaveLength(20);
    expect(container.querySelectorAll('.yard-ticks.interior.top')).toHaveLength(20);
    expect(container.querySelectorAll('.yard-ticks.interior.bottom')).toHaveLength(20);
    expect(cssText).toMatch(/\.yard-ticks\s*{[^}]*grid-template-columns: repeat\(5, 20%\)/s);
    expect(cssText).toMatch(/\.yard-tick\s*{[^}]*justify-self: start/s);
  });

  it('layers yard numbers and ticks below pieces', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(cssText).toMatch(/\.yard-number\s*{[^}]*z-index: 0;/s);
    expect(cssText).toMatch(/\.yard-ticks\s*{[^}]*z-index: 0;/s);
    expect(cssText).toMatch(/\.piece\s*{[^}]*z-index: 2;/s);
    expect(cssText).toMatch(/\.football-marker\s*{[^}]*z-index: 3;/s);
  });

  it('renders field goal posts on both end zones', () => {
    render(<App />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    for (const y of [4, 5, 6]) {
      expect(screen.getByTitle(`0,${y}`)).toHaveClass('goal-post-left');
      expect(screen.getByTitle(`23,${y}`)).toHaveClass('goal-post-right');
    }
    expect(cssText).toMatch(/\.square\.goal-post-left\s*{[^}]*inset 6px 0 0 var\(--gold\)/s);
    expect(cssText).toMatch(/\.square\.goal-post-right\s*{[^}]*inset -6px 0 0 var\(--gold\)/s);
  });

  it('opens the coin toss only after Start Game is pressed', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByRole('dialog', { name: /coin toss/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flip coin/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/coin toss/i).length).toBeGreaterThan(0);
  });

  it('resolves a coin toss in a modal before kickoff choices are available', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /away human/i }));
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    const dialog = screen.getByRole('dialog', { name: /coin toss/i });
    fireEvent.click(within(dialog).getByRole('button', { name: /flip coin/i }));

    expect(screen.getAllByText(/won the coin toss/i).length).toBeGreaterThan(0);
    expect(within(dialog).getByLabelText(/coin landed (heads|tails)/i)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^kick$/i })).toBeEnabled();
    expect(within(dialog).getByRole('button', { name: /^receive$/i })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole('button', { name: /^receive$/i }));

    expect(screen.getAllByText(/will receive. .* kicks off/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: /coin toss/i })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /kickoff/i })).toBeEnabled();
  });

  it('traps forward and reverse focus in the coin toss when focused controls become unavailable', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /away human/i }));
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    const dialog = screen.getByRole('dialog', { name: /coin toss/i });
    const flip = within(dialog).getByRole('button', { name: /flip coin/i });
    flip.focus();
    fireEvent.click(flip);

    const kick = within(dialog).getByRole('button', { name: /^kick$/i });
    const receive = within(dialog).getByRole('button', { name: /^receive$/i });
    expect(flip).toBeDisabled();
    expect(flip).toHaveFocus();

    const reverseFromDisabled = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    fireEvent(flip, reverseFromDisabled);
    expect(reverseFromDisabled.defaultPrevented).toBe(true);
    expect(receive).toHaveFocus();

    fireEvent.keyDown(receive, { key: 'Tab' });
    expect(kick).toHaveFocus();
    fireEvent.keyDown(kick, { key: 'Tab', shiftKey: true });
    expect(receive).toHaveFocus();

    screen.getByRole('heading', { name: 'Chessball' }).focus();
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'Tab' });
    expect(kick).toHaveFocus();
  });

  it('shows kickoff labels without scrimmage or first-down overlays', () => {
    const tossed = applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' });
    const kickoff = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'home', choice: 'receive' });

    render(<App initialGame={kickoff} />);

    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('Kickoff')).toBeInTheDocument();
    expect(screen.queryByText(/1 &/)).not.toBeInTheDocument();
    expect(within(screen.getByTitle('15,5')).getByText('K')).toBeInTheDocument();
    expect(screen.getByTitle('15,5')).not.toHaveClass('scrimmage-backward');
    expect(screen.getByTitle('8,5')).not.toHaveClass('first-down-backward');
    expect(screen.queryByText(/Line of scrimmage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Line to gain/)).not.toBeInTheDocument();
  });

  it('shows match progress through total drives and current-quarter drives', () => {
    render(<App initialGame={createGame({
      quarter: 3,
      drivesThisQuarter: { home: 1, away: 0 },
    })} />);

    expect(screen.getByText('Drive 9 of 16')).toBeInTheDocument();
    expect(screen.getByText('7 drives left')).toBeInTheDocument();
    expect(screen.getByText('Q3: Home 1/2, Away 0/2')).toBeInTheDocument();
  });

  it('shows a final result modal when the match ends', () => {
    render(<App initialGame={createGame({
      phase: 'final',
      score: { home: 14, away: 10 },
      quarter: 4,
      drivesThisQuarter: { home: 2, away: 2 },
    })} />);

    expect(screen.getByRole('dialog', { name: /final result/i })).toBeInTheDocument();
    expect(screen.getByText('Home wins')).toBeInTheDocument();
    expect(screen.getByText('Home 14 - Away 10')).toBeInTheDocument();
    expect(screen.getByText('Final: Drive 16 of 16')).toBeInTheDocument();
  });

  it('keeps required coin toss and final result dialogs open on Escape and backdrop clicks', () => {
    const { unmount } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));
    const coinDialog = screen.getByRole('dialog', { name: /coin toss/i });
    fireEvent.keyDown(coinDialog, { key: 'Escape' });
    fireEvent.click(coinDialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: /coin toss/i })).toBeInTheDocument();

    unmount();
    render(<App initialGame={createGame({ phase: 'final' })} />);
    const finalDialog = screen.getByRole('dialog', { name: /final result/i });
    fireEvent.keyDown(finalDialog, { key: 'Escape' });
    fireEvent.click(finalDialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: /final result/i })).toBeInTheDocument();
  });

  it('resets directly from the Final Result New Game action without stacking confirmation', () => {
    const finalGame = createGame({
      phase: 'final',
      score: { home: 21, away: 17 },
      quarter: 4,
      drivesThisQuarter: { home: 2, away: 2 },
      drivesRemaining: { home: 0, away: 0 },
    });
    render(<App initialGame={finalGame} initialPlayers={{ home: 'computer', away: 'human' }} />);

    fireEvent.click(within(screen.getByRole('dialog', { name: /final result/i })).getByRole('button', { name: /new game/i }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
    expect(screen.getByText('Choose player types, then press Start Game.')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Chessball' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
  });

  it('lets users choose offensive and defensive formations before the snap', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    expect(screen.getByRole('heading', { name: /formations/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /shotgun/i }));
    expect(screen.getByText('Offense formation: Shotgun.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /snap/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    expect(screen.getByText('Offense formation confirmed.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /nickel/i }));
    expect(screen.getByText('Defense formation: Nickel.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));
    expect(screen.getByText('Defense formation confirmed.')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /formations/i })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^command$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /snap/i })).toBeEnabled();
  });

  it('groups game setup controls below the field and removes the signal panel', () => {
    render(<App />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    const setup = screen.getByRole('region', { name: /game setup/i });
    expect(setup.querySelector('.utility-control-row')).toBeInTheDocument();
    expect(setup.querySelector('.utility-status-row')).toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: /start game/i })).toBeInTheDocument();
    expect(within(setup).queryByRole('button', { name: /new game/i })).not.toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: /rules/i })).toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: /home human/i })).toBeInTheDocument();
    expect(within(setup).getByRole('button', { name: /away computer/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /signal/i })).not.toBeInTheDocument();
    expect(cssText).toMatch(/\.utility-control-row\s*{\s*display: flex;/);
    expect(cssText).toMatch(/\.utility-actions\s*{\s*display: flex;/);
    expect(cssText).toMatch(/\.utility-players\s*{\s*display: flex;/);
  });

  it('defines distinct focus, selection, and non-color board state cues', () => {
    const { container } = render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    fireEvent.click(screen.getByTitle('4,1'));
    expect(container.querySelector('.square[aria-selected="true"]')).toHaveClass('is-selected');
    expect(container.querySelector('.square.legal')).toHaveClass('move-target');

    expect(cssText).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid #fff[^}]*outline-offset:\s*3px/s);
    expect(cssText).toMatch(/\.square\.is-selected\s*{[^}]*outline:\s*3px double/s);
    expect(cssText).not.toMatch(/\.square\.is-selected\s*{[^}]*box-shadow:/s);
    expect(cssText).toMatch(/\.square\.move-target::after\s*{[^}]*border-radius:\s*50%/s);
    expect(cssText).toMatch(/\.square\.power-target::after\s*{[^}]*transform:[^}]*rotate\(45deg\)/s);
    expect(cssText).toMatch(/\.square\.pass-target::before\s*{[^}]*content:\s*"P"/s);
    expect(cssText).toMatch(/\.square\.tackle-target::before\s*{[^}]*content:\s*"T"/s);
    expect(cssText).toMatch(/\.square\.kick-target::before\s*{[^}]*content:\s*"K"/s);
    expect(cssText).toMatch(/\.field\[aria-readonly="true"\] \.square\[tabindex="0"\]::before\s*{[^}]*content:\s*"RO"/s);
    expect(cssText).not.toMatch(/\.field\[aria-readonly="true"\] \.square\s*{[^}]*(?:background|background-image):/s);
    expect(cssText).toMatch(/\.field\[aria-readonly="true"\] \.square\s*{[^}]*outline:\s*1px dashed/s);
    expect(cssText).toMatch(/\.square\.pass-target::before,[\s\S]*?z-index:\s*3;[^}]*left:\s*1px;[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
    expect(cssText).toMatch(/\.square:is\(\.pass-target, \.tackle-target\) \.piece\s*{[^}]*inset:\s*3px 3px 3px 12px/s);
    expect(cssText).toMatch(/\.piece\s*{[^}]*z-index:\s*2;/s);
    expect(cssText).toMatch(/\.football-marker\s*{[^}]*z-index:\s*3;/s);
  });

  it('keeps the read-only cue legible in the open bottom-right corner', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(cssText).toMatch(
      /\.field\[aria-readonly="true"\] \.square\[tabindex="0"\]::before\s*{[^}]*content:\s*"RO";[^}]*left:\s*auto;[^}]*top:\s*auto;[^}]*right:\s*1px;[^}]*bottom:\s*1px;[^}]*min-width:\s*16px;[^}]*width:\s*16px;[^}]*font-size:\s*0\.45rem;[^}]*line-height:\s*10px;/s,
    );
  });

  it('defines touch-safe controls, contained dialogs, and viewport-contained mobile field scrolling', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(cssText).toMatch(/button\s*{[^}]*touch-action:\s*manipulation[^}]*-webkit-tap-highlight-color:/s);
    expect(cssText).toMatch(/\.rules-backdrop\s*{[^}]*overscroll-behavior:\s*contain/s);
    expect(cssText).toMatch(/\.rules-dialog\s*{[^}]*overscroll-behavior:\s*contain/s);
    expect(cssText).toMatch(/body\s*{[^}]*overflow-x:\s*clip/s);
    expect(cssText).toMatch(/@media \(max-width:\s*1119px\)[\s\S]*?body\s*{[^}]*min-width:\s*0/s);
    expect(cssText).toMatch(/@media \(max-width:\s*1119px\)[\s\S]*?\.field-wrap\s*{[^}]*min-width:\s*0[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-inline:\s*contain/s);
    expect(cssText).toMatch(/@media \(max-width:\s*1119px\)[\s\S]*?\.field\s*{[^}]*min-width:\s*860px/s);
    expect(cssText).toMatch(/@media \(max-width:\s*1119px\)[\s\S]*?:is\([\s\S]*?\.rules-close[\s\S]*?\)\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/s);
    expect(cssText).toMatch(/\.square\s*{[^}]*min-inline-size:\s*0;/s);
  });

  it('renders history controls as one icon-only row with accessible labels', () => {
    render(<App initialGame={createGame()} />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const controls = screen.getByRole('group', { name: /history controls/i });

    expect(controls).toHaveClass('history-controls');
    expect(cssText).toMatch(/\.history-controls\s*{[^}]*grid-template-columns:\s*repeat\(4,\s*minmax\(0,\s*1fr\)\)/s);
    for (const label of ['First move', 'Previous move', 'Next move', 'Latest move']) {
      const button = within(controls).getByRole('button', { name: label });
      expect(button.textContent?.trim()).toBe('');
      expect(button).toHaveAttribute('title', label);
    }
  });

  it('lets a user change formation before confirming it', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByRole('button', { name: /shotgun/i }));
    fireEvent.click(screen.getByRole('button', { name: /singleback/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));

    expect(screen.getByRole('button', { name: /singleback/i })).toHaveClass('active');
    expect(screen.getByText('Offense formation confirmed.')).toBeInTheDocument();
  });

  it('lets a human defense choose formation against a computer offense', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    expect(screen.getByRole('button', { name: /shotgun/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /nickel/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /nickel/i }));

    expect(screen.getByText('Defense formation: Nickel.')).toBeInTheDocument();
  });

  it('computer offense snaps after a human confirms the default defensive formation', async () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm defense/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/computer home: snap: home started the play/i).length).toBeGreaterThan(0);
    }, { timeout: 1800 });
  });

  it('waits for a human kick placement before a computer return', async () => {
    const kickoff = applyAction(
      applyAction(createGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' }),
      { type: 'chooseKickoffChoice', team: 'home', choice: 'kick' },
    );
    const { container } = render(<App initialGame={kickoff} initialPlayers={{ home: 'human', away: 'computer' }} />);

    fireEvent.click(screen.getByRole('button', { name: /kickoff/i }));

    await waitFor(() => {
      expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Kick Placement')).toBeInTheDocument();
    });

    const legalLanding = container.querySelector('.square.legal');
    expect(legalLanding).toBeInTheDocument();
    expect(legalLanding).toHaveAccessibleName(/kick placement/i);
    fireEvent.click(legalLanding as HTMLElement);

    await waitFor(() => {
      expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Kick Return')).toBeInTheDocument();
    });
    expect(screen.queryByRole('button', { name: /nickel/i })).not.toBeInTheDocument();
  });

  it('computer returner moves onto a reachable loose kickoff even after chasing it last turn', () => {
    const base = createGame();
    const returned = {
      ...base,
      phase: 'kickReturn' as const,
      possession: 'away' as const,
      direction: -1 as const,
      turn: 'away' as const,
      ball: { kind: 'loose' as const, coord: { x: 11, y: 5 } },
      pendingKick: {
        kind: 'kickoff' as const,
        kickingTeam: 'home' as const,
        receivingTeam: 'away' as const,
        from: { x: 4, y: 5 },
        distance: 7,
        roll: { die1: 3, die2: 4 },
      },
      play: {
        ...base.play,
        actions: [
          ...base.play.actions,
          { type: 'move' as const, pieceId: 'away-wr1', to: { x: 9, y: 5 } },
          { type: 'move' as const, pieceId: 'home-wr1', to: { x: 7, y: 5 } },
        ],
      },
      pieces: base.pieces.map((item) => {
        if (item.id === 'away-wr1') return { ...item, coord: { x: 9, y: 5 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 7, y: 5 } };
        return { ...item, coord: { x: 0, y: item.coord.y } };
      }),
    };

    const action = chooseComputerAction(returned, generateLegalActions(returned), 4, { home: 'human', away: 'computer' });

    expect(action).toEqual({ type: 'move', pieceId: 'away-wr1', to: { x: 11, y: 5 } });
  });

  it('draws the line of scrimmage on the offense-facing edge of the formation', () => {
    render(<App initialGame={createGame()} />);

    expect(screen.getByTitle('5,5')).toHaveClass('scrimmage-forward');
  });

  it('draws the first-down marker on the same forward edge as the scrimmage line', () => {
    render(<App initialGame={createGame()} />);

    expect(screen.getByTitle('7,5')).toHaveClass('first-down-forward');
  });

  it('keeps static midfield markings even when the line of scrimmage is at midfield', () => {
    render(<App initialGame={createGame({ lineOfScrimmage: 12, firstDownLine: 14 })} />);

    expect(screen.getByTitle('12,5')).toHaveClass('midfield');
    expect(screen.getByTitle('12,5')).toHaveClass('scrimmage-forward');
  });

  it('layers the blue scrimmage line above static yard lines', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const scrimmageRule = cssText.match(/\.square\.scrimmage-forward\s*{\s*box-shadow:\s*([^;]+);/);

    expect(scrimmageRule?.[1].trim().startsWith('inset -4px 0 0 var(--blue)')).toBe(true);
  });

  it('exposes field goals but only enables them during live offensive play', () => {
    const { unmount } = render(<App initialGame={createGame()} />);

    expect(screen.queryByRole('button', { name: /field goal/i })).not.toBeInTheDocument();

    unmount();
    render(<App initialGame={createGame({ formationConfirmed: { offense: true, defense: true } })} />);
    expect(screen.getByRole('button', { name: /field goal/i })).toBeDisabled();
    expect(screen.getByText(/passes, tackles, and kicks roll 2d6/i)).toBeInTheDocument();
  });

  it('exposes punts on any down during live offensive play', () => {
    render(<App initialGame={createGame({ phase: 'live', down: 2 })} />);

    expect(screen.getByRole('button', { name: /punt/i })).toBeEnabled();
  });

  it('identifies handoff targets by role and board coordinate', () => {
    const base = createGame({ phase: 'live' });
    const state = {
      ...base,
      pieces: base.pieces.map((piece) => {
        if (piece.id === 'home-qb') return { ...piece, coord: { x: 4, y: 5 } };
        if (piece.id === 'home-ol2') return { ...piece, coord: { x: 4, y: 4 } };
        if (piece.id === 'home-ol3') return { ...piece, coord: { x: 5, y: 5 } };
        return piece;
      }),
      ball: { kind: 'controlled' as const, pieceId: 'home-qb' },
    };
    render(<App initialGame={state} />);

    fireEvent.click(screen.getByTitle('4,5'));

    expect(screen.getByRole('button', { name: /handoff to home ol at 4,4/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /handoff to home ol at 5,5/i })).toBeInTheDocument();
  });

  it('highlights legal power-move targets differently from normal moves', () => {
    const afterHandoff = applyAction(createGame({ phase: 'live' }), { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
    const state = {
      ...afterHandoff,
      turn: 'home' as const,
      pieces: afterHandoff.pieces.map((piece) => {
        if (piece.id === 'home-qb') return { ...piece, coord: { x: 3, y: 4 } };
        if (piece.id === 'home-ol3') return { ...piece, coord: { x: 5, y: 4 } };
        if (piece.id === 'away-rb') return { ...piece, coord: { x: 4, y: 5 } };
        if (piece.team === 'away') return { ...piece, coord: { x: 18, y: piece.coord.y } };
        return piece;
      }),
      ball: { kind: 'controlled' as const, pieceId: 'home-rb' },
    };
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('3,5'));

    expect(screen.getByTitle('5,5')).toHaveClass('power-legal');
    expect(screen.getByTitle('5,5')).not.toHaveClass('legal');
    expect(screen.getByTitle('5,5')).toHaveAccessibleName(/power move/i);
  });

  it('requires an extra-point or two-point choice after touchdown', () => {
    render(<App initialGame={createGame({
      phase: 'betweenDowns',
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown', team: 'home' } },
    })} />);

    expect(screen.getByRole('button', { name: /extra point/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /two-point try/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  it('sets up a two-point formation from the conversion choice', () => {
    render(<App initialGame={createGame({
      phase: 'betweenDowns',
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown', team: 'home' } },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /two-point try/i }));

    expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Formation')).toBeInTheDocument();
    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('2PT Try')).toBeInTheDocument();
    expect(screen.getAllByText(/two-point try: home lines up from the goal line/i).length).toBeGreaterThan(0);
  });

  it('labels marker yardage by the scrimmage square, not the painted edge', () => {
    render(<App initialGame={createGame()} />);

    expect(screen.getByText('Line of scrimmage 20')).toBeInTheDocument();
    expect(screen.getByText('Line to gain 30')).toBeInTheDocument();
  });

  it('shows goal-to-go instead of a normal 10-yard distance at the goal line', () => {
    render(<App initialGame={createGame({ lineOfScrimmage: 20, firstDownLine: 21 })} />);

    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('1 & Goal')).toBeInTheDocument();
    expect(screen.queryByText('1 & 10')).not.toBeInTheDocument();
  });

  it('uses compact down-card text for kick returns', () => {
    render(<App initialGame={createGame({ phase: 'kickReturn', ball: { kind: 'loose', coord: { x: 10, y: 5 } } })} />);

    expect(screen.getByText('Return')).toHaveClass('compact-status');
  });

  it('clears the selected piece when an action changes turns', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it('clears a pre-snap selected piece when the ball is snapped', () => {
    render(<App initialGame={createGame({ formationConfirmed: { offense: true, defense: true } })} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('4,5'));
    expect(screen.getByText(/QB\/FS · 4,5/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /snap/i }));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it('only enables passing for the selected ball carrier', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const ready = applyAction(
      applyAction(
        applyAction(createGame(), { type: 'confirmFormation', side: 'offense' }),
        { type: 'confirmFormation', side: 'defense' },
      ),
      { type: 'snap' },
    );
    const state = {
      ...ready,
      pieces: ready.pieces.map((piece) => {
        if (piece.id === 'home-wr1') return { ...piece, coord: { x: 5, y: 4 } };
        if (piece.id === 'home-ol2') return { ...piece, coord: { x: 3, y: 4 } };
        return piece;
      }),
    };
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('5,4'));
    expect(screen.getByRole('button', { name: /^pass$/i })).toBeDisabled();

    fireEvent.click(screen.getByTitle('4,5'));
    expect(screen.getByRole('button', { name: /^pass$/i })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: /^pass$/i }));
    expect(screen.getByTitle('5,4')).toHaveAccessibleName(/pass target/i);
    fireEvent.click(screen.getByTitle('5,4'));

    expect(within(screen.getByRole('log', { name: /event log/i })).getByText(/completed pass: home hit WR at 5,4/i)).toBeInTheDocument();
  });

  it('logs incomplete passes clearly in the event log', () => {
    const base = createGame({ phase: 'live', formationConfirmed: { offense: true, defense: true } });
    const longPass = {
      ...base,
      turn: 'home' as const,
      ball: { kind: 'controlled' as const, pieceId: 'home-qb' },
      pieces: base.pieces.map((item) => {
        if (item.id === 'home-qb') return { ...item, coord: { x: 4, y: 5 } };
        if (item.id === 'home-wr1') return { ...item, coord: { x: 20, y: 1 } };
        if (item.team === 'away') return { ...item, coord: { x: 22, y: item.coord.y } };
        return item;
      }),
    };
    render(<App initialGame={longPass} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByRole('button', { name: /^pass$/i }));
    fireEvent.click(screen.getByTitle('20,1'));

    expect(within(screen.getByRole('log', { name: /event log/i })).getByText(/incomplete pass/i)).toBeInTheDocument();
  });

  it('opens a rules and how-to-play panel', () => {
    render(<App initialGame={createGame()} />);

    fireEvent.click(screen.getByRole('button', { name: /rules/i }));

    expect(screen.getByRole('dialog', { name: /rules and how to play/i })).toBeInTheDocument();
    expect(screen.getByText(/a match starts with a coin toss and kickoff/i)).toBeInTheDocument();
    expect(screen.getByText(/after a touchdown, choose an extra point kick or a two-point try/i)).toBeInTheDocument();
    expect(screen.getByText(/incomplete passes are dead balls/i)).toBeInTheDocument();
    expect(screen.queryByText(/block,/i)).not.toBeInTheDocument();
  });

  it('portals Rules outside the isolated app, locks scrolling, traps focus, and restores its trigger', () => {
    document.body.style.overflow = 'clip';
    render(<App initialGame={createGame()} />);
    const trigger = screen.getByRole('button', { name: /rules/i });
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /rules and how to play/i });
    const appRoot = document.getElementById('chessball-app');
    const close = within(dialog).getByRole('button', { name: /close rules/i });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(appRoot).toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('hidden');
    expect(close).toHaveFocus();

    fireEvent.keyDown(close, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /rules and how to play/i })).not.toBeInTheDocument();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('clip');
    expect(trigger).toHaveFocus();
    document.body.style.overflow = '';
  });

  it('shows a football marker in the corner of the controlled ball square', () => {
    render(<App initialGame={createGame()} />);

    const qbSquare = screen.getByTitle('4,5');

    expect(within(qbSquare).getByLabelText('Ball: controlled by QB')).toHaveClass('football-marker');
  });

  it('shows a football marker in the corner of a loose ball square', () => {
    render(<App initialGame={createGame({ ball: { kind: 'loose', coord: { x: 12, y: 5 } } })} />);

    const ballSquare = screen.getByTitle('12,5');

    expect(within(ballSquare).getByLabelText('Ball: loose')).toHaveClass('football-marker');
  });

  it('keeps stopped turnover boards on the previous offensive role view without showing the next QB ball marker', () => {
    const base = createGame();
    render(<App initialGame={{
      ...base,
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      ball: { kind: 'controlled', pieceId: 'away-qb' },
      play: { actions: [], result: { type: 'turnoverOnDowns', team: 'away' } },
    }} />);

    expect(within(screen.getByTitle('4,5')).getByText('QB')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ball: controlled by QB')).not.toBeInTheDocument();
  });

  it('does not show the next quarterback carrying the ball after a missed field goal before next down', () => {
    const base = createGame();
    render(<App initialGame={{
      ...base,
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      ball: { kind: 'controlled', pieceId: 'away-qb' },
      play: { actions: [], result: { type: 'fieldGoal', team: 'home', good: false } },
    }} />);

    expect(within(screen.getByTitle('4,5')).getByText('QB')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ball: controlled by QB')).not.toBeInTheDocument();
  });

  it('shows the last 2d6 roll as dice on the screen', () => {
    render(<App initialGame={createGame({ phase: 'live' })} />);

    fireEvent.click(screen.getByRole('button', { name: /field goal/i }));

    const dice = screen.getByLabelText(/last dice roll/i);
    expect(dice).toBeInTheDocument();
    expect(within(dice).getAllByLabelText(/die [12]: [1-6]/i)).toHaveLength(2);
  });

  it('shows one clear tackle command for the selected defender only against the ball carrier', () => {
    const base = createGame({ phase: 'live', turn: 'away' });
    const state = {
      ...base,
      ball: { kind: 'controlled' as const, pieceId: 'home-wr2' },
      pieces: base.pieces.map((piece) => {
        if (piece.id === 'home-wr2') return { ...piece, coord: { x: 8, y: 5 } };
        if (piece.id === 'home-wr1') return { ...piece, coord: { x: 2, y: 0 } };
        if (piece.id === 'away-wr1') return { ...piece, coord: { x: 8, y: 6 } };
        return piece;
      }),
    };
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByTitle('8,6'));

    expect(screen.getAllByRole('button', { name: /tackle home wr at 8,5/i })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /tackle wr2/i })).not.toBeInTheDocument();
    expect(screen.getByTitle('8,5')).toHaveAccessibleName(/tackle target/i);
    expect(screen.getByTitle('8,5')).not.toHaveClass('legal');
  });

  it('does not show tackle commands when selecting the ball carrier target', () => {
    const base = createGame({ phase: 'live', turn: 'away' });
    const state = {
      ...base,
      ball: { kind: 'controlled' as const, pieceId: 'home-wr2' },
      pieces: base.pieces.map((piece) => {
        if (piece.id === 'home-wr2') return { ...piece, coord: { x: 8, y: 5 } };
        if (piece.id === 'away-wr1') return { ...piece, coord: { x: 8, y: 6 } };
        return piece;
      }),
    };
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByTitle('8,5'));

    expect(screen.queryByRole('button', { name: /tackle/i })).not.toBeInTheDocument();
  });

  it('tackles by clicking a legal ball carrier after selecting a defender', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const base = createGame({ phase: 'live', turn: 'away' });
    const state = {
      ...base,
      ball: { kind: 'controlled' as const, pieceId: 'home-wr2' },
      pieces: base.pieces.map((piece) => {
        if (piece.id === 'home-wr2') return { ...piece, coord: { x: 8, y: 5 } };
        if (piece.id === 'away-wr1') return { ...piece, coord: { x: 8, y: 6 } };
        return piece;
      }),
    };
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('8,6'));
    fireEvent.click(screen.getByTitle('8,5'));

    expect(within(screen.getByRole('log', { name: /event log/i })).getByText(/tackle: away-wr1 stopped home-wr2/i)).toBeInTheDocument();
  });

  it('lets each team be set to human or computer', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /home human/i })).toHaveClass('active');
    expect(screen.getByRole('button', { name: /away computer/i })).toHaveClass('active');

    fireEvent.click(screen.getByRole('button', { name: /away human/i }));

    expect(screen.getByRole('button', { name: /away human/i })).toHaveClass('active');
  });

  it('locks player selection after Start Game launches play', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /away human/i }));
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.getByRole('button', { name: /home computer/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /away computer/i })).toBeDisabled();
  });

  it('automatically resolves the coin toss for computer versus computer starts', () => {
    render(<App />);

    fireEvent.click(screen.getByRole('button', { name: /home computer/i }));
    fireEvent.click(screen.getByRole('button', { name: /start game/i }));

    expect(screen.queryByRole('dialog', { name: /coin toss/i })).not.toBeInTheDocument();
    expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Kickoff')).toBeInTheDocument();
    expect(screen.getAllByText(/coin toss:/i).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /home human/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /away human/i })).toBeDisabled();
  });

  it('shows friendly phase names instead of raw state values', () => {
    render(<App initialGame={createGame()} />);

    expect(screen.getByText('Formation')).toBeInTheDocument();
    expect(screen.queryByText('formation')).not.toBeInTheDocument();
  });

  it('logs every successful action and can step through board history', () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    const log = screen.getByRole('log', { name: /event log/i });
    expect(within(log).getByText(/snap: home started the play/i)).toBeInTheDocument();
    expect(within(log).getByText(/move: home qb moved to 3,6/i)).toBeInTheDocument();

    expect(within(screen.getByTitle('3,6')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /previous move/i }));

    expect(screen.getAllByText(/viewing history/i).length).toBeGreaterThan(0);
    expect(within(screen.getByTitle('4,5')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /snap/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /next move/i }));

    expect(within(screen.getByTitle('3,6')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();
  });

  it('lets a computer-controlled team make a basic automatic move', async () => {
    render(<App initialGame={createGame({ formationConfirmed: { offense: true, defense: true } })} />);

    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    await waitFor(() => {
      expect(screen.getAllByText(/computer away:/i).length).toBeGreaterThan(0);
    });
  });

  it('requires play before starting a computer versus computer loop and then allows pausing', async () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);

    await new Promise((resolve) => setTimeout(resolve, 320));

    expect(screen.queryByText(/computer home:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause auto/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /play auto/i }));

    expect(screen.getByRole('button', { name: /pause auto/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /home human/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /away human/i })).toBeDisabled();

    await waitFor(() => {
      expect(screen.getAllByText(/computer home:/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /pause auto/i }));
    expect(screen.getByRole('button', { name: /resume auto/i })).toBeInTheDocument();
  });

  it('hides computer loop controls unless both players are computer', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /pause auto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play auto/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /home computer/i }));

    expect(screen.getByRole('button', { name: /play auto/i })).toBeInTheDocument();
  });

  it('computer teams choose varied formations before snapping', async () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    fireEvent.click(screen.getByRole('button', { name: /play auto/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/computer home: formation: offense chose/i).length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(screen.getAllByText(/computer home: formation: defense chose/i).length).toBeGreaterThan(0);
    });

    const logText = screen.getByRole('log', { name: /event log/i }).textContent ?? '';
    expect(logText).toMatch(/Shotgun|Singleback|Nickel|Goal Line/);
  });

  it('computer offense does not open live play with an immediate pass', async () => {
    render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /nickel/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /nickel/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));

    await waitFor(() => {
      expect(screen.getAllByText(/computer home: (move|handoff):/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const logText = screen.getByRole('log', { name: /event log/i }).textContent ?? '';
    expect(logText).not.toMatch(/Computer home: Pass:.*Computer home: Snap:/i);
  });

  it('computer versus computer does not open with a pass immediately followed by a tackle', () => {
    vi.useFakeTimers();
    const view = render(<App initialGame={createGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    try {
      fireEvent.click(screen.getByRole('button', { name: /play auto/i }));
      for (let transition = 0; transition < 7; transition += 1) {
        act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
      }

      const logText = screen.getByRole('log', { name: /event log/i }).textContent ?? '';
      expect(logText).toMatch(/Computer home: Snap:/i);
      expect(logText).toMatch(/Computer home: (Move|Handoff):/i);
      expect(logText).toMatch(/Computer away:/i);
      expect(logText).not.toMatch(/Computer away: Tackle:.*Computer home: Pass:/i);
    } finally {
      view.unmount();
      vi.clearAllTimers();
      vi.useRealTimers();
    }
  });

  it('computer-controlled teams attempt the extra point after a touchdown', async () => {
    render(<App initialGame={createGame({
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      score: { home: 0, away: 6 },
      play: { actions: [], result: { type: 'touchdown', team: 'away' } },
    })} />);

    await waitFor(() => {
      expect(screen.getAllByText(/computer away: kick: away-qb attempted extra point/i).length).toBeGreaterThan(0);
    }, { timeout: 1200 });
  });

  it('computer-controlled offense attempts a field goal on fourth down in range', async () => {
    render(<App initialGame={createGame({
      phase: 'live',
      possession: 'away',
      direction: -1,
      turn: 'away',
      down: 4,
      lineOfScrimmage: 6,
      firstDownLine: 4,
    })} />);

    await waitFor(() => {
      expect(screen.getAllByText(/computer away: kick: away-qb attempted field goal/i).length).toBeGreaterThan(0);
    }, { timeout: 1200 });
  });
});
