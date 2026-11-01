import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App, chooseComputerAction, COMPUTER_ACTION_DELAY_MS } from './main';
import { cleanup } from '@testing-library/react';
import { applyAction, createGame, defensiveFormations, generateLegalActions, offensiveFormations } from './engine/rules';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AccessibleBoard } from './ui/AccessibleBoard';
import { Modal } from './ui/Modal';
import { useRef, useState } from 'react';

// Fixed midfield-side fixture keeps movement/interaction coordinates explicit.
const fixtureGame = (overrides: Parameters<typeof createGame>[0] = {}) => createGame({ lineOfScrimmage: 6, ...overrides });

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

const splitCssSelectorList = (selectorText: string) => {
  const selectors: string[] = [];
  let start = 0;
  let parenthesisDepth = 0;
  let bracketDepth = 0;

  for (let index = 0; index < selectorText.length; index += 1) {
    const character = selectorText[index];
    if (character === '(') parenthesisDepth += 1;
    else if (character === ')') parenthesisDepth -= 1;
    else if (character === '[') bracketDepth += 1;
    else if (character === ']') bracketDepth -= 1;
    else if (character === ',' && parenthesisDepth === 0 && bracketDepth === 0) {
      selectors.push(selectorText.slice(start, index).trim());
      start = index + 1;
    }
  }

  selectors.push(selectorText.slice(start).trim());
  return selectors.filter(Boolean);
};

const isForbiddenPieceGeometryProperty = (property: string) => /^(?:(?:-(?:webkit|moz|ms|o)-)?transform(?:-.+)?|translate|scale|rotate|inset(?:-.+)?|(?:min-|max-)?(?:width|height|inline-size|block-size)|(?:margin|padding)(?:-.+)?|top|right|bottom|left)$/.test(property);

const findTargetPieceGeometryViolations = (cssText: string): string[] => {
  const violations: string[] = [];
  const uncommentedCss = cssText.replace(/\/\*[\s\S]*?\*\//g, '');

  for (const rule of uncommentedCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const declarations = rule[2]
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)
      .map((declaration) => {
        const separator = declaration.indexOf(':');
        return separator === -1 ? '' : declaration.slice(0, separator).trim().toLowerCase();
      })
      .filter(isForbiddenPieceGeometryProperty);

    if (declarations.length === 0) continue;

    for (const selector of splitCssSelectorList(rule[1])) {
      const target = /\.(?:pass-target|tackle-target)(?![\w-])/.exec(selector);
      if (!target) continue;
      const afterTarget = selector.slice(target.index + target[0].length);
      if (!/(?:\s|[>+~])\.piece(?![\w-])/.test(afterTarget)) continue;
      for (const property of declarations) violations.push(`${selector} -> ${property}`);
    }
  }

  return violations;
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
    fireEvent.click(screen.getByRole('button', { name: closingAction, hidden: true }));
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
    const lowerAction = screen.getByRole('button', { name: 'First action', hidden: true });
    lowerAction.focus();
    fireEvent.keyDown(lowerAction, { key: 'Tab' });
    expect(screen.getByRole('button', { name: 'Second action' })).toHaveFocus();
  });

  it('exposes only the topmost modal to assistive technology and restores the lower modal on close', () => {
    render(<ModalTestShell />);
    const lowerDialog = screen.getByRole('dialog', { name: 'First modal', hidden: true });
    const upperDialog = screen.getByRole('dialog', { name: 'Second modal' });
    const lowerBackdrop = lowerDialog.parentElement;

    expect(lowerBackdrop).toHaveAttribute('inert');
    expect(lowerBackdrop).toHaveAttribute('aria-hidden', 'true');
    expect(lowerDialog).not.toHaveAttribute('aria-modal', 'true');
    expect(upperDialog).toHaveAttribute('aria-modal', 'true');
    expect(upperDialog.parentElement).not.toHaveAttribute('inert');
    expect(upperDialog.parentElement).not.toHaveAttribute('aria-hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Second action' }));

    expect(lowerBackdrop).not.toHaveAttribute('inert');
    expect(lowerBackdrop).not.toHaveAttribute('aria-hidden');
    expect(lowerDialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'First action' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'First action' }));
    expect(document.getElementById('chessball-app')).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('');
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
    const { container } = render(<App initialGame={fixtureGame()} />);

    const links = screen.getAllByRole('link');
    const appRoot = document.getElementById('chessball-app');
    expect(links[0]).toHaveAccessibleName('Skip to game workspace');
    expect(links[0]).toHaveAttribute('href', '#game-workspace');
    expect(appRoot).toContainElement(links[0]);
    const levelOneHeadings = screen.getAllByRole('heading', { level: 1 });
    expect(levelOneHeadings).toHaveLength(1);
    const workspaceHeading = levelOneHeadings[0];
    expect(workspaceHeading).toHaveAccessibleName('Chessball');
    expect(workspaceHeading).toHaveAttribute('id', 'game-workspace');
    expect(workspaceHeading).toHaveAttribute('tabindex', '-1');
    expect(workspaceHeading).toHaveClass('chessball-wordmark');
    fireEvent.click(links[0]);
    expect(workspaceHeading).toHaveFocus();
    expect(container.querySelectorAll('main')).toHaveLength(1);
    expect(screen.getByRole('complementary', { name: /game controls/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /chessball field/i })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: /game setup/i })).not.toBeInTheDocument();
    openMenu();
    expect(screen.getByRole('region', { name: /game setup/i })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /game history/i })).toBeInTheDocument();
  });

  it('defines the Chessball wordmark as scoped, local-font, decorative CSS', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const wordmarkRule = cssText.match(/\.chessball-wordmark\s*{([^}]*)}/s)?.[1] ?? '';
    const accentRule = cssText.match(/\.chessball-wordmark::(?:before|after)\s*{([^}]*)}/s)?.[1] ?? '';
    const focusRule = cssText.match(/\.chessball-wordmark:focus-visible\s*{([^}]*)}/s)?.[1] ?? '';

    expect(wordmarkRule).not.toBe('');
    expect(wordmarkRule).toMatch(/font-family:[^;]*(?:Impact|Haettenschweiler|Arial Narrow)[^;]*sans-serif/i);
    expect(wordmarkRule).toMatch(/font-weight:\s*(?:800|900)/);
    expect(wordmarkRule).toMatch(/transform:[^;]*skewX\(-?\d+(?:\.\d+)?deg\)/);
    expect(wordmarkRule).toMatch(/text-shadow:/);
    expect(accentRule).toMatch(/content:\s*""/);
    expect(accentRule).toMatch(/(?:width|height):/);
    expect(focusRule).toMatch(/outline:/);
    expect(cssText).not.toMatch(/@font-face|url\s*\(/i);
    expect(cssText).not.toMatch(/\.(?:nfl|shield|stars?)(?:\b|-)|(?:nfl|shield|stars?)[-_](?:asset|logo|wordmark)/i);
  });

  it('uses one concise polite status without copying the event log', () => {
    const { container } = render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    const statuses = screen.getAllByRole('status');
    expect(statuses).toHaveLength(1);
    expect(container.querySelectorAll('[aria-live="polite"]')).toHaveLength(1);
    expect(statuses[0]).toHaveTextContent(/snap: home started the play/i);
    expect(statuses[0]).toHaveTextContent(/live.*home to act/i);
    expect(statuses[0]).toHaveTextContent(/home 0.*away 0/i);
    expect(statuses[0]).not.toHaveTextContent(/offense formation confirmed.*defense formation confirmed/i);
    expect(statuses[0].contains(historyLog())).toBe(false);
  });

  it('keeps history silent while status announces the newest action', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));

    const log = historyLog();
    const newestEntry = within(log).getAllByText(/snap: home started the play/i)[0].textContent ?? '';
    expect(log).toHaveAttribute('role', 'log');
    expect(screen.getByRole('status')).toHaveTextContent(newestEntry);
    expect(log).toHaveAttribute('aria-live', 'off');
    expect(screen.getByRole('status')).toHaveTextContent(/live.*home to act.*home 0.*away 0/i);

    closeMenu();
    fireEvent.click(screen.getByTitle('4,5'));
    expect(screen.getByRole('status')).toHaveTextContent(/QB selected/i);
  });

  it('announces and exposes read-only history, then restores actionable latest state', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(menuButton(/previous move/i));

    const field = screen.getByRole('region', { name: /chessball field/i });
    const historyRegion = screen.getByRole('region', { name: /game history/i });
    expect(within(historyRegion).getByText(/viewing history.*read-only/i)).toBeInTheDocument();
    const grid = screen.getByRole('grid', { name: /chessball board/i });
    expect(field).not.toHaveAttribute('aria-readonly');
    expect(grid).toHaveAttribute('aria-readonly', 'true');
    expect(grid).toHaveAttribute('aria-describedby', 'history-read-only field-size-help');
    expect(screen.getByRole('status')).toHaveTextContent(/formation: defense confirmed/i);
    expect(screen.getByRole('status')).not.toHaveTextContent(/snap: home started the play/i);
    expect(screen.getByRole('status')).toHaveTextContent(/viewing history.*read-only.*history position \d+ of \d+/i);
    expect(screen.getByRole('button', { name: /snap/i })).toBeDisabled();
    expect(screen.getAllByRole('gridcell', { name: /read-only history/i }).some((cell) => cell.tabIndex === 0)).toBe(true);

    fireEvent.click(menuButton(/latest move/i));
    expect(field).not.toHaveAttribute('aria-readonly');
    expect(within(historyRegion).queryByText(/viewing history.*read-only/i)).not.toBeInTheDocument();
    expect(screen.getByTitle('4,5')).not.toHaveAttribute('aria-disabled');
    expect(screen.getByRole('status')).toHaveTextContent(/latest position/i);
  });

  it('keeps utility mutations disabled in history while Rules and Latest remain available', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(menuButton(/previous move/i));

    const newGame = menuButton(/new game/i);
    expect(newGame).toBeDisabled();
    expect(menuButton(/rules/i)).toBeEnabled();
    expect(menuButton(/latest move/i)).toBeEnabled();
    fireEvent.click(newGame);
    expect(screen.queryByRole('dialog', { name: /new game/i })).not.toBeInTheDocument();

    fireEvent.click(menuButton(/latest move/i));
    expect(newGame).toBeEnabled();
  });

  it('cannot resume computer automation from history and restores it at Latest', async () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    fireEvent.click(menuButton(/play auto/i));
    await waitFor(() => expect(screen.getAllByText(/Computer home:/i)[0]).toBeInTheDocument());
    expect(menuButton(/previous move/i)).toBeEnabled();
    fireEvent.click(menuButton(/pause auto/i));
    const log = historyLog();
    const logBefore = log.textContent;
    fireEvent.click(menuButton(/previous move/i));

    const resume = menuButton(/resume auto/i);
    expect(resume).toBeDisabled();
    fireEvent.click(resume);
    expect(log).toHaveTextContent(logBefore ?? '');

    fireEvent.click(menuButton(/latest move/i));
    expect(resume).toBeEnabled();
  });

  it('exposes the field as one labelled roving-tab-stop grid', () => {
    render(<App initialGame={fixtureGame()} />);

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
    const game = fixtureGame();
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
    const game = { ...fixtureGame(), phase: 'kickPlacement' as const };
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
    render(<App initialGame={fixtureGame()} />);
    const ballSquare = screen.getByTitle('4,5');
    const nextSquare = screen.getByTitle('5,5');
    const focus = vi.spyOn(nextSquare, 'focus');
    act(() => ballSquare.focus());

    fireEvent.keyDown(ballSquare, { key: 'ArrowRight' });
    expect(nextSquare).toHaveFocus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', inline: 'nearest' });
    expect(focus.mock.invocationCallOrder[0]).toBeLessThan(scrollIntoView.mock.invocationCallOrder[0]);
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
    render(<App initialGame={fixtureGame()} />);
    const target = screen.getByTitle('6,5');

    fireEvent.click(target);

    expect(target).toHaveAttribute('tabindex', '0');
    expect(screen.getAllByRole('gridcell').filter((cell) => cell.tabIndex === 0)).toEqual([target]);
  });

  it('gives Enter and Space the same square behavior as pointer activation', () => {
    render(<App initialGame={fixtureGame()} />);

    const receiver = screen.getByTitle('4,1');
    fireEvent.keyDown(receiver, { key: 'Enter' });
    expect(screen.getByText('WR selected.')).toBeInTheDocument();

    const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    fireEvent(receiver, event);
    expect(event.defaultPrevented).toBe(true);
    expect(screen.getByText('Selection cleared.')).toBeInTheDocument();
  });

  it('describes board occupants, ball, selection, and available square actions', () => {
    render(<App initialGame={fixtureGame()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));

    const qb = screen.getByTitle('4,5');
    expect(qb).toHaveAccessibleName(/square 4, 5; home qb; controlled ball/i);
    fireEvent.click(screen.getByTitle('4,1'));
    expect(screen.getByTitle('4,1')).toHaveAccessibleName(/selected/i);
    expect(screen.getByTitle('4,1')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getAllByRole('gridcell', { name: /legal move/i }).length).toBeGreaterThan(0);
  });

  it('keeps history board cells inspectable but prevents pointer and keyboard mutation', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));
    fireEvent.click(menuButton(/previous move/i));

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
    render(<App initialGame={fixtureGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));

    expect(screen.getByText(/WR\/CB · 4,1/)).toBeInTheDocument();
    expect(screen.getByText('WR selected.')).toBeInTheDocument();
  });

  it('changes selected piece with one click instead of attempting a pre-snap move', () => {
    render(<App initialGame={fixtureGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,5'));

    expect(screen.getByText(/QB\/FS · 4,5/)).toBeInTheDocument();
    expect(screen.queryByText('shift resolved.')).not.toBeInTheDocument();
  });

  it('deselects a selected piece when it is clicked again', () => {
    render(<App initialGame={fixtureGame()} />);

    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,1'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
    expect(screen.getByText('Selection cleared.')).toBeInTheDocument();
  });

  it('clears selection after a pre-snap shift resolves', () => {
    render(<App initialGame={fixtureGame()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));

    fireEvent.click(screen.getByTitle('4,1'));
    fireEvent.click(screen.getByTitle('4,0'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it.each(['Cancel', 'Escape'])('asks before New Game and %s preserves the complete active match state', (dismissal) => {
    render(<App initialGame={fixtureGame({ score: { home: 7, away: 3 } })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByTitle('4,1'));

    openMenu();
    const historyBefore = screen.getByText(/move \d+ of \d+/i).textContent;
    const newGame = menuButton(/new game/i);
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
    expect(menuButton(/home human/i)).toHaveClass('active');
    expect(menuButton(/away human/i)).toHaveClass('active');
    expect(menuButton(/next move/i)).toBeDisabled();
    expect(newGame).toHaveFocus();
  });

  it('pauses computer automation while New Game confirmation is open', () => {
    vi.useFakeTimers();
    try {
      render(<App initialGame={fixtureGame({ phase: 'live' })} initialPlayers={{ home: 'computer', away: 'computer' }} />);
      fireEvent.click(menuButton(/play auto/i));
      fireEvent.click(menuButton(/new game/i));

      act(() => vi.advanceTimersByTime(500));

      expect(screen.getByRole('dialog', { name: /new game/i })).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: /final result/i })).not.toBeInTheDocument();
      expect(screen.getByText(/move 1 of 1/i)).toBeInTheDocument();
      expect(screen.getByText('Live')).toBeInTheDocument();

      fireEvent.click(within(screen.getByRole('dialog', { name: /new game/i })).getByRole('button', { name: /cancel/i }));
      closeMenu();
      act(() => vi.advanceTimersByTime(500));
      openMenu();
      expect(screen.queryByText(/move 1 of 1/i)).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('only resets an active match after New Game is confirmed', () => {
    render(<App initialGame={fixtureGame({ score: { home: 7, away: 3 } })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByTitle('4,1'));
    const newGame = menuButton(/new game/i);
    const rules = menuButton(/rules/i);
    fireEvent.click(rules);
    fireEvent.click(screen.getByRole('button', { name: 'Close rules' }));
    fireEvent.click(newGame);
    fireEvent.click(within(screen.getByRole('dialog', { name: /new game/i })).getByRole('button', { name: /^confirm$/i }));

    expect(screen.queryByRole('dialog', { name: 'New Game' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Game menu' })).not.toBeInTheDocument();
    expect(document.getElementById('chessball-app')).not.toHaveAttribute('inert');
    expect(screen.getByRole('heading', { name: 'Chessball' })).toHaveFocus();
    expect(screen.getByText('Press Start Game to play. Choose players and match options in the menu.')).toBeInTheDocument();
    openMenu();
    expect(screen.getByText(/move 1 of 1/i)).toBeInTheDocument();
    expect(menuButton(/home human/i)).toBeEnabled();
    expect(menuButton(/away computer/i)).toBeEnabled();
  });

  it('shows Start Game before a match and New Game once a match is active', () => {
    const { unmount } = render(<App />);

    expect(menuButton(/start game/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /new game/i })).not.toBeInTheDocument();

    unmount();
    render(<App initialGame={fixtureGame()} />);

    expect(menuButton(/new game/i)).toBeInTheDocument();
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
    expect(screen.getByText('Press Start Game to play. Choose players and match options in the menu.')).toBeInTheDocument();
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

    fireEvent.click(menuButton(/start game/i));

    expect(screen.getByRole('dialog', { name: /coin toss/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /flip coin/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();
    expect(screen.getAllByText(/coin toss/i).length).toBeGreaterThan(0);
  });

  it('resolves a coin toss in a modal before kickoff choices are available', () => {
    render(<App />);

    fireEvent.click(menuButton(/away human/i));
    fireEvent.click(menuButton(/start game/i));
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
    fireEvent.click(menuButton(/away human/i));
    fireEvent.click(menuButton(/start game/i));
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
    const tossed = applyAction(fixtureGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' });
    const kickoff = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'home', choice: 'receive' });

    render(<App initialGame={kickoff} />);

    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('Kickoff')).toBeInTheDocument();
    expect(screen.queryByText(/1 &/)).not.toBeInTheDocument();
    expect(within(screen.getByTitle('14,5')).getByText('K')).toBeInTheDocument();
    expect(screen.getByTitle('14,5')).not.toHaveClass('scrimmage-backward');
    expect(screen.getByTitle('8,5')).not.toHaveClass('first-down-backward');
    expect(screen.queryByText(/Line of scrimmage/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Line to gain/)).not.toBeInTheDocument();
  });

  it('keeps special-teams labels on the board and in selected-piece details after choosing to kick', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const tossed = applyAction(fixtureGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' });
    const kickoff = applyAction(tossed, { type: 'chooseKickoffChoice', team: 'home', choice: 'kick' });
    render(<App initialGame={kickoff} initialPlayers={{ home: 'human', away: 'human' }} />);
    const kicker = screen.getByTitle('9,5');
    expect(kicker).toHaveAccessibleName(/home K\b/);
    fireEvent.click(screen.getByRole('button', { name: 'Kickoff' }));
    expect(kicker).toHaveAccessibleName(/home K\b/);
    expect(within(kicker).getByText('K')).toBeInTheDocument();
    fireEvent.click(screen.getByTitle('15,5'));
    expect(kicker).toHaveAccessibleName(/home K\b/);
    expect(screen.getByTitle('18,2')).toHaveAccessibleName(/away KR\b/);
    fireEvent.click(kicker);
    expect(screen.getByText(/Kicker · 9,5/)).toBeInTheDocument();
    expect(screen.queryByText(/QB\/FS · 9,5/)).not.toBeInTheDocument();
  });

  it('shows match progress through total drives and current-quarter drives', () => {
    render(<App initialGame={fixtureGame({
      quarter: 3,
      drivesThisQuarter: { home: 1, away: 0 },
    })} />);

    expect(screen.getByText('Drive 9 of 16')).toBeInTheDocument();
    expect(screen.getByText('7 drives left')).toBeInTheDocument();
    expect(screen.getByText('Q3: Home 1/2, Away 0/2')).toBeInTheDocument();
  });

  it('shows a final result modal when the match ends', () => {
    render(<App initialGame={fixtureGame({
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

  it('keeps the required toss open but lets the final result close for review', () => {
    const { unmount } = render(<App />);
    fireEvent.click(menuButton(/start game/i));
    const coinDialog = screen.getByRole('dialog', { name: /coin toss/i });
    fireEvent.keyDown(coinDialog, { key: 'Escape' });
    fireEvent.click(coinDialog.parentElement as HTMLElement);
    expect(screen.getByRole('dialog', { name: /coin toss/i })).toBeInTheDocument();

    unmount();
    render(<App initialGame={fixtureGame({ phase: 'final' })} />);
    const finalDialog = screen.getByRole('dialog', { name: /final result/i });
    fireEvent.keyDown(finalDialog, { key: 'Escape' });
    fireEvent.click(finalDialog.parentElement as HTMLElement);
    expect(screen.queryByRole('dialog', { name: /final result/i })).not.toBeInTheDocument();
  });

  it('resets directly from the Final Result New Game action without stacking confirmation', () => {
    const finalGame = fixtureGame({
      phase: 'final',
      score: { home: 21, away: 17 },
      quarter: 4,
      drivesThisQuarter: { home: 2, away: 2 },
      drivesRemaining: { home: 0, away: 0 },
    });
    render(<App initialGame={finalGame} initialPlayers={{ home: 'computer', away: 'human' }} />);

    fireEvent.click(within(screen.getByRole('dialog', { name: /final result/i })).getByRole('button', { name: /new game/i }));

    expect(screen.queryByRole('dialog', { name: /final result/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Game menu' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /start game/i })).toBeInTheDocument();
    expect(screen.getByText('Press Start Game to play. Choose players and match options in the menu.')).toBeInTheDocument();
    const heading = screen.getByRole('heading', { name: 'Chessball' });
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(heading).toHaveFocus();
  });

  it('exposes catalog-backed formation selectors with strategic descriptions', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    expect(screen.getByRole('heading', { name: /formations/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();

    const offense = screen.getByRole('combobox', { name: 'Offense formation' });
    const defense = screen.getByRole('combobox', { name: 'Defense formation' });
    expect(within(within(offense).getByRole('group', { name: 'Normal play' })).getAllByRole('option').map((option) => (option as HTMLOptionElement).value))
      .toEqual(offensiveFormations.map(({ id }) => id));
    expect(within(defense).getAllByRole('option').map((option) => (option as HTMLOptionElement).value))
      .toEqual(defensiveFormations.map(({ id }) => id));
    expect(offense).toHaveAttribute('aria-describedby', 'offense-formation-description');
    expect(defense).toHaveAttribute('aria-describedby', 'defense-formation-description');
    expect(document.getElementById('offense-formation-description')).toHaveTextContent(offensiveFormations[0].description);
    expect(document.getElementById('defense-formation-description')).toHaveTextContent(defensiveFormations[0].description);
  });

  it('previews and confirms human offense and defense selections through the formation action path', () => {
    const { unmount } = render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    const offense = screen.getByRole('combobox', { name: 'Offense formation' });
    fireEvent.change(offense, { target: { value: 'trips' } });

    expect(offense).toHaveValue('trips');
    expect(document.getElementById('offense-formation-description')).toHaveTextContent(/overload one side/i);
    expect(offense.closest('.formation-picker')).toHaveTextContent('Pending');
    expect(screen.getByTitle('4,0')).toHaveAccessibleName(/home WR/i);
    expect(screen.getByTitle('4,1')).toHaveAccessibleName(/home WR/i);
    expect(screen.getByTitle('5,2')).toHaveAccessibleName(/home TE/i);
    expect(screen.getByTitle('3,5')).toHaveAccessibleName(/home QB/i);
    expect(screen.getByTitle('3,6')).toHaveAccessibleName(/home RB/i);
    expect(historyLog()).toHaveTextContent('Formation: Offense chose Trips.');
    expect(screen.queryByRole('button', { name: /snap/i })).not.toBeInTheDocument();

    closeMenu();
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));
    expect(screen.getByText('Offense formation confirmed.')).toBeInTheDocument();
    expect(offense).toBeDisabled();

    unmount();
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    const defense = screen.getByRole('combobox', { name: 'Defense formation' });
    fireEvent.change(defense, { target: { value: 'bear-front' } });

    expect(defense).toHaveValue('bear-front');
    expect(document.getElementById('defense-formation-description')).toHaveTextContent(/challenge the middle/i);
    expect(defense.closest('.formation-picker')).toHaveTextContent('Pending');
    expect(screen.getByTitle('6,3')).toHaveAccessibleName(/away DL/i);
    expect(screen.getByTitle('6,7')).toHaveAccessibleName(/away DL/i);
    expect(historyLog()).toHaveTextContent('Formation: Defense chose Bear Front.');
    expect(screen.queryByRole('heading', { name: /^command$/i })).not.toBeInTheDocument();

    closeMenu();
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));
    expect(screen.getByText('Defense formation confirmed.')).toBeInTheDocument();
    expect(defense).toBeDisabled();
  });

  it('groups game setup controls in the menu and keeps feedback below the field', () => {
    render(<App />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    openMenu();
    const setup = screen.getByRole('region', { name: /game setup/i });
    expect(setup.querySelector('.utility-control-row')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Game menu' })).toContainElement(setup);
    expect(setup.querySelector('.utility-status-row')).not.toBeInTheDocument();
    expect(within(setup).queryByRole('button', { name: /start game/i })).not.toBeInTheDocument();
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
    const { container } = render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    fireEvent.click(screen.getByTitle('4,1'));
    expect(container.querySelector('.square[aria-selected="true"]')).toHaveClass('is-selected');
    expect(container.querySelector('.square.legal')).toHaveClass('move-target');

    expect(cssText).toMatch(/:focus-visible\s*{[^}]*outline:\s*3px solid #fff[^}]*outline-offset:\s*3px/s);
    expect(cssText).toMatch(/\.square\.is-selected\s*{[^}]*outline:\s*3px double/s);
    expect(cssText).not.toMatch(/\.square\.is-selected\s*{[^}]*box-shadow:/s);
    expect(cssText).toMatch(/\.square\.move-target::after\s*{[^}]*border-radius:\s*50%/s);
    expect(cssText).toMatch(/\.square\.power-target::after\s*{[^}]*transform:[^}]*rotate\(45deg\)/s);
    expect(cssText).toMatch(/\.square\.kick-target::before\s*{[^}]*content:\s*"K"/s);
    expect(cssText).toMatch(/\.field\[aria-readonly="true"\] \.square\[tabindex="0"\]::before\s*{[^}]*content:\s*"RO"/s);
    expect(cssText).not.toMatch(/\.field\[aria-readonly="true"\] \.square\s*{[^}]*(?:background|background-image):/s);
    expect(cssText).toMatch(/\.field\[aria-readonly="true"\] \.square\s*{[^}]*outline:\s*1px dashed/s);
    expect(cssText).toMatch(/\.piece\s*{[^}]*z-index:\s*2;/s);
    expect(cssText).toMatch(/\.football-marker\s*{[^}]*z-index:\s*3;/s);
  });

  it('detects geometry changes on qualified pass and tackle target pieces', () => {
    const cssText = `
      .square.move-target, .square.pass-target .piece.home { inset: 1px; }
      .square.tackle-target .piece.selected { transform: scale(.8); }
      .square.pass-target .piece { left: 12px; }
      .square.pass-target::before { left: 1px; width: 10px; }
    `;

    expect(findTargetPieceGeometryViolations(cssText)).toEqual([
      '.square.pass-target .piece.home -> inset',
      '.square.tackle-target .piece.selected -> transform',
      '.square.pass-target .piece -> left',
    ]);
  });

  it('pass and tackle badges do not alter piece geometry', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(findTargetPieceGeometryViolations(cssText)).toEqual([]);
    expect(cssText).toMatch(/\.square\.pass-target::before\s*{[^}]*content:\s*"P"/s);
    expect(cssText).toMatch(/\.square\.tackle-target::before\s*{[^}]*content:\s*"T"/s);
    expect(cssText).toMatch(/\.square\.pass-target::before,[\s\S]*?z-index:\s*3;[^}]*left:\s*1px;[^}]*width:\s*10px;[^}]*height:\s*10px;/s);
  });

  it('keeps the read-only cue legible in the open bottom-right corner', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(cssText).toMatch(
      /\.field\[aria-readonly="true"\] \.square\[tabindex="0"\]::before\s*{[^}]*content:\s*"RO";[^}]*left:\s*auto;[^}]*top:\s*auto;[^}]*right:\s*1px;[^}]*bottom:\s*1px;[^}]*min-width:\s*16px;[^}]*width:\s*16px;[^}]*font-size:\s*0\.45rem;[^}]*line-height:\s*10px;/s,
    );
  });

  it('defines touch-safe controls, contained dialogs, and optional field scrolling', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

    expect(cssText).toMatch(/button\s*{[^}]*touch-action:\s*manipulation[^}]*-webkit-tap-highlight-color:/s);
    expect(cssText).toMatch(/\.formation-picker select\s*{[^}]*touch-action:\s*manipulation;[^}]*-webkit-tap-highlight-color:\s*rgba\(213,\s*166,\s*58,\s*0\.3\);/s);
    expect(cssText).toMatch(/\.rules-backdrop\s*{[^}]*overscroll-behavior:\s*contain/s);
    expect(cssText).toMatch(/\.rules-dialog\s*{[^}]*overscroll-behavior:\s*contain/s);
    expect(cssText).toMatch(/body\s*{[^}]*min-width:\s*0/s);
    expect(cssText).toMatch(/\.board-scroller\s*{[^}]*max-width:\s*100%[^}]*overflow-x:\s*auto[^}]*overscroll-behavior-inline:\s*contain[^}]*-webkit-overflow-scrolling:\s*touch/s);
    expect(cssText).not.toMatch(/\.field-wrap\s*{[^}]*overflow-x:\s*auto/s);
    expect(cssText).toMatch(/\.board-scroller\.is-enlarged \.field\s*{[^}]*min-width:\s*1068px/s);
    expect(cssText).toMatch(/:is\([\s\S]*?\.rules-close[\s\S]*?\)\s*{[^}]*min-width:\s*44px;[^}]*min-height:\s*44px/s);
    expect(cssText).toMatch(/\.square\s*{[^}]*min-inline-size:\s*0;/s);
  });

  it('scrolls only the board while keeping the field toolbar and setup utility outside the scroller', () => {
    const { container } = render(<App initialGame={fixtureGame()} />);
    const field = screen.getByRole('grid', { name: /chessball board/i });
    const scroller = field.parentElement;
    const fieldWrap = screen.getByRole('region', { name: /chessball field/i });
    const toolbar = container.querySelector<HTMLElement>('.field-toolbar');
    openMenu();
    const utility = screen.getByRole('region', { name: /game setup/i });

    expect(scroller).toHaveClass('board-scroller');
    expect(scroller).toContainElement(field);
    expect(fieldWrap).toContainElement(scroller);
    expect(toolbar?.parentElement).toBe(fieldWrap);
    expect(screen.getByRole('dialog', { name: 'Game menu' })).toContainElement(utility);
    expect(fieldWrap).not.toContainElement(utility);
    expect(scroller).not.toContainElement(toolbar);
    expect(scroller).not.toContainElement(utility);
  });

  it('keeps the field container class off playable gridcells', () => {
    const { container } = render(<App />);
    const field = screen.getByRole('grid', { name: /chessball board/i });
    const regularTurf = screen.getByTitle('2,0');

    expect(field).toHaveClass('field');
    expect(container.querySelectorAll('.field')).toHaveLength(1);
    expect(container.querySelector('[role="gridcell"].field')).not.toBeInTheDocument();
    expect(regularTurf).toHaveClass('field-zone');
    expect(screen.getByTitle('0,0')).toHaveClass('leftEndZone');
    expect(screen.getByTitle('23,0')).toHaveClass('rightEndZone');
  });

  it('renders history controls as one icon-only row with accessible labels', () => {
    render(<App initialGame={fixtureGame()} />);
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    openMenu();
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
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    const offense = screen.getByRole('combobox', { name: 'Offense formation' });
    fireEvent.change(offense, { target: { value: 'shotgun' } });
    fireEvent.change(offense, { target: { value: 'singleback' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm offense/i }));

    expect(offense).toHaveValue('singleback');
    expect(offense).toBeDisabled();
    expect(screen.getByText('Offense formation confirmed.')).toBeInTheDocument();
  });

  it('lets a human defense choose formation against a computer offense', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    expect(screen.getByRole('combobox', { name: 'Offense formation' })).toBeDisabled();
    const defense = screen.getByRole('combobox', { name: 'Defense formation' });
    expect(defense).toBeEnabled();

    fireEvent.change(defense, { target: { value: 'nickel' } });

    expect(screen.getByText('Defense formation: Nickel.')).toBeInTheDocument();
  });

  it('computer offense snaps after human defense confirms and is ready', async () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /confirm defense/i })).toBeEnabled();
    });
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));

    fireEvent.click(await screen.findByRole('button', { name: 'Ready for Snap' }));
    await waitFor(() => {
      expect(screen.getAllByText(/computer home: snap: home started the play/i).length).toBeGreaterThan(0);
    }, { timeout: 1800 });
  });

  it('waits for a human kick placement before a computer return', async () => {
    const kickoff = applyAction(
      applyAction(fixtureGame({ phase: 'coinToss' }), { type: 'coinToss', result: 'heads' }),
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
    expect(screen.queryByRole('combobox', { name: 'Defense formation' })).not.toBeInTheDocument();
  });

  it('computer returner moves onto a reachable loose kickoff even after chasing it last turn', () => {
    const base = fixtureGame();
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

  it('draws the line of scrimmage at the canonical spot boundary', () => {
    render(<App initialGame={fixtureGame()} />);

    expect(screen.getByTitle('6,5')).toHaveClass('scrimmage-forward');
  });

  it('draws the first-down marker at the same boundary as the scrimmage line', () => {
    render(<App initialGame={fixtureGame()} />);

    expect(screen.getByTitle('8,5')).toHaveClass('first-down-forward');
  });

  it('keeps static midfield markings even when the line of scrimmage is at midfield', () => {
    render(<App initialGame={fixtureGame({ lineOfScrimmage: 12, firstDownLine: 14 })} />);

    expect(screen.getByTitle('12,5')).toHaveClass('midfield');
    expect(screen.getByTitle('12,5')).toHaveClass('scrimmage-forward');
  });

  it('layers the blue scrimmage line above static yard lines', () => {
    const cssText = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');
    const scrimmageRule = cssText.match(/\.square\.scrimmage-forward\s*{\s*box-shadow:\s*([^;]+);/);

    expect(scrimmageRule?.[1].trim().startsWith('inset 4px 0 0 var(--blue)')).toBe(true);
  });

  it('requires a field-goal formation and both confirmations before Snap & Kick', () => {
    render(<App initialGame={fixtureGame({ lineOfScrimmage: 19 })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Offense formation' }), { target: { value: 'field-goal-unit' } });
    expect(screen.getByRole('combobox', { name: 'Offense formation' })).toHaveValue('field-goal-unit');
    expect(screen.getByText('Field goal unit')).toBeInTheDocument();
    expect(screen.getByText(/Field goal: 40 yards/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Snap & Kick' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Offense' }));
    expect(screen.getByRole('combobox', { name: 'Offense formation' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Defense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Snap & Kick' }));
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Field Goal' })).not.toBeInTheDocument();
  });

  it('groups offense formations in one selector and offers defensive choices for the selected unit', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    expect(screen.queryByRole('combobox', { name: 'Play type' })).not.toBeInTheDocument();
    const offense = screen.getByRole('combobox', { name: 'Offense formation' });
    expect(within(offense).getAllByRole('group').map(group => group.getAttribute('label'))).toEqual(['Normal play', 'Field goal', 'Punt']);
    fireEvent.change(offense, { target: { value: 'field-goal-unit' } });
    const defense = screen.getByRole('combobox', { name: 'Defense formation' });
    expect(within(defense).getAllByRole('option').map(option => option.textContent)).toEqual(['Field goal defense', 'Safe field goal defense']);
    fireEvent.change(defense, { target: { value: 'safe-field-goal-defense' } });
    expect(defense).toHaveValue('safe-field-goal-defense');
    fireEvent.change(offense, { target: { value: 'punt-unit' } });
    expect(defense).toHaveValue('punt-return-unit');
    expect(defense).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Confirm Defense' })).toBeEnabled();
    fireEvent.change(offense, { target: { value: 'shotgun' } });
    expect(offense).toHaveValue('shotgun');
    expect(defense).toBeEnabled();
  });

  it('chooses a fake after lining up and immediately highlights receivers for the holder', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);
    render(<App initialGame={fixtureGame({ lineOfScrimmage: 12 })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Offense formation' }), { target: { value: 'field-goal-unit' } });
    expect(screen.queryByRole('button', { name: 'Fake & Pass' })).not.toBeInTheDocument();
    confirmBothFormations();
    expect(screen.getByRole('button', { name: 'Snap & Kick' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Fake & Pass' }));
    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(/live.*home to act/i);
    expect(screen.getByTitle('10,5')).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTitle('10,5')).toHaveAccessibleName(/home H\b/);
    expect(screen.getByTitle('11,1')).toHaveClass('pass-target');
    expect(screen.getByTitle('11,3')).not.toHaveClass('pass-target');
    expect(screen.queryByRole('button', { name: 'Snap & Kick' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('11,1'));
    expect(screen.getByRole('status')).toHaveTextContent(/Completed pass: home hit WR/);
    expect(screen.getByRole('status')).toHaveTextContent(/away to act/i);
    expect(within(screen.getByTitle('11,1')).getByLabelText('Ball: controlled by WR')).toBeInTheDocument();
  });

  it('previews punt units and starts placement directly from Snap & Punt on any down', () => {
    render(<App initialGame={fixtureGame({ down: 2, lineOfScrimmage: 10 })} initialPlayers={{ home: 'human', away: 'human' }} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Offense formation' }), { target: { value: 'punt-unit' } });
    expect(screen.getByText('Punt return unit')).toBeInTheDocument();
    expect(screen.getByText(/Punt: 10–60 yards/)).toBeInTheDocument();
    expect(screen.getByTitle('6,5')).toHaveAccessibleName(/home P\b/);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: 'Snap & Punt' }));
    expect(screen.getByRole('status')).toHaveTextContent(/Kick Placement/);
    expect(screen.queryByRole('button', { name: 'Punt' })).not.toBeInTheDocument();
  });

  it('resets confirmations when changing play type without changing pre-snap yards to gain', () => {
    render(<App initialGame={fixtureGame({ lineOfScrimmage: 10 })} initialPlayers={{ home: 'human', away: 'human' }} />);
    const down = within(screen.getByText('Down').closest('.down-card') as HTMLElement);
    expect(down.getByText('1 & 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Defense' }));
    const choice = screen.getByRole('combobox', { name: 'Offense formation' });
    fireEvent.change(choice, { target: { value: 'punt-unit' } });
    expect(down.getByText('1 & 10')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm Defense' })).toBeEnabled();
    fireEvent.change(choice, { target: { value: 'field-goal-unit' } });
    expect(down.getByText('1 & 10')).toBeInTheDocument();
    fireEvent.change(choice, { target: { value: 'i-form' } });
    expect(screen.getByRole('combobox', { name: 'Offense formation' })).toBeInTheDocument();
    expect(screen.queryByText(/Landing range:/)).not.toBeInTheDocument();
  });

  it('identifies handoff targets by role and board coordinate', () => {
    const base = fixtureGame({ phase: 'live' });
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
    const afterHandoff = applyAction(fixtureGame({ phase: 'live' }), { type: 'handoff', fromId: 'home-qb', toId: 'home-rb' });
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
    render(<App initialGame={fixtureGame({
      phase: 'betweenDowns',
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown', team: 'home' } },
    })} />);

    expect(screen.getByRole('button', { name: /extra point/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /two-point try/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^next$/i })).toBeDisabled();
  });

  it('sets up a two-point formation from the conversion choice', () => {
    render(<App initialGame={fixtureGame({
      phase: 'betweenDowns',
      score: { home: 6, away: 0 },
      play: { actions: [], result: { type: 'touchdown', team: 'home' } },
    })} />);

    fireEvent.click(screen.getByRole('button', { name: /two-point try/i }));

    expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Formation')).toBeInTheDocument();
    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('2PT Try')).toBeInTheDocument();
    expect(historyLog()).toHaveTextContent(/two-point try: home lines up from the goal line/i);
  });

  it('labels marker yardage by the scrimmage square, not the painted edge', () => {
    render(<App initialGame={fixtureGame()} />);

    expect(screen.getByText('Line of scrimmage Home 20')).toBeInTheDocument();
    expect(screen.getByText('Line to gain Home 30')).toBeInTheDocument();
  });

  it('shows goal-to-go instead of a normal 10-yard distance at the goal line', () => {
    render(<App initialGame={fixtureGame({ lineOfScrimmage: 20 })} />);

    expect(within(screen.getByText('Down').closest('.down-card') as HTMLElement).getByText('1 & Goal')).toBeInTheDocument();
    expect(screen.queryByText('1 & 10')).not.toBeInTheDocument();
  });

  it('uses compact down-card text for kick returns', () => {
    render(<App initialGame={fixtureGame({ phase: 'kickReturn', ball: { kind: 'loose', coord: { x: 10, y: 5 } } })} />);

    expect(screen.getByText('Return')).toHaveClass('compact-status');
  });

  it('clears the selected piece when an action changes turns', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);

    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it('clears a pre-snap selected piece when the ball is snapped', () => {
    render(<App initialGame={fixtureGame({ formationConfirmed: { offense: true, defense: true } })} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByTitle('4,5'));
    expect(screen.getByText(/QB\/FS · 4,5/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /snap/i }));

    expect(screen.getByText('No piece selected.')).toBeInTheDocument();
  });

  it('only enables passing for the selected ball carrier', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.7);
    const ready = applyAction(
      applyAction(
        applyAction(fixtureGame(), { type: 'confirmFormation', side: 'offense' }),
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

    expect(within(historyLog()).getByText(/completed pass: home hit WR at 5,4/i)).toBeInTheDocument();
  });

  it('logs incomplete passes clearly in the event log', () => {
    const base = fixtureGame({ phase: 'live', formationConfirmed: { offense: true, defense: true } });
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

    expect(within(historyLog()).getByText(/incomplete pass/i)).toBeInTheDocument();
  });

  it('opens a rules and how-to-play panel', () => {
    render(<App initialGame={fixtureGame()} />);

    fireEvent.click(menuButton(/rules/i));

    expect(screen.getByRole('dialog', { name: /rules and how to play/i })).toBeInTheDocument();
    expect(screen.getByText(/a match starts with a coin toss and kickoff/i)).toBeInTheDocument();
    expect(screen.getByText(/after a touchdown, choose an extra point kick or a two-point try/i)).toBeInTheDocument();
    expect(screen.getByText(/touchdown worth 6 points/i)).toBeInTheDocument();
    expect(screen.getByText(/field goal measures through the ten-yard end zone to the posts at the back edge\/end line/i)).toBeInTheDocument();
    expect(screen.queryByText(/field goals roll 2d6 against distance to the goal line/i)).not.toBeInTheDocument();
    expect(screen.getByText(/incomplete passes are dead balls/i)).toBeInTheDocument();
    expect(screen.queryByText(/block,/i)).not.toBeInTheDocument();
  });

  it('portals Rules outside the isolated app, locks scrolling, traps focus, and restores its trigger', () => {
    document.body.style.overflow = 'clip';
    render(<App initialGame={fixtureGame()} />);
    const trigger = menuButton(/rules/i);
    trigger.focus();
    fireEvent.click(trigger);

    const dialog = screen.getByRole('dialog', { name: /rules and how to play/i });
    const appRoot = document.getElementById('chessball-app');
    const skipLink = screen.getByRole('link', { name: /skip to game workspace/i, hidden: true });
    const close = within(dialog).getByRole('button', { name: /close rules/i });
    expect(dialog.parentElement?.parentElement).toBe(document.body);
    expect(appRoot).toHaveAttribute('inert');
    expect(appRoot).toContainElement(skipLink);
    expect(skipLink.closest('[inert]')).toBe(appRoot);
    expect(appRoot).not.toContainElement(dialog);
    expect(document.body.style.overflow).toBe('hidden');
    expect(close).toHaveFocus();

    const rulesText = within(dialog).getByRole('region', { name: 'Rules text' });
    expect(rulesText).not.toContainElement(close);
    rulesText.focus();
    fireEvent.keyDown(rulesText, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(rulesText).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' });

    expect(screen.queryByRole('dialog', { name: /rules and how to play/i })).not.toBeInTheDocument();
    expect(appRoot).toHaveAttribute('inert');
    expect(trigger).toHaveFocus();
    closeMenu();
    expect(appRoot).not.toHaveAttribute('inert');
    expect(document.body.style.overflow).toBe('clip');
    document.body.style.overflow = '';
  });

  it('shows a football marker in the corner of the controlled ball square', () => {
    render(<App initialGame={fixtureGame()} />);

    const qbSquare = screen.getByTitle('4,5');

    expect(within(qbSquare).getByLabelText('Ball: controlled by QB')).toHaveClass('football-marker');
  });

  it('shows a football marker in the corner of a loose ball square', () => {
    render(<App initialGame={fixtureGame({ ball: { kind: 'loose', coord: { x: 12, y: 5 } } })} />);

    const ballSquare = screen.getByTitle('12,5');

    expect(within(ballSquare).getByLabelText('Ball: loose')).toHaveClass('football-marker');
  });

  it('keeps stopped turnover boards on the previous offensive role view without showing the next QB ball marker', () => {
    const base = fixtureGame();
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
    const base = fixtureGame();
    render(<App initialGame={{
      ...base,
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      ball: { kind: 'controlled', pieceId: 'away-qb' },
      play: { actions: [], result: { type: 'fieldGoal', team: 'home', good: false } },
    }} />);

    expect(within(screen.getByTitle('4,5')).getByText('K')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ball: controlled by QB')).not.toBeInTheDocument();
  });

  it('shows the last 2d6 roll as dice on the screen', () => {
    render(<App initialGame={fixtureGame({ playType: 'fieldGoal', formationConfirmed: { offense: true, defense: true } })} />);

    fireEvent.click(screen.getByRole('button', { name: /snap & kick/i }));

    const dice = screen.getByLabelText(/last dice roll/i);
    expect(dice).toBeInTheDocument();
    expect(within(dice).getAllByLabelText(/die [12]: [1-6]/i)).toHaveLength(2);
  });

  it('reports field-goal distance in yards to the posts with the roll target', () => {
    const base = fixtureGame({ playType: 'fieldGoal', lineOfScrimmage: 19, formationConfirmed: { offense: true, defense: true } });
    const state = {
      ...base,
      pieces: base.pieces.map((piece) => (piece.id === 'home-qb' ? { ...piece, coord: { x: 17, y: 5 } } : piece)),
      ball: { kind: 'controlled' as const, pieceId: 'home-qb' },
    };
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.6).mockReturnValueOnce(0.8);
    render(<App initialGame={state} initialPlayers={{ home: 'human', away: 'human' }} />);

    fireEvent.click(screen.getByRole('button', { name: /snap & kick/i }));

    expect(within(historyLog()).getByText(/35 yards to posts.*roll 9 vs 9/i)).toBeInTheDocument();
    expect(historyLog()).not.toHaveTextContent(/distance 7/i);
  });

  it('shows one clear tackle command for the selected defender only against the ball carrier', () => {
    const base = fixtureGame({ phase: 'live', turn: 'away' });
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
    const base = fixtureGame({ phase: 'live', turn: 'away' });
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
    const base = fixtureGame({ phase: 'live', turn: 'away' });
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

    expect(within(historyLog()).getByText(/tackle: away-wr1 stopped home-wr2/i)).toBeInTheDocument();
  });

  it('lets each team be set to human or computer', () => {
    render(<App />);

    expect(menuButton(/home human/i)).toHaveClass('active');
    expect(menuButton(/away computer/i)).toHaveClass('active');

    fireEvent.click(menuButton(/away human/i));

    expect(menuButton(/away human/i)).toHaveClass('active');
  });

  it('locks player selection after Start Game launches play', () => {
    render(<App />);

    fireEvent.click(menuButton(/away human/i));
    fireEvent.click(menuButton(/start game/i));
    fireEvent.click(screen.getByRole('button', { name: /flip coin/i }));
    fireEvent.click(screen.getByRole('button', { name: /receive/i }));

    expect(menuButton(/home computer/i)).toBeDisabled();
    expect(menuButton(/away computer/i)).toBeDisabled();
  });

  it('automatically resolves the coin toss for computer versus computer starts', () => {
    render(<App />);

    fireEvent.click(menuButton(/home computer/i));
    fireEvent.click(menuButton(/start game/i));

    expect(screen.queryByRole('dialog', { name: /coin toss/i })).not.toBeInTheDocument();
    expect(within(screen.getByText('Phase').closest('.down-card') as HTMLElement).getByText('Kickoff')).toBeInTheDocument();
    expect(historyLog()).toHaveTextContent(/coin toss:/i);
    expect(menuButton(/home human/i)).toBeDisabled();
    expect(menuButton(/away human/i)).toBeDisabled();
  });

  it('shows friendly phase names instead of raw state values', () => {
    render(<App initialGame={fixtureGame()} />);

    expect(screen.getByText('Formation')).toBeInTheDocument();
    expect(within(screen.getByText('Phase').closest('.phase-card') as HTMLElement).queryByText('formation')).not.toBeInTheDocument();
  });

  it('logs every successful action and can step through board history', () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'human', away: 'human' }} />);
    confirmBothFormations();
    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    const log = historyLog();
    expect(within(log).getByText(/snap: home started the play/i)).toBeInTheDocument();
    expect(within(log).getByText(/move: home qb moved to 3,6/i)).toBeInTheDocument();

    expect(within(screen.getByTitle('3,6')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();

    fireEvent.click(menuButton(/previous move/i));

    expect(screen.getAllByText(/viewing history/i).length).toBeGreaterThan(0);
    expect(within(screen.getByTitle('4,5')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /snap/i })).toBeDisabled();

    fireEvent.click(menuButton(/next move/i));

    expect(within(screen.getByTitle('3,6')).getByLabelText('Ball: controlled by QB')).toBeInTheDocument();
  });

  it('lets a computer-controlled team make a basic automatic move', async () => {
    render(<App initialGame={fixtureGame({ formationConfirmed: { offense: true, defense: true } })} />);

    fireEvent.click(screen.getByRole('button', { name: /snap/i }));
    fireEvent.click(screen.getByTitle('4,5'));
    fireEvent.click(screen.getByTitle('3,6'));

    await waitFor(() => {
      expect(screen.getAllByText(/computer away:/i).length).toBeGreaterThan(0);
    });
  });

  it('requires play before starting a computer versus computer loop and then allows pausing', async () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);

    await new Promise((resolve) => setTimeout(resolve, 320));

    expect(screen.queryByText(/computer home:/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause auto/i })).not.toBeInTheDocument();

    fireEvent.click(menuButton(/play auto/i));

    expect(menuButton(/pause auto/i)).toBeInTheDocument();
    expect(menuButton(/home human/i)).toBeDisabled();
    expect(menuButton(/away human/i)).toBeDisabled();

    closeMenu();
    await waitFor(() => {
      expect(screen.getAllByText(/computer home:/i).length).toBeGreaterThan(0);
    });

    fireEvent.click(menuButton(/pause auto/i));
    expect(menuButton(/resume auto/i)).toBeInTheDocument();
  });

  it('hides computer loop controls unless both players are computer', () => {
    render(<App />);

    expect(screen.queryByRole('button', { name: /pause auto/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /play auto/i })).not.toBeInTheDocument();

    fireEvent.click(menuButton(/home computer/i));

    expect(menuButton(/play auto/i)).toBeInTheDocument();
  });

  it('keeps every catalog formation uniformly reachable by computer selection', () => {
    const players = { home: 'computer', away: 'computer' } as const;
    const offenseIds: string[] = [];
    const defenseIds: string[] = [];

    for (let seed = 0; seed < offensiveFormations.length; seed += 1) {
      let game = fixtureGame();
      const offense = chooseComputerAction(game, generateLegalActions(game), seed, players);
      expect(offense).toMatchObject({ type: 'chooseFormation', side: 'offense' });
      if (!offense || offense.type !== 'chooseFormation') throw new Error('Expected computer offense formation');
      offenseIds.push(offense.formationId);
      game = applyAction(game, offense);

      const confirmOffense = chooseComputerAction(game, generateLegalActions(game), seed, players);
      expect(confirmOffense).toEqual({ type: 'confirmFormation', side: 'offense' });
      if (!confirmOffense) throw new Error('Expected computer offense confirmation');
      game = applyAction(game, confirmOffense);

      const defense = chooseComputerAction(game, generateLegalActions(game), seed, players);
      expect(defense).toMatchObject({ type: 'chooseFormation', side: 'defense' });
      if (!defense || defense.type !== 'chooseFormation') throw new Error('Expected computer defense formation');
      defenseIds.push(defense.formationId);
    }

    expect(offenseIds.sort()).toEqual(offensiveFormations.map(({ id }) => id).sort());
    expect(defenseIds.sort()).toEqual(defensiveFormations.map(({ id }) => id).sort());
  });

  it('computer offense does not open live play with an immediate pass', async () => {
    render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'human' }} />);

    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: 'Defense formation' })).toBeEnabled();
    });
    fireEvent.change(screen.getByRole('combobox', { name: 'Defense formation' }), { target: { value: 'nickel' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm defense/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Ready for Snap' }));

    await waitFor(() => {
      expect(screen.getAllByText(/computer home: (move|handoff):/i).length).toBeGreaterThan(0);
    }, { timeout: 3000 });

    const logText = historyLog().textContent ?? '';
    expect(logText).not.toMatch(/Computer home: Pass:.*Computer home: Snap:/i);
  });

  it('computer versus computer does not open with a pass immediately followed by a tackle', () => {
    vi.useFakeTimers();
    const view = render(<App initialGame={fixtureGame()} initialPlayers={{ home: 'computer', away: 'computer' }} />);
    try {
      fireEvent.click(menuButton(/play auto/i));
      for (let transition = 0; transition < 7; transition += 1) {
        act(() => vi.advanceTimersByTime(COMPUTER_ACTION_DELAY_MS));
      }

      const logText = historyLog().textContent ?? '';
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
    render(<App initialGame={fixtureGame({
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      score: { home: 0, away: 6 },
      play: { actions: [], result: { type: 'touchdown', team: 'away' } },
    })} />);

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/extra point/i), { timeout: 1200 });
    expect(historyLog()).toHaveTextContent(/computer away: kick: away-qb attempted extra point/i);
  });

  it('computer-controlled offense attempts a field goal on fourth down in range', async () => {
    render(<App initialGame={fixtureGame({
      phase: 'formation',
      possession: 'away',
      direction: -1,
      turn: 'away',
      down: 4,
      lineOfScrimmage: 6,
      firstDownLine: 4,
    })} />);

    await waitFor(() => expect(screen.getByRole('combobox', { name: 'Offense formation' })).toHaveValue('field-goal-unit'));
    fireEvent.click(screen.getByRole('button', { name: 'Confirm Defense' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/field goal (good|missed)/i), { timeout: 2000 });
    expect(historyLog()).toHaveTextContent(/computer away: kick: away-qb attempted field goal/i);
  });

  it('uses canonical field-goal geometry at the computer fourth-down range boundary', () => {
    const players = { home: 'computer', away: 'computer' } as const;
    const at = (x: number) => {
      const base = fixtureGame({ phase: 'formation', possession: 'home', direction: 1, turn: 'home', down: 4, lineOfScrimmage: x });
      return {
        ...base,
        pieces: base.pieces.map((piece) => (piece.id === 'home-qb' ? { ...piece, coord: { x, y: 5 } } : piece)),
        ball: { kind: 'controlled' as const, pieceId: 'home-qb' },
      };
    };
    const inRange = at(17);
    const outOfRange = at(16);

    expect(chooseComputerAction(inRange, generateLegalActions(inRange), 0, players)).toEqual({
      type: 'choosePlayType',
      playType: 'fieldGoal',
    });
    expect(chooseComputerAction(outOfRange, generateLegalActions(outOfRange), 0, players)).not.toMatchObject({
      type: 'choosePlayType',
      playType: 'fieldGoal',
    });
  });
});


describe('opening and conversion regressions', () => {
  it.each([[0.1, 'Home'], [0.9, 'Away']] as const)('resolves an automatic coin toss with random value %s', (value, winner) => {
    vi.spyOn(Math, 'random').mockReturnValue(value);
    render(<App initialPlayers={{ home: 'computer', away: 'computer' }} />);
    fireEvent.click(menuButton('Start Game'));
    expect(historyLog()).toHaveTextContent(`${winner} won automatically and chose to receive`);
  });

  it('disables field goals and punts during a live two-point try', () => {
    let game = applyAction(fixtureGame({ phase: 'betweenDowns', play: { actions: [], result: { type: 'touchdown', team: 'home' } } }), { type: 'startTwoPointTry', team: 'home' });
    game = applyAction(game, { type: 'confirmFormation', side: 'offense' });
    game = applyAction(game, { type: 'confirmFormation', side: 'defense' });
    game = applyAction(game, { type: 'snap' });
    render(<App initialGame={game} initialPlayers={{ home: 'human', away: 'human' }} />);
    expect(screen.queryByRole('button', { name: 'Field Goal' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Punt' })).not.toBeInTheDocument();
  });
});

it('switches field size without changing the game or selection', () => {
  const { container } = render(<App initialGame={fixtureGame({ phase: 'live' })} initialPlayers={{ home: 'human', away: 'human' }} />);
  fireEvent.click(screen.getByTitle('4,5'));
  const before = screen.getByRole('grid').innerHTML;
  expect(screen.queryByRole('button', { name: 'Fit field' })).not.toBeInTheDocument();
  fireEvent.click(menuButton('Settings'));
  const settings = screen.getByRole('dialog', { name: 'Settings' });
  const fit = screen.getByRole('button', { name: 'Fit field' });
  const large = screen.getByRole('button', { name: 'Larger squares' });
  expect(settings).toContainElement(fit);
  expect(settings).toContainElement(large);
  expect(fit).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(large);
  expect(large).toHaveAttribute('aria-pressed', 'true');
  expect(container.querySelector('.board-scroller')).toHaveClass('is-enlarged');
  expect(screen.getByRole('grid').innerHTML).toBe(before);
  expect(screen.getByText('Swipe or scroll across the field.')).toBeInTheDocument();
  fireEvent.click(fit);
  expect(container.querySelector('.board-scroller')).not.toHaveClass('is-enlarged');
  expect(screen.getByRole('grid').innerHTML).toBe(before);
  fireEvent.click(screen.getByRole('button', { name: 'Close settings' }));
  expect(menuButton('Previous move')).toBeDisabled();
});
