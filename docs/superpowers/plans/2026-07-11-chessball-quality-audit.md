# Chessball Quality Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add reproducible evidence for home/away fairness, player-policy skill gaps, tactic usage, and football outcomes; audit the rules, tabletop viability, and UI; then fix only defects demonstrated by that evidence.

**Architecture:** Keep `rules.ts` as the single gameplay implementation. Extend the seeded simulator so each team can use an independently selected policy and each run exposes structured event counts. Add a separate audit module for matched pairs, confidence intervals, and decision thresholds, leaving aggregate mechanics out of the UI. Produce the qualitative audits as documentation; UI code remains unchanged.

**Tech Stack:** TypeScript 5, Vitest, Vite/Vite Node, React 19, Testing Library, seeded headless simulation.

**Design spec:** `docs/superpowers/specs/2026-07-11-chessball-quality-audit-design.md`

---

## File Map

- Modify `src/engine/simulator.ts`: per-team policy selection, explicit opening and formation conditions, contextual opportunity/action counts, completed-only balance aggregation.
- Modify `src/engine/simulator.test.ts`: test every simulator behavior before implementation.
- Create `src/engine/audit.ts`: paired-run orchestration, deterministic paired-bootstrap confidence intervals, practical-effect classification, and structured audit report types.
- Create `src/engine/audit.test.ts`: deterministic unit tests for pairing and evidence decisions.
- Modify `src/simulate.ts`: validated CLI options, matchup/audit modes, transparent incomplete-game output, non-zero failure status.
- Create `src/simulate.test.ts`: CLI option parsing and exit-decision tests through exported pure helpers.
- Create `docs/audits/2026-07-11-chessball-quality-audit.md`: final evidence, rules review, tabletop findings, UI findings, dependency note, and follow-up recommendations.
- Modify `chessball-quality-plan/**/main.md`: keep goal status and audit outcomes aligned.
- Conditionally modify `src/engine/rules.ts` and `src/engine/chessball.test.ts`: only for rule defects confirmed during the audit.

### Task 1: Select Policies Independently for Home and Away

**Files:**
- Modify: `src/engine/simulator.ts:12-128, 140-200, 534-548`
- Test: `src/engine/simulator.test.ts`

- [x] **Step 1: Write the failing mixed-policy test**

Add a test that runs a deterministic game with different team policies and verifies the summary records both policies:

```ts
it('runs home and away with independently selected policies', () => {
  const result = simulateGame({
    seed: 42,
    policies: { home: 'heuristic', away: 'random' },
    maxActions: 100,
  });

  expect(result.summary.policies).toEqual({ home: 'heuristic', away: 'random' });
});
```

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/engine/simulator.test.ts -t "independently selected"`

Expected: TypeScript/test failure because `policies` and `summary.policies` do not exist.

- [x] **Step 3: Add a team-policy type and compatibility normalization**

Implement:

```ts
export type TeamPolicies = Record<Team, SimulationPolicy>;

type SimulateGameOptions = {
  seed: number;
  policy?: SimulationPolicy;
  policies?: TeamPolicies;
  maxActions?: number;
  repeatLimit?: number;
};

function normalizePolicies(options: SimulateGameOptions): TeamPolicies {
  const fallback = options.policy ?? 'heuristic';
  return options.policies ?? { home: fallback, away: fallback };
}
```

Store `policies` in `SimulationSummary`. Pass `policies[state.turn]` into `chooseSimulationAction`; coin toss and formation protocol actions continue using the policy of the team currently making the decision.

- [x] **Step 4: Preserve the existing single-policy contract**

Add an assertion to the repeatability test that `simulateGame({ policy: 'random' })` normalizes both sides to random.

- [x] **Step 5: Run simulator tests and verify GREEN**

Run: `npm test -- src/engine/simulator.test.ts`

Expected: all simulator tests pass.

- [x] **Step 6: Commit**

```bash
git add src/engine/simulator.ts src/engine/simulator.test.ts
git commit -m "feat(sim): support team policy matchups"
```

### Task 2: Make Starting Conditions Explicit and Reproducible

**Files:**
- Modify: `src/engine/simulator.ts:107-200, 534-665`
- Test: `src/engine/simulator.test.ts`

- [x] **Step 1: Write failing tests for forced opening conditions**

```ts
it('reproduces an explicit opening receiver without changing the seed', () => {
  const homeReceives = simulateGame({
    seed: 77,
    policy: 'heuristic',
    opening: { coinWinner: 'home', choice: 'receive' },
    maxActions: 30,
  });
  const awayReceives = simulateGame({
    seed: 77,
    policy: 'heuristic',
    opening: { coinWinner: 'away', choice: 'receive' },
    maxActions: 30,
  });

  expect(homeReceives.summary.openingReceiver).toBe('home');
  expect(awayReceives.summary.openingReceiver).toBe('away');
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/engine/simulator.test.ts -t "explicit opening receiver"`

Expected: failure because `opening` and `openingReceiver` do not exist.

- [x] **Step 3: Implement explicit opening resolution**

Add:

```ts
export type SimulationOpening = {
  coinWinner: Team;
  choice: 'kick' | 'receive';
};

export type SimulationFormationPlan = Record<Team, {
  offense: string;
  defense: string;
}>;
```

When a coin-toss or kickoff-choice protocol action is selected, use the supplied opening value instead of a random result. When a formation plan is supplied, choose the named formation for the team currently acting on offense or defense. Continue consuming the same protocol steps so subsequent gameplay begins at the same action index. Record opening winner, kicker, receiver, each team's fixed attack direction, and selected formations in the summary.

Home always attacks right and away always attacks left under the existing symmetric rules. Do not add an independent direction override that could create invalid coordinate semantics. Direction is isolated by swapping policies/team identities within a pair and by same-policy home/away pairs; assert this convention in tests and document it in reports.

- [x] **Step 4: Add invalid-opening protection**

Test and implement validation that rejects a missing winner, unsupported choice, unknown formation ID, or side-mismatched formation before simulation starts. Keep validation at the exported simulator boundary.

- [x] **Step 5: Run simulator tests**

Run: `npm test -- src/engine/simulator.test.ts`

Expected: all tests pass.

- [x] **Step 6: Commit**

```bash
git add src/engine/simulator.ts src/engine/simulator.test.ts
git commit -m "feat(sim): control opening conditions"
```

### Task 3: Record Contextual Opportunities, Decisions, and Drive Outcomes

**Files:**
- Modify: `src/engine/simulator.ts:21-35, 128-255, 324-430`
- Test: `src/engine/simulator.test.ts`

- [x] **Step 1: Write a failing event-count test**

```ts
it('records one action event per applied action and drive-ending outcomes once', () => {
  const result = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 5000 });

  expect(result.summary.actionTypes.total).toBe(result.summary.actions);
  expect(result.summary.formationChoices.total).toBeGreaterThan(0);
  expect(result.summary.driveOutcomes.total).toBeLessThanOrEqual(result.summary.resultTypes.total);
  expect(result.summary.actionOpportunities.total).toBeGreaterThanOrEqual(result.summary.actionTypes.total);
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/engine/simulator.test.ts -t "records one action event"`

Expected: failure because the structured counters do not exist.

- [x] **Step 3: Add counters at transition boundaries**

Before choosing an action, record every legal action as an opportunity using a bounded context key: acting team, policy, phase, down, field band (`own`, `midfield`, `opponent`, `goal-to-go`), and action type. Before applying the selected action, increment `actionTypes` with the same context key. For `chooseFormation`, also increment `formationChoices` using team, side, quarter, and formation ID. Keep per-game contextual counters in each summary so matched audit code can correlate usage with final outcomes without storing every state.

After applying an action, increment `driveOutcomes` only when the new `play.result` is one of the engine's drive-ending results: touchdown, made or missed field goal, two-point result, extra point, punt, safety, interception, or turnover on downs. Do not count kickoff placement, ordinary tackle, incomplete pass, fumble without completed possession change, or repeated reads of an existing result.

- [x] **Step 4: Aggregate counters into batch reports**

Add `actionTypes`, `actionOpportunities`, `formationChoices`, and `driveOutcomes` to `SimulationBatchReport` and merge them from each game. Add a failing batch test proving balance buckets, average score, and headline balance use completed games only; stalled/crashed games remain in explicit status counts and anomaly lists. If no games complete, return `null` balance estimates rather than dividing by a synthetic sample of one.

- [x] **Step 5: Run simulator tests**

Run: `npm test -- src/engine/simulator.test.ts`

Expected: all tests pass, including exact action-count consistency.

- [x] **Step 6: Commit**

```bash
git add src/engine/simulator.ts src/engine/simulator.test.ts
git commit -m "feat(sim): report strategic decisions"
```

### Task 4: Add Matched-Pair Audit Statistics

**Files:**
- Create: `src/engine/audit.ts`
- Create: `src/engine/audit.test.ts`
- Modify: `src/engine/simulator.ts:107-128, 324-430`

- [x] **Step 1: Write failing paired-bootstrap interval tests**

```ts
describe('pairedBootstrapInterval', () => {
  it('contains zero for balanced pair effects', () => {
    const interval = pairedBootstrapInterval([-1, 1, -1, 1], { seed: 1, samples: 2_000 });
    expect(interval.low).toBeLessThanOrEqual(0);
    expect(interval.high).toBeGreaterThanOrEqual(0);
  });

  it('rejects empty samples', () => {
    expect(() => pairedBootstrapInterval([], { seed: 1 })).toThrow(/completed pair/i);
  });

  it.each([
    [[0.2, 0.3, 0.4, 0.3], 'positive'],
    [[-0.2, -0.3, -0.4, -0.3], 'negative'],
    [[-0.2, 0.2, -0.1, 0.1], 'inconclusive'],
  ] as const)('classifies deterministic pair effects as %s', (effects, expected) => {
    expect(classifyPairedEffect([...effects], { seed: 2, samples: 2_000 }).classification).toBe(expected);
  });
});
```

Each completed mirrored pair is one sampling unit. For symmetry, calculate one home-advantage win value and one home-minus-away score value per pair by averaging the two mirrored games. For skill gap, orient both games toward the nominated policy and calculate one policy win-share value and one policy score advantage per pair. Score a win as `1`, tie as `0.5`, and loss as `0`; also report ties separately.

Use a deterministic percentile bootstrap that resamples whole pairs with replacement (default 10,000 samples using an audit-specific seed) to produce separate 95% intervals for mean win share/delta and mean score delta. Never resample individual games inside a pair.

- [x] **Step 2: Run the focused test and verify RED**

Run: `npm test -- src/engine/audit.test.ts`

Expected: module/function-not-found failure.

- [x] **Step 3: Implement pure statistical helpers**

Create exported `pairedBootstrapInterval(pairEffects, options)`, `classifySymmetry(...)`, and `classifySkillGap(...)`. Symmetry is actionable only when the paired home-win-share interval excludes `0.5` and the effect is at least 5 percentage points, or the paired score-delta interval excludes `0` and the absolute mean is at least 1 point. Skill gap is supported only when the nominated policy's paired win-share lower bound exceeds `0.5`. Return the bootstrap seed and sample count with every interval so reports are reproducible.

- [x] **Step 4: Write failing matched-run orchestration tests**

Inject a simulation function into `runMatchedAudit` in tests. Verify each pair uses the same seed twice, swaps home/away policies, and swaps explicit opening receiver:

```ts
expect(calls).toEqual([
  expect.objectContaining({ seed: 10, policies: { home: 'heuristic', away: 'random' }, opening: { coinWinner: 'home', choice: 'receive' } }),
  expect.objectContaining({ seed: 10, policies: { home: 'random', away: 'heuristic' }, opening: { coinWinner: 'away', choice: 'receive' } }),
]);
```

Add a second test where one mirror stalls and its partner completes. Assert that the report has zero completed pairs, one excluded pair, zero games in confidence/score estimates, and both game statuses disclosed.

- [x] **Step 5: Implement paired audit orchestration**

`runMatchedAudit` accepts pair count, base seed, policies, optional formation plans, maximum actions, and an injectable simulator defaulting to `simulateGame`. A pair contributes to win, score, tactic, and formation estimates only when both mirrors complete. Exclude the entire pair if either mirror stalls/crashes, disclose both statuses, and retain anomalies.

Return matchup, symmetry, confidence, contextual opportunity/selection rates, formation-stratified outcomes, drive outcomes, and pair completion summaries. Same-policy pairs isolate home/direction effects because the identical policy attacks right as home in one mirror and left as away in the other. Fixed-formation plans run in swapped pairs isolate named formation matchups.

For tactic screening, compute selection rate as contextual selections divided by contextual opportunities. Compute the optional 10-point outcome screen from completed per-game cohorts that did and did not select the tactic, stratified by policy and team side; label it exploratory rather than causal. Require the focused-state counterplay reproduction in Task 6 before any rule change.

- [x] **Step 6: Run audit and simulator tests**

Run: `npm test -- src/engine/audit.test.ts src/engine/simulator.test.ts`

Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add src/engine/audit.ts src/engine/audit.test.ts src/engine/simulator.ts
git commit -m "feat(sim): add matched balance audit"
```

### Task 5: Harden the Simulation CLI

**Files:**
- Modify: `src/simulate.ts:4-72, 74-112`
- Create: `src/simulate.test.ts`

- [x] **Step 1: Export pure parsing and exit-status helpers, then test desired failures**

```ts
it.each([
  ['--games', '0'],
  ['--games', 'nope'],
  ['--max-actions', '-1'],
  ['--repeat-limit', '0'],
])('rejects invalid numeric option %s %s', (flag, value) => {
  expect(() => parseArgs([flag, value])).toThrow(/positive/i);
});

it('fails an audit command when any game is incomplete', () => {
  expect(exitCodeForReport({ crashed: 0, stalled: 1 })).toBe(1);
});
```

- [x] **Step 2: Run CLI tests and verify RED**

Run: `npm test -- src/simulate.test.ts`

Expected: failure because helpers are private or absent and stalled reports currently exit zero.

- [x] **Step 3: Implement strict parsing**

Reject unknown flags, missing values, non-finite numbers, non-integer counts, non-positive counts, and thresholds outside their meaningful range. Add `--home-policy`, `--away-policy`, `--pairs`, and `--audit` options. Keep ordinary batch mode available.

- [x] **Step 4: Separate module execution from pure helpers**

Move command execution into `runCli(args)` and guard it with an ESM main-module check so importing the file in tests does not launch a simulation.

- [x] **Step 5: Print integrity information and return meaningful status**

Always print completed, stalled, crashed, and excluded counts. In audit mode, return non-zero when any game is stalled/crashed or when evidence generation fails. In ordinary diagnostic mode, retain report output but return non-zero for crashes; document stalls visibly.

Add a compatibility test proving the ordinary `--games` batch path still runs without audit flags and its balance sample count equals completed games rather than total attempted games.

- [x] **Step 6: Run CLI and simulator tests**

Run: `npm test -- src/simulate.test.ts src/engine/simulator.test.ts src/engine/audit.test.ts`

Expected: all pass.

- [x] **Step 7: Commit**

```bash
git add src/simulate.ts src/simulate.test.ts
git commit -m "fix(sim): validate audit commands"
```

### Task 6: Run the Quantitative Audit and Investigate Suspected Defects

**Files:**
- Create: `docs/audits/2026-07-11-chessball-quality-audit.md`
- Modify as evidence requires: `src/engine/rules.ts`
- Test as evidence requires: `src/engine/chessball.test.ts`

- [x] **Step 1: Establish a fast smoke result**

Run: `npm run simulate -- --audit --pairs 20 --seed 1 --home-policy heuristic --away-policy random --max-actions 5000 --json`

Expected: valid structured output, reproducible on a second run, with incomplete games disclosed.

- [x] **Step 2: Run the planned evidence batches**

Run same-policy symmetry, mixed-policy skill-gap, and fixed-formation matchup audits. Target 1,000 completed mirrored pairs per conclusion, but stop and report inconclusive if the target sample still crosses a decision boundary. Preserve commands and raw JSON summaries under `docs/audits/data/` only when reasonably sized; otherwise preserve compact aggregates and seed ranges in the report.

- [x] **Step 3: Analyze action, formation, and outcome distributions**

Screen contextual selection/opportunity buckets for ≥80% tactic selection across materially different legal situations. Screen policy-and-side strata for ≥10-point outcome differences between games that used and did not use a tactic. Treat both only as leads, not causal estimates. Trace any lead to concrete legal states and available counters before calling it dominant.

- [x] **Step 4: Reproduce every suspected engine defect before editing rules**

For each suspected issue, follow `superpowers:systematic-debugging`: record the smallest state/action sequence, identify the rule transition responsible, compare it with tests and Rules-dialog wording, and state one root-cause hypothesis.

- [x] **Step 5: Fix confirmed rule defects one at a time using TDD**

For each issue that passes the spec threshold:

1. Add one focused failing test to `src/engine/chessball.test.ts`.
2. Run only that test and verify the expected failure.
3. Make the smallest change in `src/engine/rules.ts`.
4. Run the focused test, then all engine tests.
5. Commit separately as `fix(rules): <specific behavior>`.

If no issue passes the threshold, make no rule change and say so explicitly in the audit.

- [x] **Step 6: Document quantitative conclusions**

Write sample sizes, policies, seeds, incomplete rates, confidence intervals, practical effects, and whether each conclusion is actionable, inconclusive, or clear. Separate observations, confirmed bugs, and optional design ideas.

### Task 7: Perform the Football, Physical-Board, and UI Audits

**Files:**
- Modify: `docs/audits/2026-07-11-chessball-quality-audit.md`
- Read only: `src/engine/rules.ts`, `src/engine/types.ts`, `src/main.tsx`, `src/styles.css`, tests

- [x] **Step 1: Trace every major football flow**

Create a table covering possession, downs, first downs, touchdowns, field goals, extra points, two-point tries, kickoffs, punts, touchbacks, safeties, interceptions, fumbles, tackles, incomplete passes, formations, drives, quarters, and halftime. For each, compare engine transition, test coverage, Rules-dialog wording, and observed simulation output.

- [x] **Step 2: Walk through a physical-table turn**

List required components and manually trace setup, formation, movement, pass, tackle, kick, down change, drive completion, quarter change, and scoring. Record hidden state, arithmetic, markers, lookup frequency, and ambiguous path/distance judgments. Classify findings as practical, burdensome, or computer-dependent.

- [x] **Step 3: Run the UI code audit**

Apply the current Web Interface Guidelines to `src/main.tsx` and `src/styles.css`. Record terse `file:line` accessibility and interaction findings, including icon semantics, focus, dialog focus management, live announcements, reduced motion, touch behavior, overflow, and responsive layout.

- [x] **Step 4: Inspect the rendered UI without modifying it**

Run the Vite development server and inspect desktop and narrow mobile layouts with pointer and keyboard input. Record viewport sizes, input methods, focus order, board readability, state visibility, legal-action discovery, feedback, modal behavior, and rule-teaching gaps. Do not edit UI files.

- [x] **Step 5: Document findings by severity and confidence**

Separate confirmed rule/UI defects, usability risks, tabletop burdens, and optional improvements. Include source locations and concise suggested remedies, but no UI implementation.

### Task 8: Final Verification and Goal-Tree Update

**Files:**
- Modify: `chessball-quality-plan/main.md`
- Modify: `chessball-quality-plan/fair-opportunity/main.md`
- Modify: `chessball-quality-plan/strategic-depth/main.md`
- Modify: `chessball-quality-plan/plausible-football/main.md`
- Modify: `chessball-quality-plan/physical-board-viability/main.md`
- Modify: `chessball-quality-plan/ui-quality/main.md`
- Modify: `chessball-quality-plan/misalignment-report.md`
- Verify: all source and test files changed by prior tasks

- [x] **Step 1: Run focused verification**

Run: `npm test -- src/engine/audit.test.ts src/engine/simulator.test.ts src/simulate.test.ts src/engine/chessball.test.ts`

Expected: all focused tests pass.

- [x] **Step 2: Run the full suite**

Run: `npm test`

Expected: 150 existing tests plus all new tests pass, zero failures.

- [x] **Step 3: Run the production build**

Run: `npm run build`

Expected: TypeScript and Vite build succeed.

- [x] **Step 4: Re-run the compact audit smoke command**

Run the Task 6 smoke command twice and compare the JSON outputs.

Expected: byte-equivalent seeded output and explicit incomplete-game reporting.

- [x] **Step 5: Update goal status from evidence**

Mark audit-only branches done when their findings are documented. Mark engine branches done only if their required evidence and any confirmed fixes are complete. Update the misalignment report with resolved, remaining, and intentionally deferred issues.

- [x] **Step 6: Review the complete diff**

Run: `git diff --check && git status --short && git diff --stat main...HEAD`

Expected: no whitespace errors; no generated build output, `node_modules`, or graph artifacts tracked.

- [x] **Step 7: Commit the audit and planning updates**

```bash
git add docs/audits chessball-quality-plan
git commit -m "docs: report chessball quality audit"
```

- [ ] **Step 8: Request code review and finish the branch**

Use `superpowers:requesting-code-review`, address blocking findings, rerun verification, then use `superpowers:finishing-a-development-branch` to present merge/PR/cleanup options.
