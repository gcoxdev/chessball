# Chessball Accessibility Remediation Design

## Purpose

Implement the high-confidence P1/P2 UI findings from the Chessball quality audit without changing gameplay, engine APIs, or the established visual identity. The result should make board play practical with a keyboard, communicate state to assistive technology, manage dialogs correctly, improve touch/mobile use, and protect match history from accidental deletion.

## Scope

### Accessible Board Interaction

- Treat the 24×11 board as one keyboard entry point using a roving `tabIndex`.
- Tab enters the board once at the active square. Arrow keys move focus within board bounds; Enter and Space invoke the same square behavior as pointer activation.
- Preserve the currently focused coordinate across ordinary game-state renders when still valid. Choose a deterministic initial focus: selected piece, ball square, or first field square in that order.
- Give every square an accessible name containing its coordinate, occupant team/role when present, ball state, and actionable state such as legal move, power move, pass target, tackle target, kick placement, selected, or read-only history.
- Expose selection and action state with appropriate ARIA attributes/descriptions. Keep existing pointer and touch click behavior unchanged.
- Add visible non-color cues for selected, legal, power, target, and read-only states.

### Modal and Navigation Accessibility

- Introduce one reusable portal-based modal shared by Rules, coin toss, final result, and New Game confirmation. Render modal content through `createPortal` into `document.body`, outside the application root, so the application root can safely become inert without disabling the dialog.
- On open: remember the triggering element, set initial focus, trap Tab/Shift+Tab, mark the application root inert, and contain modal scrolling.
- On close: restore focus to the trigger when it still exists. Escape closes dismissible Rules and New Game confirmation dialogs; coin toss and final result remain required flow gates.
- Add a visible-on-focus skip link to the main game workspace.
- Add semantic headings/labels for the game workspace, board, controls, and event/history regions without visually redesigning the page.
- Keep the event log's implicit `role="log"` behavior. Add one dedicated polite status region for important primary message, phase/turn, score, and history-position changes; avoid duplicating every event-log entry.

### Responsive Layout and Action Safety

- Preserve the desktop board layout and complete board information.
- At 390×844, keep the board in a viewport-width horizontal scroll container with no page-level horizontal overflow. Preserve the board container's manual scroll position across ordinary renders. When roving keyboard focus moves to an off-screen square, scroll only enough to reveal that square using nearest block/inline alignment; pointer activation and unrelated state updates must not recenter the board. Do not make status/actions sticky, reposition major panels, or replace the board with a reduced game mode in this pass.
- Increase primary interactive controls toward a 44px robust touch-target heuristic, add `touch-action: manipulation`, and choose an intentional tap-highlight treatment.
- Add confirmation when the utility-bar New Game action would abandon an in-progress match (`phase` is neither `pregame` nor `final`) or nontrivial navigable history. Pregame reset/start remains direct. The final-result dialog's explicit New Game action remains direct because the match is complete and the dialog itself is the required end-of-match decision; do not stack a confirmation dialog on the final dialog.
- Expose history mode visibly and programmatically as read-only; board cells may remain navigable for inspection but must not appear actionable.
- Retain useful focus after responsive scrolling and dialog interactions.

## Component Boundaries

The current `main.tsx` is large, so implementation should extract only focused units required by this work:

- `AccessibleBoard` or equivalent: roving focus, keyboard movement, square naming/state, and board semantics.
- `Modal` or a focused modal hook/component: body-level portal, focus lifecycle, trap, inert application root, dismissal policy, and restoration.
- Small pure helpers for accessible square descriptions and focus-coordinate movement.
- Existing game orchestration, action resolution, computer policy, and descriptive copy remain in `main.tsx` unless a direct accessibility dependency requires moving them.

Do not introduce a component framework or new runtime dependency for these behaviors.

## State and Data Flow

- Board focus coordinate is UI-only state and never enters `GameState` or history snapshots.
- Keyboard activation delegates to the existing square-click/action path so pointer and keyboard rules cannot diverge.
- Accessible square descriptions are derived from the current game, legal actions, piece, ball, target mode, selection, and history state.
- Modal open state remains owned by `App`; the shared modal unit receives dismissal policy, initial-focus target, label/title association, and close callback.
- The status announcer receives concise derived text rather than the full event list.

## Error and Edge Handling

- Arrow keys clamp at board edges; they do not wrap.
- Focus falls back deterministically if the focused square disappears from a rendered board state.
- History viewing remains non-mutating for pointer and keyboard activation.
- Required flow-gate dialogs cannot be dismissed through Escape or backdrop interaction.
- If a remembered trigger is removed, focus returns to the workspace heading through a stable ref. The heading must be programmatically focusable with `tabIndex={-1}` without entering normal Tab order.
- New Game confirmation is bypassed only when no active match/history would be lost.

## Styling

- Add global `:focus-visible` treatment with sufficient contrast.
- Keep selection outlines visually distinct from keyboard focus.
- Add shape/text indicators or pseudo-elements so legal/power/target states are not color-only.
- Use modal overscroll containment and background interaction prevention.
- Preserve the existing palette, typography, field artwork, and desktop proportions.
- Mobile changes should reduce disorientation around the horizontally scrolling board without hiding squares or game state.

## Testing

Use strict test-driven development for each behavior:

- One board Tab stop; arrow-key movement; edge clamping; Enter/Space activation.
- Accessible square names and selected/legal/power/ball/read-only states.
- Pointer behavior parity and history mutation prevention.
- Modal initial focus, Tab trap, Shift+Tab trap, Escape policy, inert background, scroll containment, and restoration.
- Skip link/landmark/headings and status-announcement behavior without log duplication.
- Active-match New Game confirmation, cancellation, confirmation, and direct pregame reset behavior.
- Direct final-result New Game behavior without a nested confirmation.
- Visible/read-only history semantics and non-color indicators.
- CSS/static checks for focus visibility, touch action, touch targets, and modal containment.
- Full existing test suite and production build.
- Rendered Chromium verification at 1440×900 and 390×844 with keyboard and pointer interaction.
- At 390×844, verify no page-level horizontal overflow, preserved manual board scroll, and nearest-only scrolling when arrow navigation moves focus off-screen.

## Deliverables

- Accessible board and modal/navigation implementation.
- Responsive/touch/action-safety styling changes.
- Automated regression tests.
- Updated audit and UI goal-tree status describing fixed and deferred findings.

## Exclusions

- Game rules, engine, simulations, probabilities, or formation balance changes.
- Dependency upgrades.
- Physical component production or printable rule aids.
- A visual redesign, new component framework, or alternate mobile game mode.
- Automated screen-reader certification; announcement behavior will be covered through semantics/tests and documented manual limitations.
