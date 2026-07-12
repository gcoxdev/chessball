# Graph Report - .  (2026-07-11)

## Corpus Check
- Corpus is ~31,477 words - fits in a single context window. You may not need a graph.

## Summary
- 349 nodes · 799 edges · 18 communities
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 6 edges (avg confidence: 0.83)
- Token cost: 180 input · 350 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Simulation Strategy|Simulation Strategy]]
- [[_COMMUNITY_Core Movement Rules|Core Movement Rules]]
- [[_COMMUNITY_Game State Types|Game State Types]]
- [[_COMMUNITY_Application UI|Application UI]]
- [[_COMMUNITY_Play Resolution|Play Resolution]]
- [[_COMMUNITY_Project Dependencies|Project Dependencies]]
- [[_COMMUNITY_TypeScript Configuration|TypeScript Configuration]]
- [[_COMMUNITY_UI Labels and Dialogs|UI Labels and Dialogs]]
- [[_COMMUNITY_Formation and Drives|Formation and Drives]]
- [[_COMMUNITY_Test Suites|Test Suites]]
- [[_COMMUNITY_Simulator CLI|Simulator CLI]]
- [[_COMMUNITY_Computer Player Logic|Computer Player Logic]]
- [[_COMMUNITY_Board Status UI|Board Status UI]]
- [[_COMMUNITY_Board Display State|Board Display State]]
- [[_COMMUNITY_Down and Distance|Down and Distance]]
- [[_COMMUNITY_HTML Entry Point|HTML Entry Point]]

## God Nodes (most connected - your core abstractions)
1. `applyAction()` - 27 edges
2. `passBall()` - 20 edges
3. `tackle()` - 19 edges
4. `appendAction()` - 19 edges
5. `simulateGame()` - 16 edges
6. `compilerOptions` - 16 edges
7. `startNextDown()` - 15 edges
8. `movePiece()` - 15 edges
9. `powerMove()` - 15 edges
10. `kick()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `progressScore()` --calls--> `isTouchdownSquare()`  [EXTRACTED]
  src/engine/simulator.ts → src/engine/rules.ts
- `readyFormation()` --calls--> `applyAction()`  [EXTRACTED]
  src/engine/chessball.test.ts → src/engine/rules.ts
- `liveGame()` --calls--> `applyAction()`  [EXTRACTED]
  src/engine/chessball.test.ts → src/engine/rules.ts
- `simulateGame()` --calls--> `createGame()`  [EXTRACTED]
  src/engine/simulator.ts → src/engine/rules.ts
- `createOpeningGame()` --calls--> `createGame()`  [EXTRACTED]
  src/main.tsx → src/engine/rules.ts

## Import Cycles
- None detected.

## Communities (18 total, 0 thin omitted)

### Community 0 - "Simulation Strategy"
Cohesion: 0.07
Nodes (55): defensiveFormations, offensiveFormations, actionSummary(), BalanceAccumulator, BalanceReport, ballCoord(), BatchPolicySummary, bestCarrierMove() (+47 more)

### Community 1 - "Core Movement Rules"
Cohesion: 0.07
Nodes (55): addSliding(), adjacent(), assertNever(), baseMovementRange(), canAttemptTackle(), canLegallyPassToReceiver(), canPowerMove(), canPowerTackle() (+47 more)

### Community 2 - "Game State Types"
Cohesion: 0.06
Nodes (35): BallState, Board, ChooseFormationAction, ChooseKickoffChoiceAction, CoinFace, CoinTossAction, CoinTossState, ConfirmFormationAction (+27 more)

### Community 3 - "Application UI"
Cohesion: 0.07
Nodes (17): compareRouteMoves(), EventEntry, finalResultLabel(), FinalResultModal(), flipActualCoin(), HistoryEntry, isNumberedYardLine(), nearestDefenderDistance() (+9 more)

### Community 4 - "Play Resolution"
Cohesion: 0.25
Nodes (30): addScore(), alternateTurn(), appendAction(), applyAction(), clamp(), confirmFormation(), defaultRoll(), directionFor() (+22 more)

### Community 5 - "Project Dependencies"
Cohesion: 0.08
Nodes (24): dependencies, lucide-react, react, react-dom, typescript, vite, @vitejs/plugin-react, devDependencies (+16 more)

### Community 6 - "TypeScript Configuration"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, allowSyntheticDefaultImports, esModuleInterop, forceConsistentCasingInFileNames, isolatedModules, jsx, lib (+10 more)

### Community 7 - "UI Labels and Dialogs"
Cohesion: 0.16
Nodes (17): activeRoleCode(), actionLabel(), ballLabel(), capitalize(), CoinFaceDisplay(), CoinTossDialog(), coordLabel(), describeAction() (+9 more)

### Community 8 - "Formation and Drives"
Cohesion: 0.21
Nodes (17): chooseFormation(), chooseKickoffChoice(), driveCompletes(), findFormation(), formationPieces(), kickoffCoverageCoords(), kickoffFormationPieces(), kickoffReturnCoords() (+9 more)

### Community 9 - "Test Suites"
Cohesion: 0.21
Nodes (8): liveGame(), readyFormation(), createGame(), Action, Coord, Piece, createOpeningGame(), createPregameGame()

### Community 10 - "Simulator CLI"
Cohesion: 0.29
Nodes (8): BalanceBucket, CliOptions, formatCounts(), formatPercent(), options, printBalanceGroup(), printReport(), report

### Community 11 - "Computer Player Logic"
Cohesion: 0.31
Nodes (9): chooseComputerAction(), chooseComputerKickPlacement(), chooseComputerPass(), chooseRouteDevelopmentMove(), fieldGoalTargetNumber(), pickFromTopSeeded(), pickSeeded(), recentMovingPieceIds() (+1 more)

### Community 12 - "Board Status UI"
Cohesion: 0.29
Nodes (7): App(), downStatusClass(), markerYardLabel(), MatchProgress, showsScrimmageMarkers(), squareClass(), tackleActions()

### Community 13 - "Board Display State"
Cohesion: 0.33
Nodes (6): boardDisplayGame(), chooseComputerFormationAction(), directionForUi(), hideStoppedChangeOfPossessionBall(), otherTeamForUi(), stoppedPreviousPossession()

### Community 14 - "Down and Distance"
Cohesion: 0.50
Nodes (4): moveDistanceToFirstDown(), ballCoord(), downDistanceLabel(), isGoalToGo()

### Community 15 - "HTML Entry Point"
Cohesion: 0.67
Nodes (4): Chessball HTML Document, Main TypeScript Application Entry Point, Responsive Viewport Configuration, Application Root Mount Point

## Knowledge Gaps
- **83 isolated node(s):** `name`, `version`, `private`, `type`, `dev` (+78 more)
  These have ≤1 connection - possible missing edges or undocumented components.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `applyAction()` connect `Play Resolution` to `Simulation Strategy`, `Core Movement Rules`, `Application UI`, `Formation and Drives`, `Test Suites`, `Computer Player Logic`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **Why does `createGame()` connect `Test Suites` to `Simulation Strategy`, `Core Movement Rules`, `Application UI`, `Play Resolution`, `Formation and Drives`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `startNextDown()` connect `Formation and Drives` to `Simulation Strategy`, `Core Movement Rules`, `Application UI`, `Play Resolution`, `Test Suites`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **What connects `name`, `version`, `private` to the rest of the system?**
  _83 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Simulation Strategy` be split into smaller, more focused modules?**
  _Cohesion score 0.06838106370543542 - nodes in this community are weakly interconnected._
- **Should `Core Movement Rules` be split into smaller, more focused modules?**
  _Cohesion score 0.06516290726817042 - nodes in this community are weakly interconnected._
- **Should `Game State Types` be split into smaller, more focused modules?**
  _Cohesion score 0.05555555555555555 - nodes in this community are weakly interconnected._