# Chessball Quality Audit Design

## Purpose

Audit the existing Chessball game as a hybrid strategy board game and digital implementation. Preserve its current identity and moderate use of chance while finding demonstrated rule defects, unfair starting advantages, weak strategic incentives, implausible football behavior, tabletop friction, and UI usability problems.

## Confirmed Product Direction

Chessball should be approachable rather than a detailed football simulation. Home and away should begin with equivalent opportunity, but outcomes should not be equalized across player skill. Better formation choices, positioning, field-position management, and risk decisions should create a durable advantage. Dice should create meaningful uncertainty and occasional upsets without overwhelming strategy.

The current rules are the baseline. The audit will not tune a mechanic merely because a small simulation sample looks unusual.

## Scope

### Fair Opportunity

- Test home and away under equivalent policies and matched random conditions.
- Isolate kickoff, receiving, field direction, and formation effects.
- Prefer paired or mirrored comparisons over unrelated batches.
- Treat balance as symmetric opportunity rather than equal outcomes between unequal policies.

### Strategic Depth

- Compare stronger decision policies directly against weaker and random policies.
- Measure whether better decisions produce a repeatable win-rate advantage.
- Record formation and action usage to identify dominant or irrelevant choices.
- Look for tactics that are safe and superior in nearly every situation.
- Preserve moderate variance across random seeds.

### Plausible Football

- Review downs, first downs, possession changes, scoring, kickoffs, punts, field goals, conversions, passing, tackles, fumbles, formations, and quarter progression.
- Record drive outcomes and scoring mix as diagnostic evidence.
- Use recognizable football behavior as a qualitative constraint, not exact NFL statistical calibration.
- Flag contradictions between engine behavior, tests, and player-facing rule explanations.

### Physical-Board Viability

- Assume core play should be executable using a board, pieces, ordinary dice, markers, and a concise reference sheet.
- Identify hidden state, repeated arithmetic, hard-to-judge paths, excessive bookkeeping, and computer-only conveniences.
- Recommend simplification only when it preserves strategic depth and moderate uncertainty.
- Do not require production-ready physical components during this audit.

### UI Quality

- Analyze board readability, legal-action discovery, game-state visibility, decision feedback, terminology, keyboard access, screen-reader support, focus behavior, responsive layout, modal behavior, reduced-motion handling, and touch interaction.
- Check whether the UI teaches rules and communicates strategic consequences.
- Produce findings only. Do not modify UI code during this audit.

## Evaluation Architecture

The audit will extend the existing seeded simulator rather than introduce a separate game implementation. Evaluation code should call the same public rule engine used by the UI.

Paired evaluation should reuse equivalent seed conditions while swapping the relevant starting factor. Policy matchups should permit different policies for home and away rather than assigning one policy to an unrelated half-batch. Reports should separate completed, stalled, and crashed games so incomplete matches cannot silently support a balance conclusion.

Useful report dimensions include:

- Win, tie, and score rates by home/away policy matchup
- Mirrored outcome differences
- Opening kicker and receiver
- Starting and final direction
- Formation and action selection frequency
- Drive outcome and scoring-type frequency
- Turnovers, punts, field goals, conversions, and safeties
- Completion, stall, and crash rates

Simulation length is diagnostic information, not by itself a defect.

## Rule-Change Threshold

A gameplay mechanic may change only when the audit demonstrates at least one of:

1. Home/away or starting-condition asymmetry under matched play.
2. A dominant tactic that removes meaningful counterplay or choice.
3. A broken, contradictory, unreachable, or invalid state transition.
4. An outcome pattern that materially undermines recognizable football or tabletop execution.

Each confirmed defect requires a minimal reproduction and a failing automated regression test before production code changes. Fixes should be narrow; unrelated refactoring and speculative feature additions are excluded.

## Audit Process

1. Establish reproducible baseline tests and simulation reports.
2. Trace each major rule flow through engine state, tests, UI wording, and simulator behavior.
3. Add the minimum evaluation instrumentation needed for matched fairness, skill-gap, tactic, and drive analysis.
4. Run samples large enough to distinguish consistent effects from small-sample noise; report the sample size and incomplete-game rate with every conclusion.
5. Reproduce suspected defects independently of aggregate statistics.
6. For confirmed engine defects, use test-driven fixes and rerun focused tests, the complete suite, the production build, and relevant simulations.
7. Perform the UI and physical-board audits without changing UI behavior.

## Error Handling and Integrity

- Invalid simulator options should fail clearly instead of producing misleading reports.
- Crashed and stalled games must remain distinguishable from completed games.
- A report containing incomplete games must disclose them and must not claim clean balance without qualification.
- Seeded runs must remain reproducible.
- Evaluation logic must not give either team information or actions unavailable through the public rules.

## Testing and Verification

- Add focused simulator tests for mixed-policy matchups, mirrored conditions, aggregation, and failure status.
- Add rule regression tests only for confirmed defects.
- Run `npm test` and `npm run build` after implementation.
- Run larger seeded audit batches and preserve the command, sample size, thresholds, and result summary in the final report.
- Separate statistical observations from proven rule defects and from subjective design recommendations.

## Deliverables

- Updated simulation/evaluation support required to measure fairness and strategic depth.
- Narrow engine fixes for defects that pass the rule-change threshold.
- A written audit with sections for confirmed bugs, balance evidence, strategic findings, football plausibility, physical-board viability, UI findings, and optional future improvements.
- No UI implementation changes in this pass.

## Exclusions

- Exact NFL statistical matching
- A comprehensive rules redesign
- New formations, roles, or gameplay systems without demonstrated need
- Artificial outcome balancing between strong and weak players
- Shortening matches solely to reduce action count
- UI redesign or implementation
- Physical component production
