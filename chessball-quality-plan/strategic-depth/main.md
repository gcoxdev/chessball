# Strategic Depth

## Main Goal

Better decisions about formations, positioning, field position, and risk should produce a durable advantage over weaker or random play, while no single tactic dominates and dice retain moderate influence.

## Parent Context

- [Parent and root goal](../main.md)

## Status

done

## Planning Depth

Leaf: implementation and verification complete.

## Subgoals

None.

## Links

- [Root goal](../main.md)

## Remaining Nonblocking Recommendations

- Reproduce goal-line and shotgun leads in focused legal states with adaptive counter-formations before considering rule changes.
- Treat tactic cohorts as exploratory leads, not causal estimates.

## Activity Log

- 2026-07-11: Confirmed that balance must preserve a meaningful experienced-player advantage.
- 2026-07-12: Independent home/away policy matchup support started.
- 2026-07-12: Fresh 1,000-pair HR evidence supported the skill gap: heuristic tie-adjusted share 85.25% [83.55%, 86.90%], score delta +5.5195 [5.1965, 5.8395]. Formation screens/follow-ups remained leads; no tactic met the state-level no-counterplay threshold for tuning.
- 2026-07-14: Reopened for a confirmed three-per-side alignment expansion using the fixed roster, with matched dominance screening before acceptance.
- 2026-07-14: Closed after the six-per-side catalog passed geometry and projection tests and the 7,200-pair fixed-policy screen completed all 14,400 games with zero exclusions, stalls, crashes, or anomalies. No comparison met the broad-dominance tuning gate, so no coordinates or gameplay bonuses were changed; the [rendered verification artifact](../../docs/audits/data/2026-07-14-playbook-polish-rendered-verification.json) records the final 418/418 tests, successful 1,583-module production build, and passing Chrome/CDP checks at 1440×900, 390×844, and 320×568.
