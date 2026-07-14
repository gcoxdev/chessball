# Chessball Playbook and Presentation Polish Design

## Purpose

Make a focused improvement pass over four related issues: action badges must not deform player pieces, field-goal distance must match the drawn goalposts, the Chessball heading needs a stronger sports identity, and the formation library needs a small strategic expansion that remains approachable and balanced.

This work reopens the existing Strategic Depth, Plausible Football, and UI Quality goals. It does not create a new gameplay subsystem.

## Design Principles

- Preserve the fixed eleven-piece roster and all existing movement/action rules.
- Add strategic choices through starting geometry, not formation-specific bonuses.
- Prefer native, accessible controls over a custom playbook interface.
- Preserve all existing formations and their coordinates.
- Keep the hybrid game simple enough for digital and physical-board play.
- Treat balance evidence as a screen for dominance and broken geometry, not a mandate for equal outcomes.

## Formation Library

### Existing presets retained

Offense retains I-Form, Shotgun, and Singleback. Defense retains 4-3, Nickel, and Goal Line. Their IDs, names, positions, default ordering, and behavior remain backward compatible.

### New offensive alignments

- **Pistol:** The quarterback remains deeper than under center while the running back aligns behind or close to the quarterback. It should offer balanced run/pass development without spreading every eligible receiver wide.
- **Trips:** Both wide receivers and the tight end overload one side at distinct rows, creating passing lanes and a deliberate weak side. The remaining backs protect the interior or provide check-down options.
- **Power:** The fullback and tight end align compactly near the line and the receivers play narrower than in spread looks. It should favor blocking lanes and short-yardage development without granting a rules bonus.

### New defensive alignments

- **Bear Front:** The five fixed defensive-line pieces compress toward the interior to challenge central running lanes, leaving more space outside.
- **Pressure:** The outside linebacker and strong safety align closer to the line to threaten pursuit or power tackles, accepting reduced deep coverage.
- **Deep Shell:** Corners and safeties align deeper and wider against passes, accepting softer underneath space and slower run support.

These are alignment names, not substitution packages. Chessball will not claim literal Dime, 3-4, Jumbo, or other personnel packages while its dual-role roster remains fixed.

### Geometry constraints

Every new preset must:

- contain exactly one coordinate for each existing piece ID required by `Formation.positions`;
- contain no duplicate coordinates;
- remain within rows 0–10 after projection in either field direction;
- keep offense and defense on their legal sides of the line of scrimmage;
- use the existing projection and end-zone clamping rules without special cases;
- preserve two post-confirmation shifts per side and all current snap requirements.

No preset changes roles, movement, dice targets, legal actions, or roster composition.

## Formation Selection UI

Each offensive and defensive button row becomes a labelled native `select`. The selector uses formation IDs as values and resolves the selected formation through the same engine catalog used by legal actions, computer policy, simulations, and history.

Changing the selection immediately invokes the existing formation-choice path and previews the positions on the board. Confirmation remains a separate button. Once a side is confirmed or otherwise not human-editable, its selector remains disabled under the same conditions as the current buttons.

Each `Formation` gains a concise strategic description. The active description appears directly beneath its selector and is programmatically associated with the control. The confirmed/pending status remains visible and accessible. No formation diagrams, searchable custom combobox, modal, playbook editor, or saved custom formations are added.

Computer-controlled teams continue choosing from the complete catalog. Selection rotates or samples across all available presets without giving newly added formations an artificial preference.

## Field-Goal Distance

The board draws each goalpost at the outer edge of a two-column, ten-yard end zone. Field-goal distance therefore changes from distance to the near goal line to distance to the goalposts at the back of the end zone.

For either direction:

1. Compute the existing number of five-yard columns from the kicker to the near goal line.
2. Add two columns for the ten-yard end zone.
3. Feed that distance into the unchanged field-goal requirement formula, `5 + ceil(distance / 2)`.

Adding two columns raises every field-goal target by exactly one. Made/missed outcomes, scoring, possession changes, drive accounting, and miss spot remain unchanged. Extra-point resolution remains unchanged.

The Rules dialog must distinguish the touchdown goal line from the field-goal target: touchdowns cross the near goal line; field goals measure through the ten-yard end zone to the posts at the back edge. Field-goal action/result text should expose the measured distance and required target wherever the existing roll summary supports it.

This matches the field drawing and the real-field relationship in which the end line is ten yards behind the goal line and the goalposts are behind the end line. It intentionally does not add a separate seven-yard holder offset because Chessball models the ball-controlling piece as the kicker.

## Board Action Badges

The current pass/tackle CSS reserves horizontal room by changing the player piece inset, which visibly narrows the piece. Remove that layout coupling.

Pass (`P`) and tackle (`T`) indicators remain compact bottom-left overlays on the square. They sit above the piece background but do not alter the piece's inset, width, height, centering, or role text. The football marker remains top-right. Kick and read-only indicators keep their existing non-conflicting behavior.

Pointer, keyboard, accessible-name, and action semantics remain unchanged; this is a visual layering correction.

## Chessball Wordmark

The accessible level-one heading remains the literal text `Chessball`. Its visual presentation becomes a compact athletic wordmark:

- condensed, heavy system-font stack with no downloaded font dependency;
- slight forward skew to imply motion;
- gold edge/highlight and dark depth shadow using the established palette;
- restrained speed-line or football-lace accent created with CSS;
- sufficient contrast and a clear `:focus-visible` treatment when used as the skip-link target.

The design must not copy the NFL shield, stars, exact lettering, protected color composition, or any league/team mark. It should preserve the current scoreboard height at desktop widths and wrap safely without causing mobile overflow.

## Data and Component Boundaries

- `src/engine/types.ts`: add the formation description field.
- `src/engine/rules.ts`: retain the canonical formation catalogs, add six presets, and change the field-goal distance helper.
- `src/main.tsx`: render the selector/description, clarify Rules and field-goal feedback, and add minimal wordmark structure if CSS pseudo-elements alone are insufficient.
- `src/styles.css`: selector/description styling, wordmark styling, and non-deforming badge layering.
- Existing simulator and formation-audit code consumes the expanded catalogs rather than maintaining a duplicate list.

Avoid broader extraction or refactoring unless a directly touched unit cannot be tested cleanly in place.

## Validation and Balance Gate

Implementation follows test-driven development.

### Automated behavior coverage

- Existing formation IDs and coordinates are unchanged.
- Each new preset contains all pieces, unique coordinates, legal relative geometry, and valid projection in both directions and near both end zones.
- Selector changes preview through the existing action path; confirmation and disabled states remain correct.
- Formation descriptions match the selected option and are accessible.
- Computer selection can reach every preset without hard-coded three-item assumptions.
- Field-goal distance adds exactly two columns in both directions and raises the required target by one at representative kick spots.
- Extra points, missed-field-goal turnover spots, scoring, drive ownership, and kickoff flow remain unchanged.
- `P` and `T` badges do not change the computed/declared piece inset.
- The heading retains the accessible name `Chessball`.

### Formation evidence

Run deterministic placement validation and matched fixed-formation simulations covering every new formation against the existing and new opposing catalog. All games used for conclusions must complete without invalid states or stalls.

A new preset is a tuning candidate when it produces a practically large, statistically supported aggregate advantage across varied opposing formations. It is acceptable for a preset to have favorable matchups. It is not acceptable for one preset to dominate broadly without credible counter-formations. If a lead appears, inspect focused legal states and adjust coordinates before changing core movement or dice rules.

### Rendered checks

Verify desktop and mobile layouts in Chromium:

- selectors and descriptions fit without crowding confirmation controls;
- the wordmark remains legible and does not enlarge or overflow the score strip;
- pass/tackle badges overlay without deforming or hiding player role text;
- keyboard focus, selector labels/descriptions, and mobile touch targets remain intact.

## Goal-Tree Alignment

- **Strategic Depth:** formation expansion adds counterplay choices and requires dominance screening.
- **Plausible Football:** field goals measure to the depicted posts and rules distinguish goal line, end zone, and end line.
- **UI Quality:** scalable formation selectors, corrected badges, and a stronger wordmark improve clarity without undoing accessibility work.

The root goal and these three branches return to `in-progress` while the design is planned and implemented. Fair Opportunity and Physical-Board Viability remain done; the changes must preserve their verified constraints.

## Exclusions

- Personnel substitutions or role remapping.
- Literal Dime, 3-4, Jumbo, or other packages that require a different roster.
- Formation-specific statistical bonuses or dice modifiers.
- Custom formation editing, saving, importing, or diagrams.
- New fonts, icon packages, UI libraries, or runtime dependencies.
- Changes to passes, tackles, movement, downs, game length, home/away opportunity, or extra-point mechanics.
- Exact NFL statistical calibration or trademark imitation.

## Research Basis

- NFL Football Operations describes the end line as ten yards beyond the goal line and the goalposts as behind the end line: <https://operations.nfl.com/rules-officiating/nfl-football-basics/football-terms>.
- NFL Football Operations illustrates common offensive/defensive structure, including 4-3, 3-4, and nickel terminology: <https://operations.nfl.com/rules-officiating/nfl-football-basics/formations>.
- NFL tracking-data materials recognize offensive formation families including I-Form, Shotgun, Singleback, Pistol, Jumbo, Empty, and Wildcat; Chessball uses only alignment concepts compatible with its fixed roster: <https://operations.nfl.com/media/4204/bdb_ploenzke.pdf>.
