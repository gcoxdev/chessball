import { describe, expect, it } from 'vitest';
import { applyAction, createGame } from './rules';
import { actionOpportunityKeys, actingTeamFieldBand, driveOutcomeForTransition, driveOutcomeKey, simulateBatch, simulateGame, validateGameStateInvariants } from './simulator';
import type { Action, PlayResult } from './types';
import type { SimulationFormationPlan, SimulationOpening } from './simulator';

describe('headless simulator', () => {
  it('produces repeatable game summaries from the same seed and policy', () => {
    const first = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 400 });
    const second = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 400 });

    expect(second.summary).toEqual(first.summary);
    expect(second.anomalies).toEqual(first.anomalies);
  });

  it('forces either team to receive the opening kickoff without changing the seed', () => {
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

    expect(homeReceives.summary.openingWinner).toBe('home');
    expect(homeReceives.summary.openingKicker).toBe('away');
    expect(homeReceives.summary.openingReceiver).toBe('home');
    expect(awayReceives.summary.openingWinner).toBe('away');
    expect(awayReceives.summary.openingKicker).toBe('home');
    expect(awayReceives.summary.openingReceiver).toBe('away');
    expect(homeReceives.summary.attackDirections).toEqual({ home: 'right', away: 'left' });
    expect(awayReceives.summary.attackDirections).toEqual({ home: 'right', away: 'left' });
  });

  it('reports unresolved opening metadata truthfully when the action budget ends early', () => {
    const beforeToss = simulateGame({
      seed: 77,
      opening: { coinWinner: 'away', choice: 'kick' },
      maxActions: 0,
    });
    const afterToss = simulateGame({
      seed: 77,
      opening: { coinWinner: 'away', choice: 'kick' },
      maxActions: 1,
    });
    const afterChoice = simulateGame({
      seed: 77,
      opening: { coinWinner: 'away', choice: 'kick' },
      maxActions: 2,
    });

    expect(beforeToss.summary).toMatchObject({
      openingWinner: null,
      openingKicker: null,
      openingReceiver: null,
    });
    expect(afterToss.summary).toMatchObject({
      openingWinner: 'away',
      openingKicker: null,
      openingReceiver: null,
    });
    expect(afterChoice.summary).toMatchObject({
      openingWinner: 'away',
      openingKicker: 'away',
      openingReceiver: 'home',
    });
  });

  it('selects planned formations for the possessing offense and opposing defense', () => {
    const formationPlan = {
      home: { offense: 'i-form', defense: '4-3' },
      away: { offense: 'shotgun', defense: 'nickel' },
    };
    const result = simulateGame({
      seed: 12,
      policy: 'heuristic',
      opening: { coinWinner: 'home', choice: 'receive' },
      formationPlan,
      maxActions: 14,
    });

    expect(result.finalState.possession).toBe('home');
    expect(result.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', side: 'offense', formationId: 'i-form' }),
    );
    expect(result.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', side: 'defense', formationId: 'nickel' }),
    );
    expect(result.summary.formationSelections).toEqual({
      home: { offense: ['i-form'], defense: [] },
      away: { offense: [], defense: ['nickel'] },
    });
    expect(result.summary.formationPlan).toEqual(formationPlan);
    expect(simulateGame({ seed: 12, formationPlan, maxActions: 0 }).summary.formationPlan).toEqual(formationPlan);
  });

  it('swaps planned offense and defense teams when away has possession', () => {
    const result = simulateGame({
      seed: 12,
      policy: 'heuristic',
      opening: { coinWinner: 'away', choice: 'receive' },
      formationPlan: {
        home: { offense: 'i-form', defense: '4-3' },
        away: { offense: 'shotgun', defense: 'nickel' },
      },
      maxActions: 14,
    });

    expect(result.finalState.possession).toBe('away');
    expect(result.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', side: 'offense', formationId: 'shotgun' }),
    );
    expect(result.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', side: 'defense', formationId: '4-3' }),
    );
  });

  it('applies fixed formation plans across repeated phases and possession transitions', () => {
    const result = simulateGame({
      seed: 12,
      policy: 'heuristic',
      opening: { coinWinner: 'home', choice: 'receive' },
      formationPlan: {
        home: { offense: 'i-form', defense: '4-3' },
        away: { offense: 'shotgun', defense: 'nickel' },
      },
      maxActions: 500,
    });

    expect(result.summary.formationSelections.home.offense.length).toBeGreaterThan(1);
    expect(result.summary.formationSelections.home.defense.length).toBeGreaterThan(1);
    expect(result.summary.formationSelections.away.offense.length).toBeGreaterThan(1);
    expect(result.summary.formationSelections.away.defense.length).toBeGreaterThan(1);
    expect(new Set(result.summary.formationSelections.home.offense)).toEqual(new Set(['i-form']));
    expect(new Set(result.summary.formationSelections.home.defense)).toEqual(new Set(['4-3']));
    expect(new Set(result.summary.formationSelections.away.offense)).toEqual(new Set(['shotgun']));
    expect(new Set(result.summary.formationSelections.away.defense)).toEqual(new Set(['nickel']));
  });

  it('rejects unsupported opening values at runtime', () => {
    const invalidWinner = { coinWinner: 'visitors', choice: 'receive' } as unknown as SimulationOpening;
    const invalidChoice = { coinWinner: 'home', choice: 'defer' } as unknown as SimulationOpening;

    expect(() => simulateGame({ seed: 1, opening: invalidWinner })).toThrow(/coin winner/i);
    expect(() => simulateGame({ seed: 1, opening: invalidChoice })).toThrow(/kickoff choice/i);
  });

  it('rejects unknown and wrong-side formation IDs at runtime', () => {
    const unknown = {
      home: { offense: 'wishbone', defense: '4-3' },
      away: { offense: 'shotgun', defense: 'nickel' },
    } as unknown as SimulationFormationPlan;
    const wrongSide = {
      home: { offense: 'nickel', defense: '4-3' },
      away: { offense: 'shotgun', defense: 'i-form' },
    } as unknown as SimulationFormationPlan;

    expect(() => simulateGame({ seed: 1, formationPlan: unknown })).toThrow(/unknown.*formation/i);
    expect(() => simulateGame({ seed: 1, formationPlan: wrongSide })).toThrow(/offense.*nickel|defense.*i-form/i);
  });

  it('selects policies independently for home and away', () => {
    const result = simulateGame({
      seed: 42,
      policies: { home: 'heuristic', away: 'random' },
      maxActions: 100,
    });

    expect(result.summary.policies).toEqual({ home: 'heuristic', away: 'random' });
  });

  it('uses the coin-toss winner policy for kickoff protocol choices', () => {
    const homeActs = simulateGame({
      seed: 1,
      policies: { home: 'random', away: 'heuristic' },
      maxActions: 2,
    });
    const awayActs = simulateGame({
      seed: 682,
      policies: { home: 'heuristic', away: 'random' },
      maxActions: 2,
    });

    expect(homeActs.finalState.coinToss).toMatchObject({ winner: 'home', choice: 'kick' });
    expect(awayActs.finalState.coinToss).toMatchObject({ winner: 'away', choice: 'kick' });
  });

  it('uses only the home policy for a home formation turn', () => {
    const heuristic = simulateGame({
      seed: 12,
      policies: { home: 'heuristic', away: 'heuristic' },
      maxActions: 10,
    });
    const actingTeamChanged = simulateGame({
      seed: 12,
      policies: { home: 'random', away: 'heuristic' },
      maxActions: 22,
    });
    const otherTeamChanged = simulateGame({
      seed: 12,
      policies: { home: 'heuristic', away: 'random' },
      maxActions: 10,
    });

    expect(heuristic.finalState.turn).toBe('home');
    expect(actingTeamChanged.finalState.turn).toBe('home');
    expect(otherTeamChanged.finalState.turn).toBe('home');
    expect(heuristic.finalState.phase).toBe('formation');
    expect(actingTeamChanged.finalState.phase).toBe('formation');
    expect(otherTeamChanged.finalState.phase).toBe('formation');
    expect(heuristic.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'shotgun' }),
    );
    expect(actingTeamChanged.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'singleback' }),
    );
    expect(otherTeamChanged.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'shotgun' }),
    );
  });

  it('uses only the away policy for an away formation turn', () => {
    const heuristic = simulateGame({
      seed: 100,
      policies: { home: 'heuristic', away: 'heuristic' },
      maxActions: 28,
    });
    const actingTeamChanged = simulateGame({
      seed: 100,
      policies: { home: 'heuristic', away: 'random' },
      maxActions: 46,
    });
    const otherTeamChanged = simulateGame({
      seed: 100,
      policies: { home: 'random', away: 'heuristic' },
      maxActions: 66,
    });

    expect(heuristic.finalState.turn).toBe('away');
    expect(actingTeamChanged.finalState.turn).toBe('away');
    expect(otherTeamChanged.finalState.turn).toBe('away');
    expect(heuristic.finalState.phase).toBe('formation');
    expect(actingTeamChanged.finalState.phase).toBe('formation');
    expect(otherTeamChanged.finalState.phase).toBe('formation');
    expect(heuristic.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'power' }),
    );
    expect(actingTeamChanged.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'trips' }),
    );
    expect(otherTeamChanged.finalState.play.actions).toContainEqual(
      expect.objectContaining({ type: 'chooseFormation', formationId: 'power' }),
    );
  });

  it('gives team policies precedence over the legacy scalar policy', () => {
    const result = simulateGame({
      seed: 1,
      policy: 'random',
      policies: { home: 'heuristic', away: 'random' },
      maxActions: 2,
    });

    expect(result.summary.policies).toEqual({ home: 'heuristic', away: 'random' });
    expect(result.summary.policy).toBe('heuristic');
    expect(result.finalState.coinToss).toMatchObject({ winner: 'home', choice: 'receive' });
  });

  it('defaults both teams to the heuristic policy', () => {
    const result = simulateGame({ seed: 42, maxActions: 2 });

    expect(result.summary.policies).toEqual({ home: 'heuristic', away: 'heuristic' });
    expect(result.summary.policy).toBe('heuristic');
  });

  it('records contextual action opportunities, selections, formations, and drive outcomes', () => {
    const result = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 5000 });

    expect(result.summary.actionTypes.total).toBe(result.summary.actions);
    expect(result.summary.formationChoices.total).toBeGreaterThan(0);
    expect(result.summary.driveOutcomes.total).toBeLessThanOrEqual(result.summary.resultTypes.total);
    expect(result.summary.actionOpportunities.total).toBeGreaterThanOrEqual(result.summary.actionTypes.total);
  });

  it('uses a stable bounded schema for action context keys', () => {
    const result = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 500 });
    const keys = Object.keys(result.summary.actionOpportunities).filter((key) => key !== 'total');

    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(key).toMatch(/^team=(home|away)\|policy=(heuristic|random)\|phase=[A-Za-z]+\|down=[1-4]\|field=(own|midfield|opponent|goal-to-go)\|action=[A-Za-z]+$/);
      expect(key).not.toMatch(/piece|coord|\bx=|\by=|\d+,\d+/i);
    }
    for (const key of Object.keys(result.summary.actionTypes).filter((key) => key !== 'total')) {
      expect(result.summary.actionOpportunities[key]).toBeGreaterThan(0);
    }
  });

  it('counts one move opportunity for a decision with ten legal destinations', () => {
    const state = createGame({ phase: 'live', turn: 'home' });
    const moves: Action[] = Array.from({ length: 10 }, (_, index) => ({
      type: 'move', pieceId: 'home-rb', to: { x: index + 2, y: 4 },
    }));

    expect(actionOpportunityKeys(state, 'heuristic', moves)).toEqual([
      expect.stringContaining('|action=move'),
    ]);
  });

  it('accumulates one opportunity per repeated decision state', () => {
    const state = createGame({ phase: 'live', turn: 'home' });
    const moves: Action[] = Array.from({ length: 10 }, (_, index) => ({
      type: 'move', pieceId: 'home-rb', to: { x: index + 2, y: 4 },
    }));
    const decisions = [
      ...actionOpportunityKeys(state, 'heuristic', moves),
      ...actionOpportunityKeys(state, 'heuristic', moves),
    ];

    expect(decisions).toHaveLength(2);
    expect(decisions[0]).toBe(decisions[1]);
  });

  it('records a real drive-ending action transition exactly once', () => {
    const before = createGame({ phase: 'live', lineOfScrimmage: 17, ball: { kind: 'controlled', pieceId: 'home-qb' } });
    const positioned = {
      ...before,
      pieces: before.pieces.map((item) => item.id === 'home-qb' ? { ...item, coord: { x: 17, y: 5 } } : item),
    };
    const after = applyAction(positioned, { type: 'kick', kickerId: 'home-qb', kind: 'fieldGoal', roll: { die1: 4, die2: 4 } });

    expect(driveOutcomeForTransition(positioned, after)).toBe('fieldGoalGood');
    expect(driveOutcomeForTransition(after, after)).toBeNull();
  });

  it('does not recount a persisted terminal result on a later transition', () => {
    const before = createGame({
      phase: 'betweenDowns',
      play: { actions: [], result: { type: 'touchdown', team: 'home' } },
    });
    const after = { ...before, play: { ...before.play, actions: [{ type: 'startTwoPointTry', team: 'home' } as const] } };

    expect(driveOutcomeForTransition(before, after)).toBeNull();
  });

  it('classifies a real touchdown transition once', () => {
    const before = createGame({ phase: 'live', ball: { kind: 'controlled', pieceId: 'home-rb' } });
    const positioned = {
      ...before,
      pieces: before.pieces.map((item) => item.id === 'home-rb' ? { ...item, coord: { x: 21, y: 4 } } : item),
    };
    const touchdown = applyAction(positioned, { type: 'move', pieceId: 'home-rb', to: { x: 22, y: 4 } });

    expect(driveOutcomeForTransition(positioned, touchdown)).toBe('touchdown');
    expect(driveOutcomeForTransition(touchdown, touchdown)).toBeNull();
  });

  it('mirrors field bands from each acting team perspective', () => {
    const homeOwn = createGame({ lineOfScrimmage: 4, turn: 'home' });
    const awayOwn = createGame({ lineOfScrimmage: homeOwn.board.width - 5, turn: 'away' });
    const homeGoal = createGame({ lineOfScrimmage: homeOwn.board.width - 5, turn: 'home' });
    const awayGoal = createGame({ lineOfScrimmage: 4, turn: 'away' });

    expect(actingTeamFieldBand(homeOwn, 'home')).toBe('own');
    expect(actingTeamFieldBand(awayOwn, 'away')).toBe('own');
    expect(actingTeamFieldBand(homeGoal, 'home')).toBe('goal-to-go');
    expect(actingTeamFieldBand(awayGoal, 'away')).toBe('goal-to-go');
  });

  it('retains applied-action telemetry when the resulting state fails invariants', () => {
    const result = simulateGame({
      seed: 42,
      maxActions: 10,
      validateState: () => ['forced invariant failure'],
    });

    expect(result.status).toBe('crashed');
    expect(result.summary.actions).toBe(1);
    expect(result.summary.actionTypes.total).toBe(1);
    expect(result.summary.actionOpportunities.total).toBeGreaterThanOrEqual(1);
    expect(result.anomalies[0]).toMatchObject({ type: 'invariant', actionIndex: 1 });
  });

  it.each<PlayResult>([
    { type: 'kickoff', team: 'home', receivingTeam: 'away', at: { x: 10, y: 4 } },
    { type: 'tackle', at: { x: 10, y: 4 } },
    { type: 'incomplete', at: { x: 10, y: 4 } },
    { type: 'fumble', at: { x: 10, y: 4 } },
  ])('does not record non-drive result $type as a drive outcome', (result) => {
    const before = createGame({ phase: 'live' });
    const after = { ...before, play: { ...before.play, result } };

    expect(driveOutcomeForTransition(before, after)).toBeNull();
  });

  it('distinguishes successful and failed scoring drive outcomes', () => {
    const result = (type: PlayResult['type'], good: boolean): PlayResult => {
      if (type === 'fieldGoal' || type === 'extraPoint') return { type, team: 'home', good };
      return { type: 'twoPoint', team: 'home', good };
    };

    expect(driveOutcomeKey(result('fieldGoal', true))).toBe('fieldGoalGood');
    expect(driveOutcomeKey(result('fieldGoal', false))).toBe('fieldGoalMissed');
    expect(driveOutcomeKey(result('extraPoint', true))).toBe('extraPointGood');
    expect(driveOutcomeKey(result('extraPoint', false))).toBe('extraPointMissed');
    expect(driveOutcomeKey(result('twoPoint', true))).toBe('twoPointGood');
    expect(driveOutcomeKey(result('twoPoint', false))).toBe('twoPointFailed');
  });

  it('normalizes a legacy random policy for both teams repeatably', () => {
    const first = simulateGame({ seed: 42, policy: 'random', maxActions: 400 });
    const second = simulateGame({ seed: 42, policy: 'random', maxActions: 400 });

    expect(first.summary.policies).toEqual({ home: 'random', away: 'random' });
    expect(second.summary).toEqual(first.summary);
    expect(second.anomalies).toEqual(first.anomalies);
  });

  it('runs a legacy random policy like an explicit all-random matchup', () => {
    const legacy = simulateGame({ seed: 42, policy: 'random', maxActions: 400 });
    const explicit = simulateGame({
      seed: 42,
      policies: { home: 'random', away: 'random' },
      maxActions: 400,
    });

    expect(explicit.summary).toEqual(legacy.summary);
    expect(explicit.anomalies).toEqual(legacy.anomalies);
    expect(explicit.finalState).toEqual(legacy.finalState);
  });

  it('splits batch simulations between heuristic and random policies', () => {
    const report = simulateBatch({ games: 12, seed: 7, maxActionsPerGame: 300 });

    expect(report.games).toBe(12);
    expect(report.byPolicy.heuristic.games).toBe(6);
    expect(report.byPolicy.random.games).toBe(6);
    expect(report.balanceByPolicy.heuristic.games).toBe(report.byPolicy.heuristic.completed);
    expect(report.balanceByPolicy.random.games).toBe(report.byPolicy.random.completed);
    expect(report.completed + report.stalled + report.crashed).toBe(12);
    expect(report.resultTypes.total).toBeGreaterThan(0);
    expect(report.actionTypes.total).toBeGreaterThan(0);
    expect(report.actionOpportunities.total).toBeGreaterThanOrEqual(report.actionTypes.total);
    expect(report.formationChoices.total).toBeGreaterThan(0);
    expect(report.driveOutcomes.total).toBeLessThanOrEqual(report.resultTypes.total);
    if (report.completed > 0) {
      const { homeWinRate, awayWinRate, tieRate } = report.balance;
      expect(homeWinRate).not.toBeNull();
      expect(awayWinRate).not.toBeNull();
      expect(tieRate).not.toBeNull();
      expect((homeWinRate ?? 0) + (awayWinRate ?? 0) + (tieRate ?? 0)).toBeCloseTo(1);
    } else {
      expect(report.balance.homeWinRate).toBeNull();
    }
    expect(report.balance.warnings).toEqual(expect.any(Array));
  });

  it('breaks balance down by kickoff, receiving, and direction factors', () => {
    const report = simulateBatch({ games: 24, seed: 9, maxActionsPerGame: 1000 });

    expect(report.balanceByOpeningKickoff.home.games + report.balanceByOpeningKickoff.away.games).toBe(report.completed);
    expect(report.balanceByOpeningReceiver.home.games + report.balanceByOpeningReceiver.away.games).toBe(report.completed);
    expect(report.balanceByFinalDirection.left.games + report.balanceByFinalDirection.right.games).toBe(report.completed);
    expect(report.balanceByOpeningKickoff.home.balance.warnings).toEqual(expect.any(Array));
  });

  it('excludes incomplete games from headline and balance estimates', () => {
    const report = simulateBatch({ games: 4, seed: 7, maxActionsPerGame: 1 });

    expect(report.completed).toBe(0);
    expect(report.stalled).toBe(4);
    expect(report.scoreDifferential.homeWins + report.scoreDifferential.awayWins + report.scoreDifferential.ties).toBe(0);
    expect(report.scoreDifferential.averageHomeScore).toBeNull();
    expect(report.scoreDifferential.averageAwayScore).toBeNull();
    expect(report.balance.games).toBe(0);
    expect(report.balance.homeWinRate).toBeNull();
    expect(report.balanceByPolicy.heuristic.games).toBe(0);
    expect(report.byPolicy.heuristic.games).toBe(2);
  });

  it('uses only completed games in every estimate for a mixed-status batch', () => {
    const captured = [] as ReturnType<typeof simulateGame>[];
    const report = simulateBatch({
      games: 12,
      seed: 9,
      simulate: (options) => {
        const result = simulateGame({
          ...options,
          maxActions: captured.length % 3 === 0 ? 1 : 5000,
        });
        captured.push(result);
        return result;
      },
    });
    const completedGames = captured.filter((game) => game.status === 'completed');
    const expectedHomeAverage = completedGames.reduce((sum, game) => sum + game.summary.finalScore.home, 0) / completedGames.length;
    const expectedAwayAverage = completedGames.reduce((sum, game) => sum + game.summary.finalScore.away, 0) / completedGames.length;

    expect(report.completed).toBeGreaterThan(0);
    expect(report.completed).toBeLessThan(report.games);
    expect(report.completed + report.stalled + report.crashed).toBe(report.games);
    expect(report.scoreDifferential.homeWins + report.scoreDifferential.awayWins + report.scoreDifferential.ties).toBe(report.completed);
    expect(report.scoreDifferential.averageHomeScore).toBe(expectedHomeAverage);
    expect(report.scoreDifferential.averageAwayScore).toBe(expectedAwayAverage);
    expect(report.balance.games).toBe(report.completed);
    expect(report.balanceByPolicy.heuristic.games + report.balanceByPolicy.random.games).toBe(report.completed);
    expect(report.balanceByOpeningKickoff.home.games + report.balanceByOpeningKickoff.away.games).toBe(report.completed);
    expect(report.balanceByOpeningReceiver.home.games + report.balanceByOpeningReceiver.away.games).toBe(report.completed);
    expect(report.balanceByFinalDirection.left.games + report.balanceByFinalDirection.right.games).toBe(report.completed);
  });

  it('uses the real game simulator by default', () => {
    const expected = simulateGame({ seed: 19, policy: 'heuristic', maxActions: 5000 });
    const report = simulateBatch({ games: 1, seed: 19, maxActionsPerGame: 5000 });

    expect(report.completed).toBe(expected.status === 'completed' ? 1 : 0);
    expect(report.scoreDifferential.averageHomeScore).toBe(expected.status === 'completed' ? expected.summary.finalScore.home : null);
    expect(report.scoreDifferential.averageAwayScore).toBe(expected.status === 'completed' ? expected.summary.finalScore.away : null);
  });

  it('flags home-away imbalance when score or win thresholds are exceeded', () => {
    const report = simulateBatch({
      games: 20,
      seed: 5,
      maxActionsPerGame: 5000,
      balanceWinRateThreshold: 0,
      balanceScoreThreshold: 0,
    });

    expect(report.balance.warnings.length).toBeGreaterThan(0);
  });

  it('reports a stall instead of throwing when a game exceeds the action limit', () => {
    const result = simulateGame({ seed: 3, policy: 'random', maxActions: 1 });

    expect(result.status).toBe('stalled');
    expect(result.anomalies.some((item) => item.type === 'maxActions')).toBe(true);
    expect(result.anomalies[0]?.recentActions.length).toBeGreaterThan(0);
  });

  it('finishes known random seeds without stalling when given a normal action budget', () => {
    const report = simulateBatch({ games: 20, seed: 5, maxActionsPerGame: 5000 });

    expect(report.crashed).toBe(0);
    expect(report.stalled).toBe(0);
    expect(report.completed).toBe(20);
  });

  it('does not let heuristic carriers oscillate when forward progress is blocked', () => {
    const result = simulateGame({ seed: 548526, policy: 'heuristic', maxActions: 5000 });

    expect(result.status).toBe('completed');
    expect(result.anomalies).toEqual([]);
  });

  it('flags impossible possession and ball-owner turnover states', () => {
    const invalid = createGame({
      phase: 'betweenDowns',
      possession: 'away',
      turn: 'away',
      ball: { kind: 'controlled', pieceId: 'home-qb' },
      play: { actions: [], result: { type: 'turnoverOnDowns', team: 'away' } },
    });

    expect(validateGameStateInvariants(invalid)).toContain('Controlled ball belongs to home-qb, but possession is away');
  });
});
