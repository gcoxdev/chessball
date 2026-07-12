# Current Project Alignment

## Aligned Areas

- The engine applies the same piece roles and action rules to home and away.
- Seeded simulation already reports home/away results and several starting-condition splits.
- Formation selection, positioning, passing, tackling, kicking, and risk rolls create meaningful decision points.
- The test suite covers the major rule transitions and UI interactions.

## Missing Areas

- Simulations do not directly compare strong and weak policies against each other, so they cannot yet measure a player skill gap.
- Existing balance buckets report correlations but do not run paired mirrored games that isolate team, direction, and kickoff advantages.
- Outcome reporting lacks drive-level rates needed to assess tactical variety and football plausibility.
- There is no physical-play checklist or tabletop bookkeeping assessment.
- The UI has automated interaction coverage but no consolidated accessibility and decision-clarity audit.

## Conflicts

- A simulation may stall yet the command exits successfully, weakening its use as an automated audit.
- Current policy assignment gives heuristic play to one half of seeds and random play to the other, rather than comparing policies under matched conditions.

## Unclear Areas

- The existing heuristic policy may represent plausible play, but its strength relative to random play is not currently measured head-to-head.
- Small-sample score and win-rate warnings may reflect noise rather than a rules imbalance.
- Some engine state may be easy for software to track but burdensome at a physical table.
