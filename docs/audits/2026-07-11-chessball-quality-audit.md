# Chessball quality audit — quantitative evidence

Date run: 2026-07-12. This document records Task 6, the quantitative portion of the 2026-07-11 audit design. The football-flow, physical-tabletop, and UI/accessibility qualitative sections are pending Task 7.

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
# or reproduce all eleven experiments in one compact JSON document
npm exec vite-node scripts/run-formation-audit.ts -- --mode all
```

Compact preserved evidence is in `docs/audits/data/2026-07-11-formation-audit.json`. The full core action distributions and tactic screens are split by matchup in `docs/audits/data/2026-07-11-heuristic-vs-heuristic-screens.json`, `docs/audits/data/2026-07-11-random-vs-random-screens.json`, and `docs/audits/data/2026-07-11-heuristic-vs-random-screens.json`. Each artifact records its command, policy/team strata, seed range, max-actions limit, bootstrap seed/sample/confidence, and runtime.

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

The controlled follow-ups confirmed two formation effects:

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
- Review the heuristic's field-goal/turnover-on-downs behavior and the scoring mix qualitatively in Task 7. Do not tune toward exact NFL rates.
- Treat selected-vs-not-selected tactic cohorts as hypothesis generators; a future causal screen should stratify more tightly and require adequate selected and unselected game counts.
- Task 7 remains responsible for football flow, physical-tabletop viability, and UI/accessibility findings. Those sections are intentionally pending rather than silently omitted.
