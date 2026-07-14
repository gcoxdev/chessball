# Chessball Playbook and Presentation Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six simple formation choices, make field goals match the depicted posts, stop pass/tackle badges from deforming pieces, and give Chessball a stronger accessible sports wordmark without changing the core game.

**Architecture:** Keep formations and kick math canonical in the engine, with `main.tsx` consuming those APIs for both people and computer players. Keep the UI changes native and small: a labelled `select`, associated description, and CSS-only presentation fixes. Add a separate expansion-audit definition/runner so the historical 2026-07-11 audit remains reproducible while the new catalog receives deterministic, catalog-weighted balance screening.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, Testing Library, jsdom, CSS, existing matched-pair simulator, headless Chromium/CDP.

---

**Design spec:** `docs/superpowers/specs/2026-07-14-chessball-playbook-polish-design.md`

**Required implementation skills:** `@superpowers:test-driven-development` for every behavior change, `@frontend-design` for the wordmark/selector styling, `@web-design-guidelines` for the final UI review, and `@superpowers:verification-before-completion` before any completion claim.

**Scope guard:** Preserve the fixed roster, current formation IDs/coordinates, shifts, movement, passing, tackling, downs, drive count, home/away opportunity, and extra-point rules. Do not add personnel packages, formation bonuses, custom formations, dependencies, downloaded fonts, or NFL/team marks.

## File map

- Modify `src/engine/types.ts`: require a strategic description on every formation.
- Modify `src/engine/rules.ts`: add six canonical presets and export the one canonical field-goal calculation.
- Modify `src/engine/chessball.test.ts`: formation geometry/projection and field-goal regression coverage.
- Modify `src/main.tsx`: native formation selectors, descriptions, canonical kick policy, clarified rules/results, and wordmark hook.
- Modify `src/app.test.tsx`: selector, computer reachability, field-goal copy/policy, badge geometry, and wordmark accessibility/source-contract tests.
- Modify `src/styles.css`: selector/description styles, non-deforming overlays, and athletic wordmark.
- Create `src/engine/formation-expansion-audit.ts`: expansion comparison matrix, pooling, thresholds, and deterministic artifact builder.
- Create `src/engine/formation-expansion-audit.test.ts`: matrix, weighting, classification, and serialization tests.
- Create `scripts/run-formation-expansion-audit.ts`: execute the 7,200-pair approved screen.
- Create `docs/audits/data/2026-07-14-formation-expansion-audit.json`: machine-readable balance evidence.
- Create `docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json`: reproducible rendered measurements and assertions.
- Modify `docs/audits/2026-07-11-chessball-quality-audit.md`: dated addendum for the new rules/UI/balance evidence.
- Modify `chessball-quality-plan/main.md`, `chessball-quality-plan/strategic-depth/main.md`, `chessball-quality-plan/plausible-football/main.md`, and `chessball-quality-plan/ui-quality/main.md`: close only the branches supported by final evidence.

### Task 1: Canonical expanded formation catalog

**Files:**
- Modify: `src/engine/types.ts:45-50`
- Modify: `src/engine/rules.ts:28-140`
- Modify: `src/engine/chessball.test.ts:82-150`

- [ ] **Step 1: Write failing catalog and geometry tests**

Import `offensiveFormations` and `defensiveFormations`. Assert the exact ordered IDs below, that every entry has a non-empty description, and that each preset has exactly the eleven IDs `qb,rb,fb,wr1,wr2,te,ol1,ol2,ol3,ol4,ol5` with unique coordinates and source rows from 0 through 10.

```ts
expect(offensiveFormations.map(({ id }) => id)).toEqual([
  'i-form', 'shotgun', 'singleback', 'pistol', 'trips', 'power',
]);
expect(defensiveFormations.map(({ id }) => id)).toEqual([
  '4-3', 'nickel', 'goal-line', 'bear-front', 'pressure', 'deep-shell',
]);
```

For each new ID, choose it from line-of-scrimmage values 2, 5, and 21 with both possession directions. Assert 22 unique in-bounds projected coordinates, offense on its legal side, defense on its legal side, and no change to the existing six presets' exact position objects.

Protect the canonical source tables directly by reducing each coordinate to `"x,y"` and asserting these exact maps:

```ts
expect(sourcePositions(offensiveFormations, ['pistol', 'trips', 'power'])).toEqual({
  pistol: { qb: '-2,5', rb: '-3,5', fb: '-1,6', wr1: '-1,1', wr2: '-1,9', te: '0,8', ol1: '0,3', ol2: '0,4', ol3: '0,5', ol4: '0,6', ol5: '0,7' },
  trips: { qb: '-2,5', rb: '-2,6', fb: '-1,4', wr1: '-1,0', wr2: '-1,1', te: '0,2', ol1: '0,3', ol2: '0,4', ol3: '0,5', ol4: '0,6', ol5: '0,7' },
  power: { qb: '-1,5', rb: '-2,5', fb: '-1,7', wr1: '-1,2', wr2: '-1,9', te: '0,8', ol1: '0,3', ol2: '0,4', ol3: '0,5', ol4: '0,6', ol5: '0,7' },
});
expect(sourcePositions(defensiveFormations, ['bear-front', 'pressure', 'deep-shell'])).toEqual({
  'bear-front': { qb: '5,5', rb: '2,5', fb: '2,2', wr1: '4,0', wr2: '4,10', te: '2,8', ol1: '1,3', ol2: '1,4', ol3: '1,5', ol4: '1,6', ol5: '1,7' },
  pressure: { qb: '5,5', rb: '2,5', fb: '1,2', wr1: '4,0', wr2: '4,10', te: '1,8', ol1: '1,3', ol2: '1,4', ol3: '1,5', ol4: '1,6', ol5: '2,7' },
  'deep-shell': { qb: '6,5', rb: '2,4', fb: '2,6', wr1: '5,0', wr2: '5,10', te: '5,8', ol1: '1,3', ol2: '1,4', ol3: '1,5', ol4: '1,6', ol5: '2,7' },
});
```

- [ ] **Step 2: Run the engine test and confirm RED**

Run: `npm test -- src/engine/chessball.test.ts`

Expected: FAIL because the formation catalogs still contain three presets per side and `Formation` has no `description`.

- [ ] **Step 3: Add the required formation metadata and presets**

Add `description: string` to `Formation`. Preserve existing IDs, order, and coordinates, and give every formation concise copy:

```ts
const descriptions = {
  'i-form': 'Balanced backs behind the quarterback for central runs and play-action.',
  shotgun: 'A deeper quarterback with wider spacing for passing development.',
  singleback: 'One deep runner with balanced receivers and flexible lanes.',
  pistol: 'A deep quarterback and trailing runner keep run and pass threats balanced.',
  trips: 'Three eligible receivers overload one side and concede the weak side.',
  power: 'Compact backs and tight end favor blocking lanes and short-yardage play.',
  '4-3': 'Balanced front and second level against either runs or passes.',
  nickel: 'Wider coverage spacing trades some strength near the line.',
  'goal-line': 'A dense front protects short yardage and concedes deeper space.',
  'bear-front': 'Five compressed linemen challenge the middle and leave wider edges.',
  pressure: 'An outside linebacker and strong safety crowd the line at deep-coverage risk.',
  'deep-shell': 'Deep, wide coverage protects passes and softens underneath run support.',
};
```

Use the exact coordinate tables in the approved design spec. Do not add special projection cases or role changes.

- [ ] **Step 4: Run focused and simulator formation tests**

Run: `npm test -- src/engine/chessball.test.ts src/engine/simulator.test.ts`

Expected: PASS, including existing coordinates, projection, planned formation selection, and state invariants.

- [ ] **Step 5: Commit the formation catalog**

```bash
git add src/engine/types.ts src/engine/rules.ts src/engine/chessball.test.ts
git commit -m "feat(engine): expand formation catalog"
```

### Task 2: Accessible formation selectors and descriptions

**Files:**
- Modify: `src/main.tsx:412-435,850-890,1164-1190`
- Modify: `src/app.test.tsx:470-500,1400-1440,1540-1590`
- Modify: `src/styles.css:220-310`

- [ ] **Step 1: Replace button assumptions with failing selector tests**

Render a human-vs-human formation state and assert labelled `Offense formation` and `Defense formation` comboboxes, six ordered options in each, and `aria-describedby` pointing to the active strategic description. Change offense to `Trips` and assert the board preview, selected value, description, Pending status, and history action update through the existing action path; then confirm and assert the selector is disabled. Repeat the preview/confirm contract for defense.

```ts
const offense = screen.getByRole('combobox', { name: /offense formation/i });
fireEvent.change(offense, { target: { value: 'trips' } });
expect(offense).toHaveValue('trips');
expect(screen.getByText(/overload one side/i)).toHaveAttribute('id', offense.getAttribute('aria-describedby'));
expect(screen.getByTitle('4,0')).toHaveTextContent('WR');
```

Add a computer test that samples enough deterministic `chooseComputerFormationAction` cycles to observe all six offense and all six defense IDs; it must fail on any hard-coded three-item assumption.

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `npm test -- src/app.test.tsx`

Expected: FAIL because formation choices are buttons and descriptions are not rendered.

- [ ] **Step 3: Implement the native selector**

Give each picker a stable slug and render a real label, select, associated description, existing status, and separate confirmation:

```tsx
const slug = title.toLowerCase();
const active = formations.find(({ id }) => id === activeId) ?? formations[0];
return <div className="formation-picker">
  <label htmlFor={`${slug}-formation`}>
    {title} <em className={`formation-status ${confirmed ? 'confirmed' : 'pending'}`}>
      {confirmed ? 'Confirmed' : 'Pending'}
    </em>
  </label>
  <select
    id={`${slug}-formation`}
    aria-describedby={`${slug}-formation-description`}
    value={active.id}
    disabled={disabled}
    onChange={(event) => onChoose(formations.find(({ id }) => id === event.target.value) ?? active)}
  >
    {formations.map((formation) => <option key={formation.id} value={formation.id}>{formation.name}</option>)}
  </select>
  <p id={`${slug}-formation-description`} className="formation-description">{active.description}</p>
  <button type="button" className="confirm-button" disabled={disabled || confirmed} onClick={onConfirm}>
    Confirm {title}
  </button>
</div>;
```

Keep the catalog-based modulo selection for computer teams so all six entries remain uniformly reachable. Remove `.formation-options` button styling and style `select` with the established panel palette, visible focus, `min-height: 44px`, and no custom combobox behavior.

- [ ] **Step 4: Run focused UI tests and confirm GREEN**

Run: `npm test -- src/app.test.tsx`

Expected: PASS with selector previews, confirmation, descriptions, computer reachability, and existing formation flow intact.

- [ ] **Step 5: Commit the selector slice**

```bash
git add src/main.tsx src/app.test.tsx src/styles.css
git commit -m "feat(ui): add formation selectors"
```

### Task 3: Canonical field-goal distance and clear feedback

**Files:**
- Modify: `src/engine/rules.ts:970-995,1215-1232`
- Modify: `src/engine/chessball.test.ts:784-850`
- Modify: `src/main.tsx:12-20,710-730,1105-1115,1285-1298,1388-1475`
- Modify: `src/app.test.tsx:1040-1070,1290-1330,1550-1580`

- [ ] **Step 1: Write failing canonical-calculation tests**

Export `fieldGoalAttempt` and test both directions at representative coordinates. The return shape is columns, yards, and required target:

```ts
expect(fieldGoalAttempt(1, { x: 17, y: 5 })).toEqual({ distance: 7, yards: 35, required: 9 });
expect(fieldGoalAttempt(-1, { x: 6, y: 5 })).toEqual({ distance: 7, yards: 35, required: 9 });
expect(fieldGoalAttempt(1, { x: 21, y: 5 })).toEqual({ distance: 3, yards: 15, required: 7 });
expect(fieldGoalAttempt(-1, { x: 2, y: 5 })).toEqual({ distance: 3, yards: 15, required: 7 });
```

Update the resolution regression at `x=17`: total 8 now misses and total 9 makes. Assert the result retains `distance: 7` columns. Preserve tests for miss spot, scoring, drive owner, kickoff, and extra-point behavior.

- [ ] **Step 2: Write failing UI policy/copy tests**

Assert the Rules dialog says field goals measure through the ten-yard end zone to the posts at the back edge and distinguishes the touchdown goal line. Exercise a result and expect `35 yards to posts` plus `roll 9 vs 9`. Add adjacent fourth-down computer states on opposite sides of the `required <= 10` policy boundary so the test proves the UI policy consumes the canonical helper.

- [ ] **Step 3: Run focused tests and confirm RED**

Run: `npm test -- src/engine/chessball.test.ts src/app.test.tsx`

Expected: FAIL on the old near-goal-line distance and ambiguous generic distance copy.

- [ ] **Step 4: Implement one engine-owned calculation**

```ts
export function fieldGoalAttempt(direction: Direction, ballAt: Coord) {
  const distance = Math.max(0, direction === 1 ? WIDTH - ballAt.x : ballAt.x + 1);
  return { distance, yards: distance * 5, required: 5 + Math.ceil(distance / 2) };
}
```

Use this helper inside kick resolution and import it into `main.tsx` for computer attempt policy. Delete `fieldGoalTargetNumber`; no second formula may remain. Keep `RollResult.distance` in columns, but use a field-goal-specific formatter for user text so other roll distances remain unchanged.

- [ ] **Step 5: Run focused and full tests**

Run: `npm test -- src/engine/chessball.test.ts src/app.test.tsx`

Expected: PASS, including mirrored distances and unchanged extra points/turnover flow.

- [ ] **Step 6: Commit the field-goal slice**

```bash
git add src/engine/rules.ts src/engine/chessball.test.ts src/main.tsx src/app.test.tsx
git commit -m "fix(rules): measure kicks to goalposts"
```

### Task 4: Non-deforming pass and tackle badges

**Files:**
- Modify: `src/app.test.tsx:820-842`
- Modify: `src/styles.css:840-890`

- [ ] **Step 1: Reverse the existing failing geometry assertion**

Keep the `P`/`T`, bottom-left, size, and z-index assertions. Replace the assertion that expects a special `12px` left inset with invariants that the base piece stays `inset: 3px` and no pass/tackle piece selector changes geometry.

```ts
expect(cssText).toMatch(/\.piece\s*{[^}]*inset:\s*3px;/s);
expect(cssText).not.toMatch(/\.square:is\(\.pass-target, \.tackle-target\) \.piece/);
expect(cssText).not.toMatch(/(?:pass-target|tackle-target)[^{]*\.piece\s*{[^}]*(?:inset|width|height|transform|padding|margin)\s*:/s);
```

- [ ] **Step 2: Run the badge test and confirm RED**

Run: `npm test -- src/app.test.tsx -t "labels pass and tackle targets"`

Expected: FAIL because the current selector applies `inset: 3px 3px 3px 12px`.

- [ ] **Step 3: Remove only the deforming rule**

Delete `.square:is(.pass-target, .tackle-target) .piece`. Retain the existing pseudo-element overlay, role text, football marker, pointer behavior, and accessible square descriptions.

- [ ] **Step 4: Run the focused test and commit**

Run: `npm test -- src/app.test.tsx -t "labels pass and tackle targets"`

Expected: PASS.

```bash
git add src/app.test.tsx src/styles.css
git commit -m "fix(ui): overlay action badges"
```

### Task 5: Accessible athletic Chessball wordmark

**Files:**
- Modify: `src/main.tsx:380-400`
- Modify: `src/app.test.tsx:132-150,680-705`
- Modify: `src/styles.css:35-90`
- Create: `docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json` with the pre-wordmark baseline section

- [ ] **Step 1: Write failing semantic and CSS-contract tests**

Assert exactly one level-one heading with accessible name `Chessball`, existing `id="game-workspace"` and `tabIndex=-1`, plus a presentation-only wordmark class. Assert CSS uses only local/system fonts, includes condensed/heavy treatment, a small forward skew, gold highlight/dark depth, restrained pseudo-element accent, and an explicit `:focus-visible` rule. Assert no external `@font-face`, NFL shield/stars asset, or image URL is introduced.

Before changing the heading or its CSS, build and serve the current Task 4 commit at 1440×900 and record the `.score-strip` and heading bounding rectangles as the pre-wordmark baseline in the rendered-verification artifact. Task 8 must compare its final measurements against this recorded commit, viewport, browser version, and rectangles rather than relying on memory or the original audit.

- [ ] **Step 2: Run the UI test and confirm RED**

Run: `npm test -- src/app.test.tsx -t "Chessball"`

Expected: FAIL because the heading still uses the generic global serif rule.

- [ ] **Step 3: Implement the CSS-only wordmark**

Add `className="chessball-wordmark"` to the unchanged literal heading. Use a compact system stack such as `Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Narrow", sans-serif`, `font-stretch: condensed`, uppercase display treatment, a slight `skewX(-7deg)`, gold edge/highlight, dark shadow, and one pseudo-element speed/lace accent with `aria-hidden` behavior inherent to CSS decoration. Preserve the score-strip grid and skip-navigation focus target.

- [ ] **Step 4: Run UI tests and commit**

Run: `npm test -- src/app.test.tsx`

Expected: PASS with the accessible name and focus lifecycle unchanged.

```bash
git add src/main.tsx src/app.test.tsx src/styles.css docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json
git commit -m "style(ui): energize Chessball wordmark"
```

### Task 6: Deterministic formation-expansion audit tooling

**Files:**
- Create: `src/engine/formation-expansion-audit.ts`
- Create: `src/engine/formation-expansion-audit.test.ts`
- Create: `scripts/run-formation-expansion-audit.ts`

- [ ] **Step 1: Write failing comparison-matrix tests**

Assert six closest-comparator definitions and all six new-vs-new pairs, each expanded across the opposite catalog imported from `offensiveFormations`/`defensiveFormations`. Require 12 comparison groups, six cells and 600 pairs per group, 72 unique non-overlapping 100-pair seed blocks, and exactly 7,200 requested pairs. Verify each cell changes only the side under comparison while holding the opposing formation equal.

```ts
expect(groups).toHaveLength(12);
expect(groups.every(({ cells }) => cells.length === 6 && cells.every(({ pairs }) => pairs === 100))).toBe(true);
expect(groups.reduce((sum, group) => sum + group.cells.reduce((n, cell) => n + cell.pairs, 0), 0)).toBe(7_200);
```

- [ ] **Step 2: Write failing pooling/classification tests**

Build synthetic cell reports and assert that pooling concatenates all 600 `skillGap.pairEffects` and score-delta effects, runs deterministic 10,000-resample 95% bootstraps, requires an interval excluding the neutral value plus either five win-share points or one score point, and requires at least four of six cell means in the pooled direction. Assert a cell interval including neutral or favoring the comparison is recorded as a credible counter. Sub-threshold, split-direction, and incomplete/stalled inputs must not be labelled broad dominance.

- [ ] **Step 3: Run the new test and confirm RED**

Run: `npm test -- src/engine/formation-expansion-audit.test.ts`

Expected: FAIL because the expansion audit module does not exist.

- [ ] **Step 4: Implement pure experiment and artifact helpers**

Reuse `pairedBootstrapInterval`, `MatchedAuditReport`, and the canonical formation catalogs. Export immutable comparison/cell types, `formationExpansionExperiments()`, `summarizeFormationComparison()`, `canonicalFormationExpansionArtifact()`, and deterministic serialization. Give the artifact a new schema such as `chessball-formation-expansion-audit-v1`; do not alter the historical `chessball-formation-audit-v2` artifact or runner.

- [ ] **Step 5: Implement the thin runner**

For every cell, call `runMatchedAudit` with both policies `heuristic`, 5,000 max actions, the cell's fixed home/away one-factor plans, and `{ samples: 10_000, confidence: .95 }`. Pool only completed pairs and preserve status/anomaly counts, exact seed ranges, per-cell intervals, practical thresholds, direction count, credible-counter result, and final classification in JSON.

- [ ] **Step 6: Run focused audit-tool tests and commit**

Run: `npm test -- src/engine/formation-expansion-audit.test.ts src/engine/formation-audit-runner.test.ts src/engine/simulator.test.ts`

Expected: PASS; the historical audit test remains unchanged and green.

```bash
git add src/engine/formation-expansion-audit.ts src/engine/formation-expansion-audit.test.ts scripts/run-formation-expansion-audit.ts
git commit -m "test(balance): add formation expansion audit"
```

### Task 7: Run the balance gate and tune only if required

**Files:**
- Create: `docs/audits/data/2026-07-14-formation-expansion-audit.json`
- Modify if the approved gate requires tuning: `src/engine/rules.ts`
- Modify if tuning occurs: `src/engine/chessball.test.ts`
- Modify: `docs/audits/2026-07-11-chessball-quality-audit.md`

- [ ] **Step 1: Run the complete deterministic audit**

Run: `npm exec vite-node scripts/run-formation-expansion-audit.ts`

Expected: valid JSON for 12 groups, 72 cells, 7,200 completed pairs, 14,400 completed games, zero stalls/crashes/anomalies, and the documented schema/thresholds. Preserve stdout as the dated audit artifact only after validating those counts.

- [ ] **Step 2: Validate and interpret the gate mechanically**

Parse the JSON, verify every seed range is disjoint, every group is uniformly weighted, and recompute group totals/classifications from cell data. A favorable matchup is acceptable. Coordinate tuning is required only when the pooled practical/statistical lead persists, at least four cells agree, and no opposing cell is a credible counter.

- [ ] **Step 3: If required, tune coordinates through a bounded TDD loop**

When—and only when—the artifact marks broad dominance without a counter, first add a failing geometry expectation for the intended tradeoff, then adjust only that preset's coordinates. Re-run `src/engine/chessball.test.ts` and the affected 600-pair group before rerunning the full audit. Do not change movement, dice, roster, or formation bonuses. Stop after three coordinate iterations and request design guidance if the gate still fails.

- [ ] **Step 4: Record the evidence and limitations**

Add a dated audit addendum summarizing completion counts, every pooled comparison/classification, any tuned coordinates, and the fixed-policy limitation. Do not claim causal proof or exact NFL calibration.

- [ ] **Step 5: Verify the artifact and commit**

Run: `npm test -- src/engine/formation-expansion-audit.test.ts src/engine/chessball.test.ts && npm run build`

Expected: PASS and successful production build.

```bash
git add src/engine/rules.ts src/engine/chessball.test.ts docs/audits/data/2026-07-14-formation-expansion-audit.json docs/audits/2026-07-11-chessball-quality-audit.md
git commit -m "docs(balance): record formation screen"
```

### Task 8: Rendered verification and goal-tree closeout

**Files:**
- Modify: `docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json`
- Modify: `docs/audits/2026-07-11-chessball-quality-audit.md`
- Modify: `chessball-quality-plan/main.md`
- Modify: `chessball-quality-plan/strategic-depth/main.md`
- Modify: `chessball-quality-plan/plausible-football/main.md`
- Modify: `chessball-quality-plan/ui-quality/main.md`

- [ ] **Step 1: Run the complete automated verification**

Run: `npm test -- --run`

Expected: all test files and tests PASS.

Run: `npm run build`

Expected: TypeScript and Vite production build PASS.

Run: `git diff --check`

Expected: no whitespace errors.

- [ ] **Step 2: Start the built app and inspect three viewports**

Use an unused localhost port and headless Chromium/CDP against the production build at 1440×900, 390×844, and 320×568. Record exact commands, browser/CDP versions, ports, and viewport metrics.

- [ ] **Step 3: Verify the approved rendered contracts**

At each viewport, assert document `scrollWidth === clientWidth`; the score-strip height is not enlarged by the wordmark; the literal heading remains legible, focused through Skip to game workspace, and at least 4.5:1 against its background; both selects expose labels, descriptions, six options, 44px touch height, preview, disabled-after-confirm behavior, and no control crowding. In a controlled pass/tackle state, compare the computed `.piece` bounding box before and after target classes and require identical inset, width, height, and centered role text while `P`/`T` stays bottom-left and the ball stays top-right. Capture screenshots for inspection but discard image data after recording structured measurements.

- [ ] **Step 4: Write durable rendered evidence**

Store commands, structured assertions, measurements, screenshot disposition, and limitations in `docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json`. Add a concise dated addendum to the human audit. Do not claim physical-device, screen-reader, or physical-board playtesting that did not occur.

- [ ] **Step 5: Close only verified goal branches**

Mark Strategic Depth, Plausible Football, and UI Quality `done` only if their formation, kick-distance, and rendered gates passed. Add short 2026-07-14 activity entries citing the new audit artifact, final test count, build, and Chromium results. Mark the root `done` only when all required children are done.

- [ ] **Step 6: Commit the verified closeout**

```bash
git add docs/audits/2026-07-11-chessball-quality-audit.md docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json chessball-quality-plan/main.md chessball-quality-plan/strategic-depth/main.md chessball-quality-plan/plausible-football/main.md chessball-quality-plan/ui-quality/main.md
git commit -m "docs: verify playbook polish"
```

- [ ] **Step 7: Run completion verification from a clean tree**

Run: `git status --short && npm test -- --run && npm run build && git diff ec70bc9..HEAD --check`

Expected: clean status, all tests PASS, build PASS, and no diff-check errors. Then use `@superpowers:requesting-code-review`; address any Critical or Important findings and rerun this step before using `@superpowers:finishing-a-development-branch`.
