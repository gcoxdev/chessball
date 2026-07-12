import { describe, expect, it } from 'vitest';
import { createGame } from './rules';
import { simulateBatch, simulateGame, validateGameStateInvariants } from './simulator';

describe('headless simulator', () => {
  it('produces repeatable game summaries from the same seed and policy', () => {
    const first = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 400 });
    const second = simulateGame({ seed: 42, policy: 'heuristic', maxActions: 400 });

    expect(second.summary).toEqual(first.summary);
    expect(second.anomalies).toEqual(first.anomalies);
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

  it('normalizes a legacy random policy for both teams repeatably', () => {
    const first = simulateGame({ seed: 42, policy: 'random', maxActions: 400 });
    const second = simulateGame({ seed: 42, policy: 'random', maxActions: 400 });

    expect(first.summary.policies).toEqual({ home: 'random', away: 'random' });
    expect(second.summary).toEqual(first.summary);
    expect(second.anomalies).toEqual(first.anomalies);
  });

  it('splits batch simulations between heuristic and random policies', () => {
    const report = simulateBatch({ games: 12, seed: 7, maxActionsPerGame: 300 });

    expect(report.games).toBe(12);
    expect(report.byPolicy.heuristic.games).toBe(6);
    expect(report.byPolicy.random.games).toBe(6);
    expect(report.balanceByPolicy.heuristic.games).toBe(6);
    expect(report.balanceByPolicy.random.games).toBe(6);
    expect(report.completed + report.stalled + report.crashed).toBe(12);
    expect(report.resultTypes.total).toBeGreaterThan(0);
    expect(report.balance.homeWinRate + report.balance.awayWinRate + report.balance.tieRate).toBeCloseTo(1);
    expect(report.balance.warnings).toEqual(expect.any(Array));
  });

  it('breaks balance down by kickoff, receiving, and direction factors', () => {
    const report = simulateBatch({ games: 24, seed: 9, maxActionsPerGame: 1000 });

    expect(report.balanceByOpeningKickoff.home.games + report.balanceByOpeningKickoff.away.games).toBe(24);
    expect(report.balanceByOpeningReceiver.home.games + report.balanceByOpeningReceiver.away.games).toBe(24);
    expect(report.balanceByFinalDirection.left.games + report.balanceByFinalDirection.right.games).toBe(24);
    expect(report.balanceByOpeningKickoff.home.balance.warnings).toEqual(expect.any(Array));
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
