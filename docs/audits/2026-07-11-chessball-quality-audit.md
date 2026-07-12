# Chessball quality audit

Date run: 2026-07-12. This document combines Task 6 quantitative evidence with the Task 7 football-flow, physical-tabletop, and UI/accessibility qualitative audit.

## Audit method and evidence rules

All games used the public rule engine through `runMatchedAudit`. Each pair reused one seed. Mirror A assigned the primary policy/plan to home, forced home to win the opening choice and receive; mirror B assigned it to away, forced away to win and receive, and swapped formation-plan identity. Thus home/away, opening receiver, initial direction, policy, and plan identity were reversed together under matched randomness.

Completed pairs alone entered paired intervals. Stalls and crashes were counted separately. Intervals below are deterministic paired bootstraps with 10,000 resamples, 95% confidence, and the stated base seed. Action-limit was 5,000; matches were not shortened. The design thresholds were applied literally: fair-opportunity action requires a CI excluding no advantage and at least five win-share points or one score point; a skill gap requires the stronger policy's CI lower bound above 50%. Formation and tactic statistics are screens, not causal proof or automatic rule-change authority.

The policies are observable simulator policies, not claims about optimal play. `random` samples from bounded legal actions (with required conversions/recoveries and available tackles handled so games remain executable). `heuristic` uses state-aware action ranking, prefers receiving, and makes deterministic/state-dependent formation, movement, kick, pass, handoff, and tackle choices with seeded tie-breaking.

## Reproducibility commands and configuration

Required smoke command (run twice):

```sh
npm run simulate -- --audit --pairs 20 --seed 1 --home-policy heuristic --away-policy random --max-actions 5000 --json
```

The two complete stdout files were byte-equivalent (`cmp` success), 697,396 bytes each. The first run took 8.256 seconds. It completed 20/20 pairs (40/40 games), with no exclusion, stall, or crash.

Core commands:

```sh
npm run simulate -- --audit --pairs 1000 --seed 1001 --home-policy heuristic --away-policy heuristic --max-actions 5000 --json
npm run simulate -- --audit --pairs 1000 --seed 2001 --home-policy random --away-policy random --max-actions 5000 --json
npm run simulate -- --audit --pairs 1000 --seed 3001 --home-policy heuristic --away-policy random --max-actions 5000 --json
```

Seed ranges were respectively 1001–2000, 2001–3000, and 3001–4000. Bootstrap seeds matched each base seed. The concurrent wall times were 638, 476, and 566 seconds; these timings include CPU contention.

Formation screening called `runMatchedAudit` directly. It compared all nine offense/defense plan combinations (offense: `i-form`, `shotgun`, `singleback`; defense: `4-3`, `nickel`, `goal-line`) against `{ offense: i-form, defense: 4-3 }`, using heuristic/heuristic, 100 pairs per matchup, sequential seed blocks 10001–10900, bootstrap seeds 71–79, 10,000 resamples, and maxActions 5,000. The two screened one-factor leads were then repeated at 1,000 pairs: goal-line defense at seeds 20001–21000/bootstrap 91 and shotgun offense at seeds 21001–22000/bootstrap 92.

The exact executable formation definitions are committed in `scripts/run-formation-audit.ts`; they require no source edits between modes:

```sh
npm exec vite-node scripts/run-formation-audit.ts -- --mode screen
npm exec vite-node scripts/run-formation-audit.ts -- --mode followups
# regenerate the canonical artifact byte-for-byte (same code, seeds, and config)
npm exec vite-node scripts/run-formation-audit.ts -- --mode all > docs/audits/data/2026-07-11-formation-audit.json
```

Compact preserved evidence is in `docs/audits/data/2026-07-11-formation-audit.json`. `--mode all` emits that canonical schema directly and deterministically; runtime and timestamps are intentionally excluded from canonical comparison. The full core action distributions and tactic screens are split by matchup in `docs/audits/data/2026-07-11-heuristic-vs-heuristic-screens.json`, `docs/audits/data/2026-07-11-random-vs-random-screens.json`, and `docs/audits/data/2026-07-11-heuristic-vs-random-screens.json`. Each core artifact records its command, policy/team strata, seed range, max-actions limit, bootstrap seed/sample/confidence, and runtime.

## Completion integrity

Every reported sample completed. Core: 3,000/3,000 pairs and 6,000/6,000 games. Formation screen: 900/900 pairs and 1,800/1,800 games. Formation follow-ups: 2,000/2,000 pairs and 4,000/4,000 games. Across these 11,800 games there were zero excluded pairs, stalls, crashes, or simulator anomalies. No attempts were silently substituted for pairs.

## Fair-opportunity results

| Same-policy matchup | Completed pairs | Home win share, paired 95% CI | Home score delta, paired 95% CI | Conclusion |
|---|---:|---:|---:|---|
| heuristic / heuristic | 1,000 | 49.25% [47.425%, 51.15%] | -0.336 [-0.767, 0.102] | no actionable asymmetry |
| random / random | 1,000 | 50.60% [49.15%, 52.025%] | +0.093 [-0.098, 0.286] | no actionable asymmetry |
| heuristic / random | 1,000 | 49.575% [48.725%, 50.425%] | +0.141 [-0.203, 0.481] | no home/opening-direction effect visible despite unequal policy |

All paired CIs include the null (50% win share or zero score delta), and all point effects are below both practical thresholds. Observation: the mirrored starting conditions were close. Statistical conclusion: the target sample supplies no evidence of actionable home, opening-receiver, or direction advantage. Causal limitation: because those conditions reverse together, this audit establishes fair combined opportunity; it does not estimate an isolated kickoff effect independent of direction.

## Skill-gap results

Heuristic versus random completed 1,000 pairs/2,000 games: heuristic 1,855 wins, random 92, and 53 ties. Its tie-adjusted share was 94.075%, paired 95% CI [92.975%, 95.15%]; score differential was +14.511, CI [+13.978, +15.052]. The lower win-share bound is far above 50%, so the design's player-policy skill-gap criterion is supported with a 44.075-point estimated effect. This supports calling the tested heuristic stronger than the tested random baseline; it does not establish optimal play or a desired target gap.

As controls, assigning the identical policy labels as “primary” produced null results: heuristic/heuristic 49.50% [47.15%, 51.90%], and random/random 50.05% [47.75%, 52.425%].

## Formation and tactic screening

The 100-pair balanced screen completed every cell. Against the fixed i-form/4-3 reference, the primary plan's tie-adjusted point shares were: i-form/4-3 47.75%; i-form/nickel 51.25%; i-form/goal-line 81.50%; shotgun/4-3 60.75%; shotgun/nickel 65.75%; shotgun/goal-line 80.75%; singleback/4-3 50.25%; singleback/nickel 61.00%; singleback/goal-line 77.00%. Because plan components combine additively and cells used different seed blocks, these are screening observations, not nine independent causal rankings.

The formation effects were replicated in controlled one-factor follow-ups:

| One-factor plan comparison | Completed pairs | Primary wins / comparison wins / ties | Primary share, paired 95% CI | Score delta, paired 95% CI |
|---|---:|---:|---:|---:|
| i-form + goal-line vs i-form + 4-3 | 1,000 | 1,478 / 460 / 62 | 75.45% [73.325%, 77.50%] | +8.411 [+7.740, +9.074] |
| shotgun + 4-3 vs i-form + 4-3 | 1,000 | 1,217 / 706 / 77 | 62.775% [60.375%, 65.10%] | +3.961 [+3.265, +4.653] |

Observation and statistical conclusion: under this fixed heuristic policy, goal-line defense and shotgun offense are materially stronger than their tested alternatives; 4-3 and i-form are strategically weak in these matchups. This is stronger than raw usage evidence and warrants design/state-level follow-up. It is not a confirmed dominant-tactic defect: fixed formations alter initial geometry, the screen did not enumerate legal counter-shifts or an adaptive counter-policy, and no focused legal state demonstrated lack of counterplay/tradeoff. No formation rule was tuned.

Contextual selection screening retained every threshold crossing in the three core artifacts: HH had 97 contexts at or above 80% and 44 cohorts with at least a ten-point absolute exploratory difference; RR had 78 and 44; HR had 170 and 53. Many high-rate contexts were protocol/forced actions (`coinToss`, kickoff, recovery, `nextDown`, confirmation, and snap), not strategic tactic leads. A representative discretionary HH key, `team=away|policy=heuristic|phase=betweenDowns|down=1|field=midfield|action=kick`, had 1,096 selections in 1,283 opportunities (85.425%). The alternative two-point try remained available in the complement, so selection alone does not show missing counterplay.

Every cohort artifact entry preserves the exact key, policy/team stratum, selections, opportunities, rate, both outcome arms, win-share difference, and a sparse-data label when either arm has fewer than 30 games. For example, HH `team=away|policy=heuristic|phase=betweenDowns|down=1|field=goal-to-go|action=startTwoPointTry` had 64/308 selections; selected games were 49-3-12 and not-selected games 145-4-74, an exploratory +12.987-point win-share difference with at least 30 games in each arm. Cohorts remain game-level and confounded by field position and game strength. They are leads only; no causal dominant-tactic claim is made.

Formation usage in unconstrained heuristic/heuristic play was nearly uniform across all six current IDs. Of 188,988 offensive selections: i-form 63,011 (33.341%), shotgun 63,351 (33.521%), and singleback 62,626 (33.138%). Of 188,988 defensive selections: 4-3 62,889 (33.277%), nickel 63,224 (33.454%), and goal-line 62,875 (33.269%). RR and HR counts/rates are also preserved in their core artifacts. Thus raw usage would have concealed the fixed-plan effects above and was not used to declare dominance.

## Drive, scoring, and action observations

| Matchup (2,000 games each) | Drives | Avg actions/game | TD | FG good | FG missed | INT | safety | turnover on downs |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| heuristic / heuristic | 27,401 | 1,299.876 | 6,082 | 7,395 | 7,402 | 631 | 24 | 1 |
| random / random | 26,434 | 1,136.865 | 1,408 | 1,870 | 14,398 | 623 | 682 | 6,045 |
| heuristic / random | 37,025 | 1,307.236 | 3,110 | 6,861 | 18,014 | 508 | 774 | 4,728 |

These patterns explain part of the skill gap: random play reaches far fewer touchdowns and successful field goals and many more turnovers on downs/safeties. They are descriptive policy outcomes, not targets for NFL calibration. The exceptionally low heuristic/heuristic turnover-on-downs count and frequent field-goal attempts are qualitative football-flow leads for Task 7, not proven transition defects.

Top action totals were consistent with a board movement game. Heuristic/heuristic recorded 566,904 moves from 209,768,010 opportunities (0.2703%), 432,823 tackles from 1,494,480 (28.961%), and 126,091 kicks from 795,853 (15.844%). Random/random recorded 434,757 moves from 114,374,467 (0.3801%), 338,667 tackles from 995,937 (34.005%), and 41,053 kicks from 1,035,714 (3.964%). Mixed HR recorded 472,076 moves from 158,272,994 (0.2983%), 391,532 tackles from 1,201,495 (32.587%), and 79,221 kicks from 1,060,446 (7.471%). Complete HH, RR, and HR distributions cover all 16 observed action types and include selected totals, opportunity totals, and rates in the three matchup artifacts cited under Reproducibility.

## Confirmed quantitative bugs and fixes

None. Seed reproducibility, completion integrity, and matched fair opportunity passed. The large formation effects are statistical/design-level leads and do not meet the required focused-state/counterplay/root-cause threshold for modifying `rules.ts`. Accordingly no engine or test source was changed, no failing rule regression was manufactured, and there is no rule-fix commit.

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
| Touchback, out-of-bounds, touched kick, return | `placeKick` branches at `src/engine/rules.ts:910-953`; return pickup/touch at `:712-733`; return ranges/path rules at `:1101-1180`. Touchback is own 25 (`:1318`). | `:1125` touchbacks; `:1155` receiver pickup; `:1178` coverage touch; `:1203`, `:1233`, `:1252`, `:1278` return movement/path/spot/range | Rules `src/main.tsx:679` | Mechanics aligned, but kickoff touchback/OOB/touched-kick drive accounting is a **confirmed defect** below. No focused OOB symmetry test: coverage gap. |
| Possession and alternating turns | `snap` starts offense (`src/engine/rules.ts:643-652`); successful/failed actions generally call `alternateTurn`; turnovers explicitly set team/direction/turn. | `:1413` snap/alternation; interception `:1548`; kick-return turnover `:1301` | Rules `src/main.tsx:681-682` | Aligned. One-action alternation is a deliberate board-game abstraction. |
| Formations, confirmation, shifts, snap | Choice/confirm `src/engine/rules.ts:563-598`; confirmed side receives two shifts, cannot cross LOS (`:682-698`); both sides required to snap (`:643-652`). | `:82`, `:100`, `:117`, `:129`, `:1431`; end-zone projection `:1397` | Rules `src/main.tsx:680`; controls `:380-410` | Ambiguity: rules say “change freely, then confirm” but omit the two post-confirmation shifts and how their destinations are judged. Quantitative screen found goal-line defense and shotgun materially stronger under the fixed policy (Formation section), a design risk, not a defect. |
| Movement, power movement, blocking | Role movement and sliding at `src/engine/rules.ts:1101-1154`, power paths/targets at `:1373-1419`; contact target rises with contacts; offense range penalty while it controls ball. | `:153`, `:162`, `:175`, `:182`, `:201`, `:219`, `:236` | Rules `src/main.tsx:685-688` | Aligned abstraction. Board adjudication needs role/path reference cards; “square radius,” orthogonal turns, sliding, and power-contact counting are not fully defined in prose. |
| Handoff and pass | Adjacent handoff `src/engine/rules.ts:956-968`; forward/backward classification and LOS/once-per-down `:775-853`; 2d6 target is `5 + distance` capped at 12 (`:1207-1213`); traffic ignored; snake-eyes interception within distance 1 (`:855-859`). | Handoff/recovery `:495`; completion `:261`; eligibility `:284`; TD `:302`; traffic `:329`, `:351`; incomplete/spot `:374`, `:399`, `:444`; second forward pass `:425`; INT `:470` | Rules `src/main.tsx:685`, `:689-691` | Aligned hybrid. Backward passes still use a pass roll and can be incomplete; recognizable but abstract. No explicit left/right mirror test for passing: coverage gap. |
| Tackle, power tackle, fumble/recovery | Approach/path/target `src/engine/rules.ts:1019-1066`, `:1156-1180`, `:1215-1218`; 12 causes immediate defender recovery; loose recovery `:1069-1100`. | `:605`, `:620`, `:645`, `:664`, `:700`, `:726`; loose recovery `:495`; return strip `:1301` | Rules `src/main.tsx:692-694` | Aligned abstraction. A “fumble” is effectively an automatic strip turnover rather than a loose-ball contest; ordinary loose recovery exists but is not reached by that result. |
| Downs, first down, LOS, turnover on downs | Stop/first-down logic in `endPlayOrTurnover` (`src/engine/rules.ts:1461-1486`); next formation/reset `startNextDown` (`:346-421`); two columns=10 yards (`:193-196`). | `:53`; `:857`; `:1442`, `:1462`, `:1483`; turnover `:1504`, `:1526` | Rules `src/main.tsx:683`, `:691`, `:697` | Mostly aligned, including both directions. Ambiguity: LOS is placed “in front of” stopped ball, but the Rules dialog does not explain the edge/column convention shown by UI markers. |
| Punt and field goal | Punt any down to 2d6 placement/return (`src/engine/rules.ts:996-1013`); FG 2d6 vs `5 + distance`, capped 12, immediate 3 points or turnover at kick spot (`:970-994`, `:1220-1226`). | Punt `:1326`; FG/safety/downs `:770`; missed FG `:808`; post-FG kickoff `:966` | Rules `src/main.tsx:684`, `:695`; controls `:432-437` | Aligned hybrid. Any-down availability preserves choice, but capped targets make all very long attempts equally difficult (12) and fixed-policy FG frequency is a balance lead, not a confirmed defect. |
| TD, extra point, two-point try, safety | TD checks on move/power/pass (`src/engine/rules.ts:735-740`, `:764-769`, `:847-850`); XP fixed target 5 (`:862-878`); two-point formation/finish (`:655-679`, `:1498-1505`); safety on successful tackle in carrier’s own end zone (`:1032-1037`). | TD `:755`; XP `:825`, `:844`, `:945`; two point `:876`, `:894`, `:919`; safety in `:770` | Rules `src/main.tsx:695-697` | Aligned abstraction. Rules call the two-point start “from the goal line,” while engine uses the adjacent conversion line (`src/engine/rules.ts:1322-1324`): player-facing ambiguity. |
| Drive completion/accounting | `driveCompletes` at `src/engine/rules.ts:1302-1315`, increment at `:1250-1257`; checked on `startNextDown` at `:362`. | Ordinary stops do not consume drive `:857`; quarter accounting `:1364`, final `:1379`; touchback test `:1125` omits counter assertion. | Rules `src/main.tsx:676`, `:697`; status `:366-370` | **Confirmed defect:** kickoff terminal states count the receiving team’s drive before its offense plays. Scoring conversions are also classified as drive-completing, but the counter saturates at two; this coupling is fragile/ambiguous. |
| Quarters, halftime, final | Two completed drives/team/quarter; quarter advance/final and halftime kickoff at `src/engine/rules.ts:1260-1291`. Halftime kicker is opposite opening kicker, therefore opening receiver kicks to opening kicker. | `:1346`, `:1364`, `:1379`; mirror kickoff formation `:590` | Rules `src/main.tsx:676`, `:696`; final modal `:641-664` | Intended halftime possession is aligned. Boundary tests cover formation projection at both end zones (`:1397`); score tie final state is supported in UI label logic (`src/main.tsx:1457-1465`). Final timing inherits the confirmed drive-accounting bug. |

### Confirmed qualitative rule defect

**Kickoff terminal states consume a receiving drive before scrimmage play (high).** Reproduction: construct a kickoff placement with home kicking to away, place a 12-column kick at `{x:22,y:5}`, then call `startNextDown`; result is `touchback`, away is placed at its 25, and `drivesThisQuarter.away` changes from 0 to 1 before a formation snap. This follows the same public transition exercised by `src/engine/chessball.test.ts:1125-1142`. Root-cause trace: `placeKick` assigns possession to away and ends the play as `touchback` (`src/engine/rules.ts:928-939`) → `startNextDown` calls `driveCompletes`/`markDriveComplete` (`:362`) → `driveCompletes` explicitly includes `touchback`, `kickOutOfBounds`, and `kickTouched` (`:1312-1314`) → `markDriveComplete` increments current possession (`:1250-1256`). Working comparison: a normal returned kickoff remains `kickReturn`, and the eventual tackle ends an actual receiving drive; ordinary stopped downs do not increment (`src/engine/chessball.test.ts:857`). Single confirmed hypothesis: kickoff-resolution results are incorrectly classified as drive-ending offensive results. No source fix was made.

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

| Walk-through / friction | Classification | Severity | Evidence and non-binding tabletop aid |
|---|---|---:|---|
| Setup, coin, kickoff | Practical | Low | 22 preset coordinates and a coin are direct; formation diagrams and a kickoff setup card prevent repeated coordinate lookup. |
| Formation selection and two post-confirmation shifts | Burdensome | Medium | Players must rebuild all 22 pieces every normal down and remember confirmation/remaining shifts. Formation mats plus two shift tokens/team preserve the choice. |
| Ordinary/power movement and blockers | Ambiguous | High | Six role patterns, offense -1, sliding versus orthogonal-with-one-turn, friendly traversal, occupied lanes, and power contacts create frequent path disputes. A role card with path examples and a straightedge/string for contested paths would help. |
| Pass/tackle/kick calculations | Burdensome | High | Chebyshev (“diagonal first”) distance, role ranges, LOS direction, blockers, targets, caps, and special 2/12 outcomes require arithmetic/lookup most actions. A distance ruler and compact target table preserve dice strategy. |
| Kick landing | Practical | Low | Sum 2d6, advance exactly that many columns, choose row; mark the landing square. Board-edge clamping should be stated on the reference. |
| Loose kick/recovery/possession | Ambiguous | Medium | Kick-return pickup is by moving onto the square, coverage touch kills the play, and double-six “fumble” is already recovered. Use a loose/controlled ball token and a dead-kick reminder. |
| Down, LOS, first down | Burdensome | Medium | “In front of ball” depends on direction; goal-to-go and edge clamping add exceptions. Down dial plus offense-facing LOS and gain-edge markers reduce memory. |
| Drives, quarters, halftime, score/conversions | Burdensome | High | Two completed drives/team/quarter, special halftime receiver logic, conversions, and the confirmed kickoff-count bug make a score sheet essential. Use separate completed-drive tracks; correct the classifier before relying on the reference. |
| Randomness | Practical | Low | All core randomness is coin/2d6 and is physically reproducible. Computer policy/autoplay/history are optional conveniences, not required for human play. |

Overall: playable with ordinary tabletop materials, but currently reference-heavy. The repeated full re-formation and path/target adjudication are the chief burdens; no hidden-information mechanic requires a computer. Hidden state is public but easy to forget: turn, possession, forward-pass-used, formation confirmations/shifts, conversion state, down/quarter, drive counts, and pending kick distance.

## UI and accessibility audit

### Method, tools, viewports, and limitations

Static review covered `src/main.tsx` and `src/styles.css` against the current Vercel Web Interface Guidelines fetched 2026-07-12 from <https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md>. Rendered inspection used Vite 6.4.3 at `127.0.0.1:4173`, headless Chromium/ChromeDriver 150, desktop requested 1440×900 (reported content viewport 1440×757 before browser-window correction), and mobile emulation requested 390×844. Desktop pregame DOM/layout was inspected with mouse-equivalent activation and programmatic focus/state queries. The driver became unreachable during modal/mobile interaction, so formation/live/history visual states, actual touch gestures, full Tab traversal, focus restoration, and the final modal were **not** claimed as rendered checks; those states were assessed statically and from existing UI tests only. No screenshot is evidence for an unperformed check.

### Static findings

#### `src/main.tsx`

- P1 `src/main.tsx:488-527` — 264 board buttons use `role="gridcell"` but have no accessible name beyond browser-dependent `title`, no roving-tabindex/arrow-key grid model, and every cell enters sequential Tab order; keyboard board play is impractical.
- P1 `src/main.tsx:607-624`, `:653-665`, `:670-700` — modal backdrops do not trap focus, set initial focus, restore trigger focus, handle Escape, or make background inert. Coin/final dialogs have no close path other than completing/resetting the flow.
- P2 `src/main.tsx:570-575`, `:352-375`, `:478-486`, `:781-782` — changing action message, phase/turn/score/status, history position, and event entries lack an `aria-live` announcement; `role="log"` alone does not cover the primary status changes reliably.
- P2 `src/main.tsx:350-378` — `<main>` exists, but there is no skip link and the major workspace/field regions have no navigable heading hierarchy; keyboard users must traverse hundreds of cells.
- P2 `src/main.tsx:540-542` — “New Game” immediately destroys match/history without confirmation or undo; distinction from pregame reset is visual/text only.
- P2 `src/main.tsx:511-527` — legal/selected/power/ball states depend heavily on visual styling; cells do not expose selected piece, coordinate, team/role, legal action, or disabled/read-only history state through `aria-selected`, names, or descriptions.
- P2 `src/main.tsx:579-588` — opening/closing dialogs does not preserve trigger references, so focus restoration is absent; conditional removal can return focus to `body`.
- P3 `src/main.tsx:409-461`, `:536-562`, `:613-620`, `:660-673` — Lucide icons paired with text are not consistently marked `aria-hidden`; they can add redundant accessible content depending on SVG behavior. History icons correctly use `aria-hidden` at `:768-778`.
- P3 `src/main.tsx:485`, `:570-575`, `:767-781` — viewing history is labeled, but board cells remain operable-looking and focusable; status should expose read-only mode programmatically.

#### `src/styles.css`

- P1 `src/styles.css:1041-1057` — mobile field remains `min-width:860px` inside horizontal overflow; at 390px the board requires extensive two-axis navigation and controls/status are spatially separated from play.
- P2 `src/styles.css:165-180`, `:991-1004`, `:1014-1027` — controls are 34–38px high, below a robust 44px touch target; no `touch-action: manipulation` or intentional tap-highlight policy.
- P2 `src/styles.css:883-903` — modal lacks `overscroll-behavior: contain`; body/background scrolling and interaction are not locked.
- P2 `src/styles.css:30-32`, `:165-180`, `:991-1004`, `:1014-1027` — no general `:focus-visible` treatment for buttons/grid cells; only selected pieces receive an outline (`:833-835`), which is selection, not keyboard focus.
- P3 `src/styles.css:121-123`, `:792-803`, `:825-835`, `:879-881` — active team/legal/power/target cues rely substantially on color; board text/accessible descriptions must carry the same distinctions.
- P3 `src/styles.css:1-14` — dark `color-scheme` is correctly declared; no animation/transition rules exist, so reduced-motion handling is not currently required.

### Rendered observations

- Desktop, headless Chromium, 1440-wide content: pregame rendered all score/status, history, 24×11 board, and setup controls; DOM body width was 1425px at a 1440px viewport with no observed horizontal overflow. The board exposed 274 total buttons (264 cells plus controls), confirming the severe sequential-keyboard burden.
- Desktop initial focus was `body`, not the Start Game primary action. The pregame field was readable visually at desktop width, but the square buttons exposed coordinate-only `title` and no useful accessible names.
- Modal, formation, live controls, history stepping, full keyboard sequence, and final state were not completed in rendered inspection because the ChromeDriver endpoint failed mid-run. Existing component tests cover opening coin/rules dialogs, formation controls, action commands, history stepping, and final-modal presence (`src/app.test.tsx:188`, `:199`, `:245`, `:259`, `:300`, `:615`, `:780`) but do not substitute for focus/touch inspection.
- Mobile 390×844 rendering could not be completed after the driver failure. Static CSS deterministically sets the board to at least 860px (`src/styles.css:1051-1056`), so horizontal scrolling is expected; precise clipping, sticky-control behavior, touch activation, and modal scroll behavior remain a manual follow-up, not a claimed observation.

### Prioritized recommendations (separate from confirmed bugs)

1. P1: implement an accessible board interaction model: one tabbable cell with arrow-key navigation, useful cell/action names and selection state, plus equivalent compact action controls.
2. P1: use a complete modal pattern for Rules, coin toss, and final result (initial focus, trap, Escape where dismissible, inert background, restoration, scroll containment).
3. P2: add polite live regions for action/status/event changes, a skip link and navigable regions, and explicit read-only history semantics.
4. P2: provide visible `:focus-visible` styles, 44px touch targets, and a mobile board/control strategy that reduces long horizontal travel without hiding board state.
5. P2: confirm destructive New Game or provide undo; ensure legal/selected/power states are conveyed by text/shape and accessibility state, not color alone.

## Dependency/project-health note

The existing npm install summary reported 5 vulnerabilities: 3 moderate, 1 high, and 1 critical. This is a project-health observation, not evidence of a gameplay, rules, or UI defect. `npm audit --json` was not rerun during this read-only qualitative task, so no package/advisory attribution is asserted; schedule a dedicated dependency review before updating dependencies.
