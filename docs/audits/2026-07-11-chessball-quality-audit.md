# Chessball quality audit

Date run: 2026-07-12. This document combines Task 6 quantitative evidence with the Task 7 football-flow, physical-tabletop, and UI/accessibility qualitative audit.

Accessibility remediation verified: 2026-07-13. The original UI findings below are retained as the historical baseline from revision `60ac1d4`; their source line references are to that revision. The remediation closeout after the recommendations records their current disposition.

## Audit method and evidence rules

All games used the public rule engine through `runMatchedAudit`. Each pair reused one seed. Mirror A assigned the primary policy/plan to home, forced home to win the opening choice and receive; mirror B assigned it to away, forced away to win and receive, and swapped formation-plan identity. Thus home/away, opening receiver, initial direction, policy, and plan identity were reversed together under matched randomness.

Completed pairs alone entered paired intervals. Stalls and crashes were counted separately. Intervals below are deterministic paired bootstraps with 10,000 resamples, 95% confidence, and the stated base seed. Action-limit was 5,000; matches were not shortened. The design thresholds were applied literally: fair-opportunity action requires a CI excluding no advantage and at least five win-share points or one score point; a skill gap requires the stronger policy's CI lower bound above 50%. Formation and tactic statistics are screens, not causal proof or automatic rule-change authority.

The policies are observable simulator policies, not claims about optimal play. `random` samples from bounded legal actions (with required conversions/recoveries and available tackles handled so games remain executable). `heuristic` uses state-aware action ranking, prefers receiving, and makes deterministic/state-dependent formation, movement, kick, pass, handoff, and tackle choices with seeded tie-breaking.

## Reproducibility commands and configuration

Required smoke command (run twice):

```sh
npm run simulate -- --audit --pairs 20 --seed 1 --home-policy heuristic --away-policy random --max-actions 5000 --json
```

After the opportunity-instrumentation fix, the two fresh stdout files were byte-equivalent (`cmp` success), 601,527 bytes each including npm's command banner. After parsing from the first JSON object, each completed 20/20 pairs (40/40 games), with no exclusion, stall, or crash, and reported 59,150 action-type decision opportunities.

Core commands:

```sh
npm run simulate -- --audit --pairs 1000 --seed 1001 --home-policy heuristic --away-policy heuristic --max-actions 5000 --json
npm run simulate -- --audit --pairs 1000 --seed 2001 --home-policy random --away-policy random --max-actions 5000 --json
npm run simulate -- --audit --pairs 1000 --seed 3001 --home-policy heuristic --away-policy random --max-actions 5000 --json
```

Seed ranges were respectively 1001–2000, 2001–3000, and 3001–4000. Bootstrap seeds matched each base seed. The post-fix core commands were launched concurrently; runtime is intentionally omitted from canonical evidence because it is machine/load dependent.

Formation screening called `runMatchedAudit` directly. It compared all nine offense/defense plan combinations (offense: `i-form`, `shotgun`, `singleback`; defense: `4-3`, `nickel`, `goal-line`) against `{ offense: i-form, defense: 4-3 }`, using heuristic/heuristic, 100 pairs per matchup, sequential seed blocks 10001–10900, bootstrap seeds 71–79, 10,000 resamples, and maxActions 5,000. The two screened one-factor leads were then repeated at 1,000 pairs: goal-line defense at seeds 20001–21000/bootstrap 91 and shotgun offense at seeds 21001–22000/bootstrap 92.

The exact executable formation definitions are committed in `scripts/run-formation-audit.ts`; they require no source edits between modes:

```sh
npm exec vite-node scripts/run-formation-audit.ts -- --mode screen
npm exec vite-node scripts/run-formation-audit.ts -- --mode followups
# regenerate the canonical artifact byte-for-byte (same code, seeds, and config)
npm exec vite-node scripts/run-formation-audit.ts -- --mode all > docs/audits/data/2026-07-11-formation-audit.json
```

Compact preserved evidence is in `docs/audits/data/2026-07-11-formation-audit.json`. `--mode all` emits that canonical schema directly and deterministically; runtime and timestamps are intentionally excluded from canonical comparison. The full core action distributions and tactic screens are split by matchup in `docs/audits/data/2026-07-11-heuristic-vs-heuristic-screens.json`, `docs/audits/data/2026-07-11-random-vs-random-screens.json`, and `docs/audits/data/2026-07-11-heuristic-vs-random-screens.json`. Each core artifact records that it follows both the drive-ownership and opportunity-instrumentation fixes, its command, policy/team strata, seed range, max-actions limit, opportunity unit, and bootstrap configuration; machine/load-dependent runtime is omitted.

For all action-selection rates, an **opportunity** is one decision situation in which that action type is legal. Multiple concrete destinations/actions of the same type in a single legal-action list count once, so the denominator measures decisions rather than board branching factor. Selections remain the chosen action-type count. Tactic cohorts are game-level selected-versus-not-selected comparisons and remain exploratory rather than causal.

## Completion integrity (post-fix)

Every refreshed sample completed. Core: 3,000/3,000 pairs and 6,000/6,000 games. Formation screen: 900/900 pairs and 1,800/1,800 games. Formation follow-ups: 2,000/2,000 pairs and 4,000/4,000 games. Across these 11,800 post-fix games there were zero excluded pairs, stalls, crashes, or simulator anomalies. No attempts were silently substituted for pairs, and no pre-fix artifact contributes to the current figures below.

## Fair-opportunity results

| Same-policy matchup | Completed pairs | Home win share, paired 95% CI | Home score delta, paired 95% CI | Conclusion |
|---|---:|---:|---:|---|
| heuristic / heuristic | 1,000 | 48.75% [47.60%, 49.90%] | -0.2555 [-0.4205, -0.0940] | statistically nonzero score lead, below the 1-point practical threshold; no actionable asymmetry |
| random / random | 1,000 | 49.975% [48.80%, 51.15%] | -0.0020 [-0.1275, 0.1235] | no actionable asymmetry |
| heuristic / random | 1,000 | 50.30% [49.375%, 51.225%] | +0.1035 [-0.0470, 0.2535] | no home/opening-direction effect visible despite unequal policy |

All home-win-share intervals include 50%. The heuristic/heuristic score interval narrowly excludes zero, but its 0.2555-point effect is far below the required one-point practical threshold; the other score intervals include zero. Statistical conclusion: the target sample supplies no evidence of *actionable* home, opening-receiver, or direction advantage. Causal limitation: because those conditions reverse together, this audit establishes fair combined opportunity; it does not estimate an isolated kickoff effect independent of direction.

## Skill-gap results

Heuristic versus random completed 1,000 pairs/2,000 games: heuristic 1,584 wins, random 174, and 242 ties. Its tie-adjusted share was 85.25%, paired 95% CI [83.55%, 86.90%]; score differential was +5.5195, CI [+5.1965, +5.8395]. The lower win-share bound remains far above 50%, so the design's player-policy skill-gap criterion is supported with a 35.25-point estimated effect. The post-fix effect is materially smaller than the historical pre-fix estimate but does not change the conclusion that the tested heuristic is stronger than the tested random baseline; it does not establish optimal play or a desired target gap.

As controls, assigning the identical policy labels as “primary” produced null results: heuristic/heuristic 50.30% [47.85%, 52.85%], and random/random 50.775% [48.375%, 53.125%].

## Formation and tactic screening

The post-fix 100-pair balanced screen completed every cell. Against the fixed i-form/4-3 reference, the primary plan's tie-adjusted point shares were: i-form/4-3 46.50%; i-form/nickel 56.50%; i-form/goal-line 67.25%; shotgun/4-3 56.50%; shotgun/nickel 63.50%; shotgun/goal-line 72.75%; singleback/4-3 52.00%; singleback/nickel 53.50%; singleback/goal-line 56.25%. Because plan components combine additively and cells used different seed blocks, these are screening observations, not nine independent causal rankings.

The formation effects were replicated in controlled one-factor follow-ups:

| One-factor plan comparison | Completed pairs | Primary wins / comparison wins / ties | Primary share, paired 95% CI | Score delta, paired 95% CI |
|---|---:|---:|---:|---:|
| i-form + goal-line vs i-form + 4-3 | 1,000 | 1,061 / 485 / 454 | 64.40% [62.10%, 66.75%] | +2.411 [+2.0395, +2.786] |
| shotgun + 4-3 vs i-form + 4-3 | 1,000 | 902 / 697 / 401 | 55.125% [52.675%, 57.675%] | +1.0655 [+0.6855, +1.453] |

Observation and statistical conclusion: under this fixed heuristic policy, goal-line defense and shotgun offense are materially stronger than their tested alternatives; 4-3 and i-form are strategically weak in these matchups. This is stronger than raw usage evidence and warrants design/state-level follow-up. It is not a confirmed dominant-tactic defect: fixed formations alter initial geometry, the screen did not enumerate legal counter-shifts or an adaptive counter-policy, and no focused legal state demonstrated lack of counterplay/tradeoff. No formation rule was tuned.

Contextual selection screening retained every threshold crossing after correcting the opportunity unit: HH had 163 contexts at or above 80% and 36 cohorts with at least a ten-point absolute exploratory difference; RR had 133 and 33; HR had 292 and 66. The higher high-selection counts are a denominator correction, not changed gameplay: concrete destinations no longer multiply an action type's opportunity count. Many high-rate contexts are protocol/forced or single-type situations (`coinToss`, kickoff, tackle, recovery, `nextDown`, placement, and snap), not discretionary strategic tactic leads. These are refreshed hypothesis-generating screens only; no threshold crossing received a focused state-level reproduction showing absent counterplay, so no formation or tactic rule was tuned.

Every cohort artifact entry preserves the exact key, policy/team stratum, selections, decision opportunities, rate, both outcome arms, win-share difference, and a sparse-data label when either arm has fewer than 30 games. For example, HH `team=away|policy=heuristic|phase=live|down=1|field=opponent|action=move` had 1,891 selections in 13,812 decision opportunities (13.691%); selected games were 468-191-320 and not-selected games 287-209-343, an exploratory +10.896-point win-share difference with at least 30 games in each arm. Cohorts remain game-level and confounded by field position and game strength. They are leads only; no causal dominant-tactic claim is made.

Formation usage in unconstrained post-fix heuristic/heuristic play remained nearly uniform across all six current IDs. Of 55,056 offensive selections: i-form 18,562 (33.714%), shotgun 18,206 (33.068%), and singleback 18,288 (33.217%). Of 55,056 defensive selections: 4-3 18,272 (33.188%), nickel 18,327 (33.288%), and goal-line 18,457 (33.524%). RR and HR counts/rates are preserved in their refreshed core artifacts. Thus raw usage would have concealed the fixed-plan effects above and was not used to declare dominance.

## Drive, scoring, and action observations

| Matchup (2,000 games each) | Recorded terminal/conversion outcomes | Avg actions/game | TD | FG good | FG missed | INT | safety | turnover on downs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| heuristic / heuristic | 7,742 | 395.043 | 1,804 | 1,984 | 2,013 | 193 | 5 | 0 |
| random / random | 17,421 | 760.203 | 923 | 1,255 | 9,590 | 393 | 428 | 3,909 |
| heuristic / random | 15,223 | 559.445 | 1,311 | 2,585 | 7,517 | 240 | 327 | 1,981 |

These patterns explain part of the skill gap: random play reaches far fewer touchdowns and successful field goals and many more turnovers on downs/safeties. They are descriptive policy outcomes, not targets for NFL calibration. The exceptionally low heuristic/heuristic turnover-on-downs count and frequent field-goal attempts are qualitative football-flow leads for Task 7, not proven transition defects.

With decision situations as the denominator, HH recorded 790,085 selections across 1,830,190 action-type opportunities: move 180,762/404,770 (44.658%), tackle 131,450/131,450 (100%), kick 39,488/121,898 (32.394%), and pass 19,466/112,810 (17.256%). RR recorded 1,520,406 selections across 4,214,763 opportunities: move 294,893/733,071 (40.227%), tackle 226,062/226,062 (100%), kick 28,484/347,873 (8.188%), and pass 83,315/340,163 (24.493%). Mixed HR recorded 1,118,889 selections across 2,928,207 opportunities: move 207,140/543,841 (38.088%), tackle 168,176/168,176 (100%), kick 34,684/228,442 (15.183%), and pass 50,143/219,304 (22.865%). A 100% tackle rate means that when the contextual legal-action set exposed the tackle action type, the policy selected some tackle; it does not mean one concrete target dominated. Complete refreshed distributions cover every observed action type and retain exact contextual screens in the three artifacts.

## Confirmed quantitative-phase bugs and fixes

Task 6 found none from its statistical screens. Seed reproducibility, completion integrity, and matched fair opportunity passed. The large formation effects are statistical/design-level leads and did not meet the required focused-state/counterplay/root-cause threshold for modifying `rules.ts`, so that quantitative phase made no rule or regression-test change. Task 7's later focused qualitative flow audit did confirm drive-ownership defects outside that statistical conclusion; Task 8 added failing ownership regressions and fixed them in `31deeb9` (`fix(rules): credit completed drives to prior offense`).

## Inconclusive and optional follow-ups

- Trace goal-line and shotgun geometry through focused legal states, including shifts and adaptive counter-formations, before considering any balance change.
- Run a crossed formation matrix with adaptive policies if a causal ranking across all offense/defense IDs is needed; the current reference screen efficiently identified leads but is not a full factorial causal model.
- Review the heuristic's field-goal/turnover-on-downs behavior and the scoring mix with adaptive policies before tuning. Do not tune toward exact NFL rates.
- Treat selected-vs-not-selected tactic cohorts as hypothesis generators; a future causal screen should stratify more tightly and require adequate selected and unselected game counts.

## Football and rules-flow audit

The standard is a recognizable, strategically legible football hybrid, not exact NFL simulation. References below are current source lines; test names make each cited case independently searchable.

| Flow | Engine transition / quantitative rule | Test evidence | Player-facing wording | Assessment |
|---|---|---|---|---|
| Coin toss and choice | `generateLegalActions` and `coinToss`/`chooseKickoffChoice` (`src/engine/rules.ts:220`, `src/engine/rules.ts:607`, `src/engine/rules.ts:621`): heads=home, tails=away; winner chooses kick/receive. | `src/engine/chessball.test.ts:540` “resolves the opening coin toss…”; `:555` “lets the coin toss winner choose…” | `src/main.tsx:608-620`; Rules `src/main.tsx:676` | Aligned and symmetric; computer/computer always chooses receive (`src/main.tsx:294-300`), a policy abstraction rather than a rule defect. |
| Kick roll and placement | `kickoff` then `placeKick` (`src/engine/rules.ts:881`, `:904`); 2d6 total equals columns/5-yard units (`:1228`), row alone is chosen on the clamped landing column (`:1236-1247`). | `:986` opening placement; `:1009` away mirror; `:1032` short kick; `:1083` placement choice | Rules `src/main.tsx:678-679`; hint `:460` | Aligned, directional tests present. Clamping long kicks to the board edge is an abstraction. |
| Touchback, out-of-bounds, touched kick, return | `placeKick` branches at `src/engine/rules.ts:910-953`; return pickup/touch at `:712-733`; return ranges/path rules at `:1101-1180`. Touchback is own 25 (`:1318`). | `:1125` touchbacks; `:1155` receiver pickup; `:1178` coverage touch; `:1203`, `:1233`, `:1252`, `:1278` return movement/path/spot/range; drive counters in `completed drive ownership` | Rules `src/main.tsx:679` | Mechanics align and the later-confirmed drive-accounting defects are **fixed**: kickoff resolution consumes no offensive drive, while punt resolution credits the punting offense. `kickOutOfBounds` remains unreachable through legal placement because x is clamped and y is enumerated in-bounds (`:1236-1247`): ambiguity/dead branch and coverage gap, not part of the fixed reachable counter defects. |
| Possession and alternating turns | `snap` starts offense (`src/engine/rules.ts:643-652`); successful/failed actions generally call `alternateTurn`; turnovers explicitly set team/direction/turn. | `:1413` snap/alternation; interception `:1548`; kick-return turnover `:1301` | Rules `src/main.tsx:681-682` | Aligned. One-action alternation is a deliberate board-game abstraction. |
| Formations, confirmation, shifts, snap | Choice/confirm `src/engine/rules.ts:563-598`; confirmed side receives two shifts, cannot cross LOS (`:682-698`); both sides required to snap (`:643-652`). | `:82`, `:100`, `:117`, `:129`, `:1431`; end-zone projection `:1397` | Rules `src/main.tsx:680`; controls `:380-410` | Ambiguity: rules say “change freely, then confirm” but omit the two post-confirmation shifts and how their destinations are judged. Quantitative screen found goal-line defense and shotgun materially stronger under the fixed policy (Formation section), a design risk, not a defect. |
| Movement, power movement, blocking | Role movement and sliding at `src/engine/rules.ts:1101-1154`, power paths/targets at `:1373-1419`; contact target rises with contacts; offense range penalty while it controls ball. | `:153`, `:162`, `:175`, `:182`, `:201`, `:219`, `:236` | Rules `src/main.tsx:685-688` | Aligned abstraction. Board adjudication needs role/path reference cards; “square radius,” orthogonal turns, sliding, and power-contact counting are not fully defined in prose. |
| Handoff and pass | Adjacent handoff `src/engine/rules.ts:956-968`; forward/backward classification and LOS/once-per-down `:775-853`; 2d6 target is `5 + distance` capped at 12 (`:1207-1213`); traffic ignored; snake-eyes interception within distance 1 (`:855-859`). | Handoff/recovery `:495`; completion `:261`; eligibility `:284`; TD `:302`; traffic `:329`, `:351`; incomplete/spot `:374`, `:399`, `:444`; second forward pass `:425`; INT `:470` | Rules `src/main.tsx:685`, `:689-691` | Aligned hybrid. Backward passes still use a pass roll and can be incomplete; recognizable but abstract. No explicit left/right mirror test for passing: coverage gap. |
| Tackle, power tackle, fumble/recovery | Approach/path/target `src/engine/rules.ts:1019-1066`, `:1156-1180`, `:1215-1218`; 12 causes immediate defender recovery; loose recovery `:1069-1100`. | `:605`, `:620`, `:645`, `:664`, `:700`, `:726`; loose recovery `:495`; return strip `:1301` | Rules `src/main.tsx:692-694` | Aligned abstraction. A “fumble” is effectively an automatic strip turnover rather than a loose-ball contest; ordinary loose recovery exists but is not reached by that result. |
| Downs, first down, LOS, turnover on downs | Stop/first-down logic in `endPlayOrTurnover` (`src/engine/rules.ts:1461-1486`); next formation/reset `startNextDown` (`:346-421`); two columns=10 yards (`:193-196`). | `:53`; `:857`; `:1442`, `:1462`, `:1483`; turnover `:1504`, `:1526` | Rules `src/main.tsx:683`, `:691`, `:697` | Mostly aligned, including both directions. Ambiguity: LOS is placed “in front of” stopped ball, but the Rules dialog does not explain the edge/column convention shown by UI markers. |
| Punt and field goal | Punt any down to 2d6 placement/return (`src/engine/rules.ts:996-1013`); FG 2d6 vs `5 + distance`, capped 12, immediate 3 points or turnover at kick spot (`:970-994`, `:1220-1226`). | Punt `:1326`; FG/safety/downs `:770`; missed FG `:808`; post-FG kickoff `:966` | Rules `src/main.tsx:684`, `:695`; controls `:432-437` | Aligned hybrid. Any-down availability preserves choice, but capped targets make all very long attempts equally difficult (12) and fixed-policy FG frequency is a balance lead, not a confirmed defect. |
| TD, extra point, two-point try, safety | TD checks on move/power/pass (`src/engine/rules.ts:735-740`, `:764-769`, `:847-850`); XP fixed target 5 (`:862-878`); two-point formation/finish (`:655-679`, `:1498-1505`); safety on successful tackle in carrier’s own end zone (`:1032-1037`). | TD `:755`; XP `:825`, `:844`, `:945`; two point `:876`, `:894`, `:919`; safety in `:770` | Rules `src/main.tsx:695-697` | Aligned abstraction. Rules call the two-point start “from the goal line,” while engine uses the adjacent conversion line (`src/engine/rules.ts:1322-1324`): player-facing ambiguity. |
| Drive completion/accounting | `completedDriveOwner` derives an explicit owner from the terminal result and preserved kick provenance; `markDriveComplete` increments that owner before quarter evaluation. | `completed drive ownership` regressions cover kickoff, punt, transfers, scoring, nonterminal plays, and quarter/final boundaries; legal kick paths also assert counters. | Rules `src/main.tsx:676`, `:697`; status `:366-370` | **Fixed:** kickoff completions are suppressed, prior offenses receive transfer completions, and every punt completion belongs to the punting offense. |
| Quarters, halftime, final | Two completed drives/team/quarter; quarter advance/final and halftime kickoff at `src/engine/rules.ts:1260-1291`. Halftime kicker is opposite opening kicker, therefore opening receiver kicks to opening kicker. | `:1346`, `:1364`, `:1379`; mirror kickoff formation `:590`; corrected-owner boundary regressions in `completed drive ownership` | Rules `src/main.tsx:676`, `:696`; final modal `:641-664` | Intended halftime possession is aligned. Quarter/final evaluation now runs after explicit-owner accounting, and opening/halftime kickoff resolution consumes no drive. |

### Initial kickoff reproduction

Exact reproduced cases (all began with `drivesThisQuarter={home:0,away:0}`): home `{6,6}` kickoff followed by `placeKick({22,5})` → away `touchback` → after `{home:0,away:1}`; loose kick `{11,5}` followed by `move(home-wr1,{11,5})` → away `kickTouched` → after `{home:0,away:1}`; mirrored away `placeKick({1,5})` → home `touchback` → after `{home:1,away:0}`; loose kick `{12,5}` followed by `move(away-wr1,{12,5})` → home `kickTouched` → after `{home:1,away:0}`. Each “after” state was measured immediately after `startNextDown` and had `phase=formation`.

**Reachable kickoff terminal states consumed a receiving drive before scrimmage play (fixed).** The original public-action reproductions and root-cause trace remain the evidence for the defect. `endPlay` now preserves `pendingKick` until `startNextDown`; `completedDriveOwner` returns no owner for kickoff resolution, and `startNextDown` clears provenance after accounting. Mirrored touchback fixtures plus legal touchback and coverage-first `kickTouched` paths assert that neither counter changes. `kickOutOfBounds` remains unreachable through legal placement because placements are clamped in bounds; no new behavior was added for that dead branch.

### Drive-ownership invariant and terminal matrix

Invariant: **a completed drive belongs to the offense whose possession/drive ended**; a kickoff completes no offensive drive. The following table preserves the pre-fix reproduction evidence. A read-only `vite-node` matrix began every case at `{home:0,away:0}`, mirrored home/away, called `startNextDown`, and recorded the changed counter. Results were symmetric, so `O` means prior offense and `N` the new/current possession team. Unless the punt rows say otherwise, `pendingKick` was already absent/cleared and provenance came only from `PlayResult`; the table explicitly calls out where that result lacked enough provenance. All reachable defect rows are now covered by the fixed ownership model and regressions described below.

| Terminal path | Pre-fix post-result possession / provenance | Pre-fix changed entry | Correct entry | Current status |
|---|---|---|---|---|
| Kickoff touchback | N; `pendingKick` cleared | N | none | Pre-fix confirmed spurious completion; fixed in Task 8. |
| Kickoff coverage-first `kickTouched` | N; teams remain in result but kick kind is lost | N | none | Pre-fix confirmed spurious completion; fixed in Task 8. |
| Punt touchback | N; `touchback` loses punt provenance | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Punt receiving pickup, ordinary tackle | N; pickup retains `pendingKick`, later tackle clears it and leaves only `tackle` | none | O (punting drive) | Pre-fix confirmed missing completion; fixed in Task 8. |
| Punt return `outOfBounds` | Legal moves never leave the board (`src/engine/rules.ts:735-736`, `:1101-1154`) | none | O if reachable | Unreachable/dead branch; no generalized defect claim. |
| Punt coverage-first `kickTouched` | N; result loses punt kind | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Interception | switches to N before `endPlay` (`src/engine/rules.ts:802-812`) | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Turnover on downs | switches to N before `endPlay` (`src/engine/rules.ts:1468-1483`; incomplete path `:818-834`) | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Made field goal | O stays current | O | O | Aligned; both directions. |
| Missed field goal | switches to N before `endPlay` (`src/engine/rules.ts:981-993`) | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Safety | O remains possession; result names scoring defense | O | O | Aligned; both directions. |
| Touchdown + extra point/two-point | O remains possession through conversion | O | O | Aligned; both directions; touchdown cannot advance before conversion (`src/engine/rules.ts:349`). |
| Opponent-recovered double-six fumble | switches to N before `endPlay` (`src/engine/rules.ts:1039-1055`) | N | O | Pre-fix confirmed miscredit; fixed in Task 8. |
| Same-team recovered `fumble` | Engine never emits it: double-six always recovers to defender; generic `recover` emits `recovery` (`src/engine/rules.ts:1069-1098`) | none through legal flow | context-dependent | Unreachable as `fumble`; synthetic-state behavior is not treated as evidence. |
| Normal tackle / incomplete | O stays current; neither result completes a drive | none | none | Aligned non-terminal behavior; both directions. |

### Confirmed drive-accounting defects, root cause, and fix

**Drive ownership was derived from mutable post-transition possession (fixed).** `completedDriveOwner(state, result)` now returns an explicit team: scoring/conversion results use their offense, safety/INT/downs derive the prior offense, missed field goals use the kicking team, and opponent-recovered fumbles derive the fumbling offense. `markDriveComplete(state, owner)` no longer reads current possession.

**Kick provenance was discarded before accounting (fixed).** `endPlay` retains `pendingKick` through `betweenDowns`, so punt touchbacks, coverage-first touches, fielded-return tackles, and return turnovers all credit `pendingKick.kickingTeam`; kickoff setup/returns credit no offensive drive. Provenance is cleared before the next formation, kickoff, quarter, or final state is returned.

Fix evidence: `src/engine/chessball.test.ts` includes the `completed drive ownership` matrix, mirrored kickoff ownership, public punt terminal/return paths, scoring and nonterminal guards, no-double-count conversion coverage, and corrected quarter/final boundary checks. The full post-fix evidence refresh completed: three 1,000-pair core audits, the 900-pair formation screen, both 1,000-pair formation follow-ups, and the deterministic 20-pair smoke. Current quantitative claims and committed artifacts are post-fix only.

### Football abstractions and design risks (not confirmed bugs)

- High: fixed-policy formation evidence materially favors goal-line defense and shotgun offense; test adaptive counter-shifts before balance changes.
- Medium: pass/FG targets cap at 12, collapsing distinctions among sufficiently long attempts; field goals remain available on every down. This can reduce distance-sensitive strategy but is internally consistent.
- Medium: strip fumbles automatically transfer possession to the tackler, so the loose-ball/recovery subsystem rarely represents a contested fumble.
- Low: one-action alternating turns, traffic-transparent passing, 2d6-per-five-yards kick distance, and role-specific chess movement are clear hybrid abstractions.

## Physical-board viability

### Minimum component inventory

- 24×11 gridded field with end zones, midfield/yard columns, and two LOS/line-to-gain edge markers.
- 22 distinguishable team pieces whose current offense/defense role codes can be mapped; one football token.
- Two ordinary d6; coin or equivalent 50/50 method.
- Down (1–4), quarter (1–4), score, possession/turn, forward-pass-used, two shifts per team, formation-confirmed, conversion, and completed-drives-per-team markers.
- Concise formation mats/cards plus role movement, pass/tackle/power/kick target, result, kickoff, and drive-completion references.

| Full-play stage | Hidden/public state to remember | Arithmetic / lookup | Path adjudication | Repeated bookkeeping | Computer dependence | Classification / severity / non-binding aid |
|---|---|---|---|---|---|---|
| Board setup, coin, kickoff setup | Opening kicker/receiver and direction | Preset coordinates; own 35/30/return rows | None | Place 22 pieces, possession and turn | None; coin is physical | Practical / low. Kickoff setup card and direction marker. |
| Kick roll, placement, return | Pending 2d6 distance; loose versus controlled ball | Sum dice, advance exact columns, choose row; touchback own 25 | Return movement blockers and coverage/return ranges differ | Landing marker, turn alternation, pickup/touch/dead result | None; ordinary d6 suffice | Burdensome / medium. Kick ruler and loose-ball/dead-kick token; explicitly state edge clamping and unreachable OOB rule. |
| Formation choice, confirmation, shifts, snap | Each side's confirmation and two shifts/team | Rebuild preset around current LOS | Shift must stay on correct LOS side and open square | Re-place all 22 pieces every down; spend shift tokens | None | Burdensome / high. Formation mats and two shift tokens/team. |
| Alternating turns and ordinary movement | Active team, possession, carrier, offense -1 movement | Six role movement patterns and range modifier | Sliding, diagonal/straight/orthogonal, one-turn, friendly traversal, occupied squares | Flip turn after every action | None | Ambiguous / high. Role/path card and turn marker. |
| Power movement | Eligible role, attempted destination, current turn | Count distance/contact; 2d6 target lookup | Orthogonal occupied lane, open destination, contacts crossed | Record roll, success/failure and turn | None | Ambiguous / high. Illustrated lane examples and compact power table. |
| Handoff and pass | Carrier, forward-pass-used, LOS/direction | Adjacency; diagonal-first distance; target `5+distance` capped 12; snake-eyes rule | Pass traffic is ignored; decide forward/backward from x direction | Move ball token; mark forward pass; record incomplete/INT | None | Burdensome / medium. Pass-used marker, distance ruler, pass card. |
| Tackle, power tackle, fumble/recovery | Defender turn, carrier, loose/controlled state | Role range; clear target `5+distance`; power target `8+distance+blockers`; double six | Clear approach versus crossed opposing blockers; friendly pieces do not block | Roll/result, missed-defender displacement, down or possession | None | Ambiguous / high. Tackle template/examples; two-sided ball token. |
| Down, LOS, first down | Down 1–4, direction, LOS, gain line, goal-to-go | Two columns=10 yards; clamp near goal | Offense-facing edge/spot convention | Advance down; reset at first down; re-form | None | Burdensome / high. Down dial and directional LOS/gain markers. |
| Punt, field goal, turnover | Kick kind, kick spot, current possession, and **prior drive owner** until accounting completes | Punt sum=columns; FG distance and `5+distance` capped 12 | Punt reuses kick landing/return judgments | Charge the prior offense before changing possession; preserve punt provenance through the return; missed FG spot | None | Burdensome / high. Kick/FG card, kick-spot marker, and explicit drive-owner marker. |
| Touchdown, conversion, ensuing kickoff | Scoring team, conversion pending, chosen try | +6; XP target 5; +1/+2 | Two-point try repeats formation/live adjudication | Score, conversion result, completed drive, kickoff reset | None | Burdensome / medium. Conversion marker and score track. |
| Quarter completion, halftime, final | Two completed drives per team/quarter; opening kicker; quarter | Compare both drive tracks to 2; derive halftime kicker | None | Four drive tracks per quarter, quarter reset, score/final tie; explicit prior-owner accounting on every interception/down/FG/fumble/punt transition | None; the confirmed software ownership errors are fixed and regression-tested | Burdensome / high. Team drive tracks and halftime reminder. |

Overall: playable with ordinary tabletop materials, but currently reference-heavy. The repeated full re-formation and path/target adjudication are the chief burdens; no hidden-information mechanic requires a computer. Hidden state is public but easy to forget: turn, possession, forward-pass-used, formation confirmations/shifts, conversion state, down/quarter, drive counts, and pending kick distance.

## UI and accessibility audit

### Method, tools, viewports, and limitations

Static review covered `src/main.tsx` and `src/styles.css` against the current Vercel Web Interface Guidelines fetched 2026-07-12 from <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>. Rendered inspection used Vite 6.4.3 at `127.0.0.1:4187` and headless Chromium 150 controlled directly through Chrome DevTools Protocol after ChromeDriver proved unreliable. Exact emulated/content viewports were desktop 1440×900 and mobile 390×844 at device scale 1. CDP dispatched keyboard Tab, ArrowRight, and Escape; pointer-equivalent activation used DOM click events. Pregame, coin toss, kickoff placement/return, formation, live, between-downs, Rules, and history states were reached. Actual OS touch input and the final modal were not exercised; mobile geometry/touch targets were measured, and final-modal behavior remains static/test evidence only.

### Static findings

#### `src/main.tsx`

- P1 `src/main.tsx:488-527` — 264 board buttons use `role="gridcell"` but have no accessible name beyond browser-dependent `title`, no roving-tabindex/arrow-key grid model, and every cell enters sequential Tab order; keyboard board play is impractical.
- P1 `src/main.tsx:607-624`, `:653-665`, `:670-700` — modal backdrops do not trap/initialize focus, restore trigger focus, or make background inert. Dismissible Rules also lacks Escape; coin/final are flow gates and need containment/focus management, not necessarily Escape dismissal.
- P2 `src/main.tsx:570-575`, `:352-375`, `:478-486`, `:781-782` — `role="log"` has implicit polite live-region semantics for event entries, but primary action message, phase/turn/score/status, and history-position changes occur outside it and need announcement testing or explicit treatment; do not add a duplicate live region to the log itself.
- P2 `src/main.tsx:350-378` — `<main>` exists, but there is no skip link and the major workspace/field regions have no navigable heading hierarchy; keyboard users must traverse hundreds of cells.
- P2 `src/main.tsx:540-542` — “New Game” immediately destroys match/history without confirmation or undo; distinction from pregame reset is visual/text only.
- P2 `src/main.tsx:511-527` — legal/selected/power/ball states depend heavily on visual styling; cells do not expose selected piece, coordinate, team/role, legal action, or disabled/read-only history state through `aria-selected`, names, or descriptions.
- P2 `src/main.tsx:579-588` — opening/closing dialogs do not preserve trigger references, so focus restoration is absent; conditional removal can return focus to `body`.
- P3 `src/main.tsx:409-461`, `:536-562`, `:613-620`, `:660-673` — Lucide icons paired with text are not consistently marked `aria-hidden`; they can add redundant accessible content depending on SVG behavior. History icons correctly use `aria-hidden` at `:768-778`.
- P3 `src/main.tsx:485`, `:570-575`, `:767-781` — viewing history is labeled, but board cells remain operable-looking and focusable; status should expose read-only mode programmatically.

#### `src/styles.css`

- P1 `src/styles.css:1041-1057` — mobile field remains `min-width:860px` inside horizontal overflow; at 390px the board requires extensive two-axis navigation and controls/status are spatially separated from play.
- P2 `src/styles.css:165-180`, `:991-1004`, `:1014-1027` — controls are 34–38px high, below the common robust 44px touch-target heuristic (not asserted as a Vercel-rule threshold). Separately, no `touch-action: manipulation` or intentional tap-highlight policy is set.
- P2 `src/styles.css:883-903` — modal lacks `overscroll-behavior: contain`; body/background scrolling and interaction are not locked.
- P2 `src/styles.css:30-32`, `:165-180`, `:991-1004`, `:1014-1027` — no general `:focus-visible` treatment for buttons/grid cells; only selected pieces receive an outline (`:833-835`), which is selection, not keyboard focus.
- P3 `src/styles.css:121-123`, `:792-803`, `:825-835`, `:879-881` — active team/legal/power/target cues rely substantially on color; board text/accessible descriptions must carry the same distinctions.
- P3 `src/styles.css:1-14` — dark `color-scheme` is correctly declared; no animation/transition rules exist, so reduced-motion handling is not currently required.

### Rendered observations

- Desktop 1440×900: document measured exactly 1440×900 with no page overflow; the field was 1088×498.7 at x=334. Pregame exposed 274 buttons (264 grid cells plus controls). Initial focus was `body`; first Tab focused cell `0,0`, before Start Game, with only the browser-default 1px outline. ArrowRight left focus at `0,0`; the cell had `role=gridcell`, coordinate-only `title`, and no `aria-label`. Enter activation uses the native button, but locating/actioning the board by keyboard is impractical.
- Rules modal opened while focus remained on the background grid cell, body overflow stayed `visible`, backdrop overscroll was `auto`, and background controls remained interactive. Escape did not close it. Pointer-clicking Close did close it, but focus remained on the now-detached close button rather than returning to Rules. Coin Toss likewise opened without moving focus into the dialog and left underlying field buttons enabled.
- Pointer/autoplay playthrough reached Kickoff, Kick Placement (11 legal landing cells), Kick Return, Between Downs, Formation, and Live. The formation panel appeared during Formation and the command panel returned for Live. A paused Previous Move action changed the history index from latest (for example “Move 160 of 161”), confirming history navigation, though its read-only mode is communicated visually rather than programmatically.
- Mobile 390×844: document height was 1417px. The field measured 860×394.2 inside a 354px-wide `overflow-x:auto` wrapper, requiring up to 506px horizontal travel; setup controls began below the board near y=1209. Measured setup targets were 36px high (Start Game 119.8×36; Rules 78.9×36; player toggles 57–71×36), below 44px. Rules modal measured 342×759.6 with scroll content 2862px/client 758px; body remained scrollable and backdrop overscroll stayed `auto`.
- Final state was not practical to reach through the deliberately paced 16-drive UI playthrough. Existing test `src/app.test.tsx:245` confirms modal presence only; final focus/trap/restoration remains an explicit manual gap. OS-level touch gestures and screen-reader announcements were also not performed; conclusions are from measured geometry, keyboard events, DOM/accessibility attributes, and static code.

### Prioritized recommendations (separate from confirmed bugs)

1. P1: implement an accessible board interaction model: one tabbable cell with arrow-key navigation, useful cell/action names and selection state, plus equivalent compact action controls.
2. P1: use a complete modal pattern for Rules, coin toss, and final result (initial focus, trap, Escape where dismissible, inert background, restoration, scroll containment).
3. P2: test announcements from the existing `role="log"`; add explicit polite treatment only for primary status/history changes outside it, plus a skip link, navigable regions, and read-only history semantics.
4. P2: provide visible `:focus-visible` styles, target the robust 44px touch heuristic, and use a mobile board/control strategy that reduces long horizontal travel without hiding board state.
5. P2: confirm destructive New Game or provide undo; ensure legal/selected/power states are conveyed by text/shape and accessibility state, not color alone.

### Accessibility remediation closeout

The P1/P2 implementation work is complete under automated semantic tests, DOM inspection, and rendered Chrome/CDP verification. This is not real-screen-reader validation or accessibility certification. The historical static and rendered observations remain unchanged so the audit continues to show what prompted the work.

| Historical finding | Current disposition and evidence |
|---|---|
| Board keyboard and assistive semantics | Implementation verified. The rendered board exposed 264 named gridcells with exactly one `tabindex="0"` and 263 `tabindex="-1"` cells. ArrowRight moved focus from `0,0` to `1,0` on desktop. Enter selected `14,2`; Space activated target `12,0` and appended an event. CDP pointer activation independently moved `7,0` to `4,0` and appended an event. Selected state exposed `aria-selected="true"`; history exposed `aria-readonly="true"`, `aria-describedby="history-read-only"`, a dashed outline, and an `RO` badge. Actual screen-reader interpretation remains unvalidated. |
| Modal focus, isolation, and dismissal policy | Implementation verified. Rules initially focused Close, trapped forward and reverse Tab, set the entire `#chessball-app` inert (including the skip link), locked body overflow, closed on Escape, and restored focus to Rules; the portaled dialog remained outside the inert wrapper. Coin Toss and Final Result resisted Escape. The final flow gate was exercised through a temporary `initialGame` harness: it showed Home 21 - Away 17, kept focus on its New Game action, then reset to Pregame and focused `#game-workspace`. A controlled two-dialog stack exposed only the top dialog: the lower backdrop was inert and `aria-hidden`, its dialog had no `aria-modal`, closing the top restored the lower dialog's modal semantics and focus, and closing the last restored workspace focus and cleared isolation. |
| Skip navigation, regions, status, and destructive reset | Implementation verified. The first keyboard stop was the visible “Skip to game workspace” link at `(10,10)` with a 3px white outline; activation focused the programmatically focusable workspace heading. Automated DOM coverage verifies the single polite status, named regions, history semantics, and active-match New Game confirmation; audible announcement behavior remains unvalidated with a real screen reader. |
| Focus, non-color cues, and read-only clarity | Implementation verified. Keyboard focus rendered a 3px white outline distinct from the selected 3px gold double outline. Legal movement rendered a 2px gold circular border; kick placement rendered a bordered `K`; a controlled power state rendered two red bordered diamond targets (45-degree transform); history rendered the dashed `RO` treatment. |
| Mobile overflow, horizontal navigation, and touch targets | Implementation verified at 390×844. Document `scrollWidth/clientWidth` was `390/390`. The dedicated `.board-scroller` occupied x=18–372 with `clientWidth=354`, `scrollWidth=860`, and `overflow-x:auto`; its `.field-wrap` parent stayed `overflow-x:visible`, and all 264 cells were present. The toolbar and utility were siblings outside the scroller: both remained fixed at x=18–372 while `scrollLeft=240` moved the board from x=18 to x=-222. The board alone retained `min-width:860px`; representative regular cell `10,5` measured 35.671875×35.46875px with `min-width:0`, documenting the dense-board exception. Manual board `scrollLeft=240` survived an unrelated player-control render, and CDP pointer activation preserved `scrollLeft=300`. ArrowRight from `10,5` to `11,5` moved only `.board-scroller` from 0 to exactly 76px—the same value as a direct nearest-alignment baseline—aligned the cell's right edge to the scroller at x=372, and left document horizontal scroll at 0. All ten measured primary non-board controls were at least 44px high; the four segmented player controls were 57.19×44 or 71.38×44 with computed `min-height:44px`. |
| Modal/mobile scroll containment | Implementation verified. At 390×844 the Rules dialog stayed within x=24–366, body overflow was locked, the application was inert, and both backdrop and dialog computed `overscroll-behavior:contain`. Escape restored focus to Rules and cleared isolation/overflow state. Physical-device overscroll remains unvalidated. |

Fresh automated closeout at final implementation commit `2b8ae781b7ae63ceb8aca7266063de43c149b35f`:

- `npm test`: 8/8 test files and 344/344 tests passed, zero failures; Vitest duration 23.87s.
- `npm run build`: TypeScript and Vite 6.4.3 exited successfully; 1,583 modules transformed in 3.40s. Output was `dist/index.html` 0.39 kB (0.27 kB gzip), CSS 17.64 kB (4.54 kB gzip), and JavaScript 278.60 kB (84.74 kB gzip).
- Rendered verification used the built preview at `127.0.0.1:4387`, Chrome 150.0.7871.114 through CDP 1.3, desktop 1440×900 and mobile 390×844 at device scale 1. Desktop document width was exactly 1440/1440 with no horizontal overflow. Screenshots were captured and inspected ephemerally in both viewports; their in-memory PNG data was discarded and no image or hash was retained.
- A temporary Vite harness at `127.0.0.1:4388` supplied controlled power, final `initialGame`, and stacked-modal states without changing production code. All ordinary navigation, coin, kickoff, placement, return, history, responsive, pointer, and keyboard checks ran against the production build.

The machine-readable command transcript, structured assertions, measurements, controlled-harness recreation description, and limitations are preserved in [`data/2026-07-13-accessibility-rendered-verification.json`](data/2026-07-13-accessibility-rendered-verification.json). Exact rendered commands were:

```sh
npm exec vite -- preview --host 127.0.0.1 --port 4387 --strictPort
chromium --headless --disable-gpu --no-sandbox --remote-debugging-port=9333 --user-data-dir=/tmp/chessball-cdp-9333-integration about:blank
npm exec vite -- --config /tmp/chessball-final-vite.config.mjs
node /tmp/chessball_full_verify.mjs
```

The Node driver connected directly through CDP and used emulation, runtime evaluation, keyboard/mouse dispatch, navigation, and screenshot capture. The driver and controlled harness were ephemeral `/tmp` files, not tracked reusable tooling. Screenshot PNG data was inspected in memory and discarded; no screenshot file or hash was retained or committed. The linked artifact is the durable evidence record.

Limitations remain: this is not certification with a real screen reader, audible announcement behavior and accessibility-tree/browser combinations were not exhaustively tested, and physical-device touch/overscroll behavior was not exercised. The final dialog was rendered and interacted with from a controlled final `initialGame`, not reached by manually completing all 16 drives. These limitations are nonblocking follow-up validation, not claims that those environments were tested.

## Final post-fix verification

- Focused command: 4 test files passed, 222/222 tests passed, zero failures.
- Full command: 7 test files passed, 291/291 tests passed, zero failures.
- Production build: TypeScript exited successfully; Vite 6.4.3 transformed 1,579 modules and emitted the production bundle successfully.
- Formation runner: explicit strict no-emit TypeScript check exited successfully; focused runner tests passed 1 file and 5/5 tests.
- Reproducibility: two documented 20-pair smoke outputs were byte-equivalent at 601,527 bytes each and disclosed 20/20 completed pairs, 40/40 completed games, zero exclusions/stalls/crashes and 59,150 decision opportunities.
- Artifact integrity: all seven tracked JSON files parsed; core reconstruction exactly matched 790,085/1,520,406/1,118,889 actions, 1,830,190/4,214,763/2,928,207 decision opportunities, 110,112/250,474/176,686 formation choices, and 7,742/17,421/15,223 recorded terminal/conversion outcomes for HH/RR/HR. Formation schema `chessball-formation-audit-v2` remained intact with exactly nine screens and two follow-ups, all complete.

## Dependency/project-health note

The existing npm install summary reported 5 vulnerabilities: 3 moderate, 1 high, and 1 critical. This is a project-health observation, not evidence of a gameplay, rules, or UI defect. `npm audit --json` was not rerun during this read-only qualitative task, so no package/advisory attribution is asserted; schedule a dedicated dependency review before updating dependencies.

## 2026-07-14 formation expansion

The fixed formation-opening balance gate ran once with the exact command `npm exec vite-node scripts/run-formation-expansion-audit.ts`. Wall-clock runtime was 837 seconds (13m57s). Configuration was 12 comparison groups × 6 equally weighted opposing formations × 100 matched pairs, 5,000 maximum actions/game, heuristic versus heuristic, and deterministic 10,000-sample 95% paired-bootstrap intervals. The practical thresholds were a 0.05 win-share difference or 1 point of score delta; broad dominance additionally required at least 4/6 same-direction cell point estimates and no credible counter cell.

The run requested and completed exactly 7,200 matched pairs and attempted and completed 14,400 games. It recorded zero excluded pairs, stalls, crashes, or anomalies. The generated, canonical machine-readable evidence is [`data/2026-07-14-formation-expansion-audit.json`](data/2026-07-14-formation-expansion-audit.json). Pooled win share is the primary formation's tie-adjusted share across mirrored games (win=1, tie=0.5, loss=0), with 0.5 neutral; pooled score delta is primary minus comparison, with 0 neutral. Values are rounded to four decimal places; “support” is the same-direction cell count, and counter cells are named by opposing formation.

To regenerate safely and verify exact reproducibility, write the runner's stdout to a temporary file, validate it, then compare it byte-for-byte with the tracked artifact:

```sh
npm exec vite-node scripts/run-formation-expansion-audit.ts > /tmp/chessball-formation-expansion-audit.json
jq -e . /tmp/chessball-formation-expansion-audit.json > /dev/null
cmp --silent /tmp/chessball-formation-expansion-audit.json docs/audits/data/2026-07-14-formation-expansion-audit.json
```

The pooled 95% intervals reported below are per-comparison intervals and are not adjusted for multiplicity across the 12 comparisons. Nominal interval exclusion alone does not trigger tuning: the approved gate also requires the practical effect threshold, at least 4/6 same-direction cell point estimates, and no credible counter cell.

| Comparison | Pooled win share, mean [95% CI] | Pooled score delta, mean [95% CI] | Decisive metric / direction | Support | Credible counters | Classification | Reason |
|---|---:|---:|---|---:|---|---|---|
| Pistol vs Singleback | 0.5400 [0.5088, 0.5704] | 1.0117 [0.4575, 1.5692] | score-delta / primary | 3/6 | 4: 4-3, nickel, bear-front, pressure | split-direction | Only 3/6 cell point estimates support the pooled primary direction. |
| Trips vs Shotgun | 0.4396 [0.4083, 0.4692] | -1.1908 [-1.7267, -0.6833] | win-share / comparison | 5/6 | 4: 4-3, goal-line, bear-front, pressure | credible-counter | 4 opposing cell interval(s) include neutral or favor the opposite direction. |
| Power vs I-Form | 0.4846 [0.4558, 0.5133] | -0.1608 [-0.6192, 0.2975] | — | 0/6 | 0 | inconclusive | Neither pooled 95% interval excludes neutral. |
| Bear Front vs Goal Line | 0.4875 [0.4579, 0.5179] | -0.1975 [-0.6825, 0.2967] | — | 0/6 | 0 | inconclusive | Neither pooled 95% interval excludes neutral. |
| Pressure vs 4-3 | 0.5425 [0.5117, 0.5721] | 0.7425 [0.2142, 1.2633] | — | 0/6 | 0 | sub-threshold | At least one pooled effect is statistically clear but remains below its practical threshold. |
| Deep Shell vs Nickel | 0.5733 [0.5421, 0.6029] | 1.1150 [0.6117, 1.6000] | win-share / primary | 4/6 | 3: shotgun, pistol, trips | credible-counter | 3 opposing cell interval(s) include neutral or favor the opposite direction. |
| Pistol vs Trips | 0.5279 [0.4963, 0.5588] | 0.4692 [-0.0517, 0.9800] | — | 0/6 | 0 | inconclusive | Neither pooled 95% interval excludes neutral. |
| Pistol vs Power | 0.5329 [0.5021, 0.5633] | 0.7217 [0.1967, 1.2492] | — | 0/6 | 0 | sub-threshold | At least one pooled effect is statistically clear but remains below its practical threshold. |
| Trips vs Power | 0.5346 [0.5025, 0.5663] | 0.5242 [-0.0125, 1.0475] | — | 0/6 | 0 | sub-threshold | At least one pooled effect is statistically clear but remains below its practical threshold. |
| Bear Front vs Pressure | 0.5429 [0.5125, 0.5725] | 0.5367 [0.0533, 1.0042] | — | 0/6 | 0 | sub-threshold | At least one pooled effect is statistically clear but remains below its practical threshold. |
| Bear Front vs Deep Shell | 0.5246 [0.4942, 0.5554] | 0.5808 [0.0467, 1.1167] | — | 0/6 | 0 | sub-threshold | At least one pooled effect is statistically clear but remains below its practical threshold. |
| Pressure vs Deep Shell | 0.4846 [0.4538, 0.5146] | -0.1667 [-0.6725, 0.3275] | — | 0/6 | 0 | inconclusive | Neither pooled 95% interval excludes neutral. |

No coordinates were tuned. None of the 12 groups met the approved `broad-dominance` gate: the actionable pooled comparisons were either split across cells or retained credible counters, while the remaining results were inconclusive or below the practical threshold. Favorable individual matchups were not “equalized.”

The statistical conclusion is limited to these formation openings under the fixed heuristic policy and fixed experiment matrix. It is not causal proof, does not enumerate human counter-shifts or adaptive policies, and is not calibration to NFL outcomes.
