# Chessball Accessibility Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Chessball UI keyboard-, assistive-technology-, touch-, and mobile-friendly while preserving game rules, pointer behavior, desktop identity, and the intended player skill gap.

**Architecture:** Keep `App` as the game-state orchestrator, but extract a focused `AccessibleBoard` and reusable body-portal `Modal`. Put board coordinate movement and square-description derivation in pure helpers so keyboard semantics are testable without duplicating the action path. Keep dialog visibility in `App`, derive one concise live status there, and make responsive behavior a CSS/container concern rather than a gameplay variant.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, jsdom, CSS, headless Chromium/CDP for rendered verification.

---

**Design spec:** `docs/superpowers/specs/2026-07-12-chessball-accessibility-remediation-design.md`

**Scope guard:** Do not change `src/engine/**`, simulation probabilities, formations, match length, dependencies, or physical-game rules. Do not redesign the palette/artwork or create a reduced mobile mode.

## File map

- Create `src/ui/board-accessibility.ts`: pure coordinate clamping, initial-focus selection, and square accessible-name/state helpers.
- Create `src/ui/board-accessibility.test.ts`: unit coverage for board movement, focus fallback, and descriptions.
- Create `src/ui/AccessibleBoard.tsx`: roving focus, keyboard activation, grid semantics, nearest-only focus scrolling, and existing square artwork rendering callbacks.
- Create `src/ui/Modal.tsx`: body portal, initial focus, Tab trap, inert/scroll lifecycle, Escape policy, and focus restoration.
- Modify `src/main.tsx`: integrate extracted UI units, semantic regions/announcer, confirmation state, history semantics, and stable workspace fallback focus.
- Modify `src/app.test.tsx`: interaction/regression tests for board, dialogs, confirmation, landmarks, announcements, and history mode.
- Modify `src/styles.css`: visible focus, non-color board states, modal containment, robust touch targets, and viewport-safe mobile scrolling.
- Modify `docs/audits/2026-07-11-chessball-quality-audit.md`: record remediated findings and remaining manual limitations.
- Modify `chessball-quality-plan/main.md` and `chessball-quality-plan/ui-quality/**/main.md`: close the implemented UI branches with verification evidence.

### Task 1: Pure board accessibility model

**Files:**
- Create: `src/ui/board-accessibility.ts`
- Create: `src/ui/board-accessibility.test.ts`

- [ ] **Step 1: Write failing coordinate-navigation tests**

Cover all four arrows, clamping at every edge, unchanged coordinates for unrelated keys, and dimensions supplied by the board rather than hard-coded 24×11 values.

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `npm test -- src/ui/board-accessibility.test.ts`

Expected: FAIL because the helper module does not exist.

- [ ] **Step 3: Implement the minimal pure movement helper**

Return a new valid coordinate for arrow keys, clamp without wrapping, and return the input coordinate for non-arrow keys.

- [ ] **Step 4: Add failing focus-choice and description tests**

Assert deterministic focus priority (selected piece → visible ball → first square), preservation of a still-valid focused coordinate, and fallback when dimensions invalidate it. Assert square names include coordinate plus applicable occupant team/active role, ball state, selected, legal move, power move, pass target, tackle target, kick placement, and read-only history phrases while omitting inapplicable phrases.

- [ ] **Step 5: Implement the minimal description/focus helpers and confirm GREEN**

Keep the helper input explicit and UI-only; reuse engine types and pass already-derived booleans rather than importing game mutation logic.

Run: `npm test -- src/ui/board-accessibility.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the helper slice**

```bash
git add src/ui/board-accessibility.ts src/ui/board-accessibility.test.ts
git commit -m "feat(ui): model accessible board state"
```

### Task 2: Roving keyboard board with pointer parity

**Files:**
- Create: `src/ui/AccessibleBoard.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`

- [ ] **Step 1: Write failing integration tests for the grid contract**

Assert the grid has an accessible board label; exactly one of 264 cells has `tabIndex=0`; initial focus follows selected-piece/ball/first-square priority; ordinary rerenders preserve the active coordinate; and every other cell has `tabIndex=-1`.

- [ ] **Step 2: Add failing keyboard and parity tests**

Focus the active cell, send arrows, and assert DOM focus moves with edge clamping. Assert Enter and Space call the same existing square behavior as click by checking selection/move outcomes, including `preventDefault` for Space. Retain the current pointer tests unchanged.

- [ ] **Step 3: Add failing semantic-state tests**

Assert accessible names and `aria-selected`/descriptive state for selected, legal, power, pass, tackle, kick-placement, ball, and history-read-only examples. Assert history cells remain focusable but click/Enter/Space cannot append history or change play state.

- [ ] **Step 4: Run the UI tests and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL on the new roving/semantic assertions.

- [ ] **Step 5: Extract and integrate `AccessibleBoard` minimally**

Move only board rendering responsibilities out of `App`. Pass the display game, dimensions, legal/selected/target/read-only derivations, artwork render callbacks, and the existing `onSquareClick`. Store the active coordinate inside the board, keep a coordinate-to-button ref map, update focus on arrows, and call `scrollIntoView({ block: 'nearest', inline: 'nearest' })` only after keyboard focus movement. Do not scroll on click or ordinary rerender.

- [ ] **Step 6: Confirm focused and full UI GREEN**

Run: `npm test -- src/ui/board-accessibility.test.ts src/app.test.tsx`

Expected: PASS with legacy click behavior intact.

- [ ] **Step 7: Commit the accessible board**

```bash
git add src/ui/AccessibleBoard.tsx src/main.tsx src/app.test.tsx
git commit -m "feat(ui): add keyboard board navigation"
```

### Task 3: Shared portal modal and focus lifecycle

**Files:**
- Create: `src/ui/Modal.tsx`
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing modal lifecycle tests**

For Rules, assert the dialog is a child of `document.body` rather than the app root, the app root becomes inert, body scroll is contained/locked, initial focus lands on Close, Tab and Shift+Tab wrap within the dialog, Escape closes it, and focus returns to the Rules trigger.

- [ ] **Step 2: Write failing flow-gate and fallback tests**

Assert Escape/backdrop do not close coin toss or final result. Remove or replace a remembered trigger before closing a dismissible dialog and assert focus falls back to the programmatically focusable workspace heading.

- [ ] **Step 3: Run the modal tests and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because dialogs are inline and lack focus management.

- [ ] **Step 4: Implement reusable `Modal`**

Use `createPortal(..., document.body)`. Accept labelled title/content, `dismissible`, `initialFocusRef`, fallback focus, and `onClose`. On mount remember the active trigger, inert the stable app root, lock body overflow, focus the initial target or first focusable element, and trap Tab. On cleanup restore inert/overflow exactly and focus the trigger if connected, otherwise fallback. Escape invokes close only when dismissible; backdrop clicks never dismiss required dialogs.

- [ ] **Step 5: Migrate Rules, coin toss, and final result**

Keep existing copy/action behavior. Give the app shell a stable root ref/identifier and the workspace heading `tabIndex={-1}`. Rules is dismissible; coin/final are not.

- [ ] **Step 6: Add modal overscroll styling and confirm GREEN**

Add `overscroll-behavior: contain` to modal/backdrop scrolling surfaces without changing the visual treatment.

Run: `npm test -- src/app.test.tsx`

Expected: PASS.

- [ ] **Step 7: Commit the modal foundation**

```bash
git add src/ui/Modal.tsx src/main.tsx src/app.test.tsx src/styles.css
git commit -m "feat(ui): manage modal focus and isolation"
```

### Task 4: Safe New Game behavior

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`

- [ ] **Step 1: Replace the obsolete direct-reset test with failing safety cases**

Assert utility-bar New Game opens a dismissible confirmation whenever `phase !== 'pregame'`; Cancel/Escape preserve score, history, selection, and phase; Confirm resets to editable pregame. Assert pregame behavior remains direct where applicable. Construct a final-state fixture and assert final-result New Game resets directly with no nested confirmation.

- [ ] **Step 2: Run the focused test file and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because utility New Game currently calls `reset` directly.

- [ ] **Step 3: Implement confirmation state through shared `Modal`**

Keep confirmation ownership in `App`. The utility button opens confirmation for every non-pregame phase; only its Confirm action calls `reset`. Keep the final dialog wired directly to `reset`.

- [ ] **Step 4: Confirm GREEN and commit**

Run: `npm test -- src/app.test.tsx`

Expected: PASS.

```bash
git add src/main.tsx src/app.test.tsx
git commit -m "fix(ui): confirm active game resets"
```

### Task 5: Navigation, announcements, and read-only history

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/app.test.tsx`
- Modify: `src/styles.css`

- [ ] **Step 1: Write failing navigation/landmark tests**

Assert the first keyboard-relevant link is “Skip to game workspace,” its target is the focusable workspace heading, and the board, controls, setup, and event/history areas have clear headings or region names without duplicate `main` landmarks.

- [ ] **Step 2: Write failing status-announcement tests**

Assert exactly one dedicated `aria-live="polite"`/status region exposes concise primary message plus phase/turn, score, and history position changes. Assert the event list retains `role="log"` and is not copied wholesale into the status region.

- [ ] **Step 3: Write failing read-only history tests**

After creating history and stepping back, assert visible “Viewing history”/“Read-only” copy and programmatic read-only state on the board/region; controls remain disabled, inspection navigation remains available, and returning Latest restores actionable state.

- [ ] **Step 4: Run the UI tests and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL on missing skip target, announcer, and read-only semantics.

- [ ] **Step 5: Implement semantic structure and concise derived status**

Add the skip link before the app shell content, a visually unobtrusive workspace heading tied to the target id/ref, named control/history regions, and one live node whose text is derived from current primary message, phase/turn, scores, and history index. Keep event log entries only in the existing log.

- [ ] **Step 6: Implement visible/programmatic history state**

Add explicit read-only copy plus `aria-readonly`/described-by semantics to the board/history context. Ensure existing mutation guards remain the source of truth.

- [ ] **Step 7: Add skip-link/read-only styling, confirm GREEN, and commit**

Run: `npm test -- src/app.test.tsx`

Expected: PASS.

```bash
git add src/main.tsx src/app.test.tsx src/styles.css
git commit -m "feat(ui): announce navigation and history state"
```

### Task 6: Focus, non-color cues, touch targets, and mobile overflow

**Files:**
- Modify: `src/styles.css`
- Modify: `src/app.test.tsx`

- [ ] **Step 1: Add failing static CSS contract tests**

Assert a high-contrast global `:focus-visible` rule; separate selected-versus-focus treatment; shape/text/pseudo-element distinctions for legal, power, target, and read-only cells; `touch-action: manipulation` and intentional tap highlight; primary controls approaching 44px; modal overscroll containment; and mobile styles that remove page overflow while retaining an 860px board inside a viewport-width horizontal scroller.

- [ ] **Step 2: Run UI tests and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL on the new CSS contracts.

- [ ] **Step 3: Implement the smallest styling changes**

Preserve palette, field artwork, desktop proportions, manual field-scroll position, and ordinary document flow. Apply touch sizing to primary controls without forcing 44px cells or visually bloating compact field artwork. Ensure `.field-wrap` itself does not create page-level width and use the board state classes/attributes for non-color cues.

- [ ] **Step 4: Confirm CSS/UI GREEN and production build**

Run: `npm test -- src/app.test.tsx && npm run build`

Expected: PASS and successful Vite build.

- [ ] **Step 5: Commit responsive styling**

```bash
git add src/styles.css src/app.test.tsx
git commit -m "fix(ui): improve touch and mobile accessibility"
```

### Task 7: Rendered verification and documentation closeout

**Files:**
- Modify: `docs/audits/2026-07-11-chessball-quality-audit.md`
- Modify: `chessball-quality-plan/main.md`
- Modify: `chessball-quality-plan/ui-quality/main.md`
- Modify: `chessball-quality-plan/ui-quality/accessible-board/main.md`
- Modify: `chessball-quality-plan/ui-quality/modal-navigation/main.md`
- Modify: `chessball-quality-plan/ui-quality/responsive-safety/main.md`

- [ ] **Step 1: Run the complete automated verification**

Run: `npm test`

Expected: all test files pass, including the existing 291-test baseline plus new accessibility tests.

Run: `npm run build`

Expected: TypeScript and Vite production build succeed.

- [ ] **Step 2: Start the built app for rendered checks**

Run the existing Vite preview/dev workflow on an unused local port and control headless Chromium through CDP, matching the prior audit method. Record the exact port, browser version, and viewport metrics used.

- [ ] **Step 3: Verify desktop at 1440×900**

Use keyboard only to take the skip link into the workspace, Tab once into the board, arrow across cells, activate with Enter/Space, open/close Rules, exercise forward/reverse focus wrapping, confirm Escape and restoration, and verify coin/final flow gates resist Escape. Use pointer activation to confirm existing selection/action behavior. Check visible focus and distinct selected/legal/power/target/read-only cues.

- [ ] **Step 4: Verify mobile at 390×844**

Measure `document.documentElement.scrollWidth <= clientWidth`; verify the field scroller is viewport-width and horizontally scrollable; manually change its `scrollLeft`, trigger an unrelated state render, and assert the value is preserved. Arrow focus to an off-screen square and assert only the field scroller moves enough to reveal it (nearest alignment), while pointer activation does not recenter. Measure primary control heights, test modal scroll containment, and confirm focus remains useful after close.

- [ ] **Step 5: Update audit and goal evidence**

Mark each implemented audit finding remediated with automated/rendered evidence. Document that actual assistive-technology certification and physical-device touch testing remain manual limitations; do not claim them. Close the three UI child goals and parent/root only to the extent their checked acceptance criteria are genuinely satisfied.

- [ ] **Step 6: Review the diff for scope and hygiene**

Run: `git diff --check`

Run: `git status --short`

Inspect: `git diff --stat main...HEAD` and `git diff main...HEAD -- src docs/audits chessball-quality-plan`

Expected: no engine, simulation, dependency, generated build, or unrelated Graphify changes.

- [ ] **Step 7: Commit closeout documentation**

```bash
git add docs/audits/2026-07-11-chessball-quality-audit.md chessball-quality-plan
git commit -m "docs: close accessibility remediation"
```

- [ ] **Step 8: Apply completion workflows**

Use `superpowers:verification-before-completion`, then `superpowers:requesting-code-review`. Address substantive findings and rerun affected checks. When all checks are fresh and clean, use `superpowers:finishing-a-development-branch` to present integration choices; do not merge or delete the worktree without user direction.
