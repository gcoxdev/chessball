# Plausible Football

## Main Goal

Possession, downs, scoring, kicks, turnovers, and tactical risk should feel recognizably like football without adding unnecessary complexity or requiring exact professional-football statistics.

## Parent Context

- [Parent and root goal](../main.md)

## Status

done

## Planning Depth

Leaf: ready for implementation planning.

## Subgoals

None.

## Links

- [Root goal](../main.md)

## Remaining Nonblocking Recommendations

- Review scoring mix and field-goal behavior with adaptive policies without targeting exact NFL rates.
- Clarify documented formation shifts, conversion-line wording, and kick-edge behavior.

## Activity Log

- 2026-07-11: Confirmed hybrid realism: recognizable football behavior without simulation-level complexity.
- 2026-07-12: Audited every major football flow. Fixed and regression-tested completed-drive ownership for kickoffs, punts, transfers, scoring, and quarter/final boundaries; refreshed post-fix outcome evidence documents remaining abstractions and coverage risks.
- 2026-07-14: Reopened to measure field goals through the ten-yard end zone to the depicted posts and make the distinction explicit in the rules.
- 2026-07-14: Closed after one canonical engine helper, mirrored kick regressions, computer-policy coverage, and clarified rules/results verified distance through the ten-yard end zone to the posts while preserving extra points and possession flow. Final evidence includes 418/418 tests and a successful production build.
