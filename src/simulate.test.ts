import { describe, expect, it, vi } from 'vitest';
import type { MatchedAuditReport, RunMatchedAuditOptions } from './engine/audit';
import type { SimulationBatchReport } from './engine/simulator';
import { exitCodeForAuditReport, exitCodeForBatchReport, parseArgs, runCli } from './simulate';

describe('parseArgs', () => {
  it.each([
    ['--games', '0'],
    ['--games', 'nope'],
    ['--max-actions', '-1'],
    ['--repeat-limit', '0'],
  ])('rejects invalid numeric option %s %s', (flag, value) => {
    expect(() => parseArgs([flag, value])).toThrow(flag);
  });

  it.each([
    '--games', '--pairs', '--seed', '--max-actions', '--repeat-limit',
    '--balance-win-threshold', '--balance-score-threshold',
  ])('rejects empty or whitespace-only numeric values for %s', flag => {
    const prefix = flag === '--pairs' ? ['--audit'] : [];
    expect(() => parseArgs([...prefix, flag, '   '])).toThrow(flag);
  });

  it.each([
    [['--unknown'], '--unknown'],
    [['--games'], '--games'],
    [['--games', '1.5'], '--games'],
    [['--seed', '-1'], '--seed'],
    [['--seed', '4294967296'], '--seed'],
    [['--balance-win-threshold', '1.1'], '--balance-win-threshold'],
    [['--balance-score-threshold', '-0.1'], '--balance-score-threshold'],
    [['--home-policy', 'clever'], '--home-policy'],
    [['--pairs', '4'], '--pairs'],
  ])('rejects invalid arguments %#', (args, flag) => {
    expect(() => parseArgs(args)).toThrow(flag);
  });

  it('parses the legacy batch options without audit flags', () => {
    expect(parseArgs(['--games', '12', '--seed', '8', '--max-actions', '90', '--repeat-limit', '7', '--balance-win-threshold', '.2', '--balance-score-threshold', '3', '--json'])).toEqual({
      audit: false,
      games: 12,
      pairs: 100,
      seed: 8,
      maxActions: 90,
      repeatLimit: 7,
      balanceWinRateThreshold: .2,
      balanceScoreThreshold: 3,
      homePolicy: 'heuristic',
      awayPolicy: 'random',
      json: true,
    });
  });

  it('parses explicit audit options', () => {
    expect(parseArgs(['--audit', '--pairs', '5', '--home-policy', 'random', '--away-policy', 'heuristic'])).toMatchObject({ audit: true, pairs: 5, homePolicy: 'random', awayPolicy: 'heuristic' });
  });

  it.each([
    ['--audit', '--games', '4'],
    ['--home-policy', 'random'],
    ['--away-policy', 'heuristic'],
  ])('rejects mode-incompatible options %#', (...args) => {
    expect(() => parseArgs(args)).toThrow(/audit|batch/);
  });
});

describe('runCli', () => {
  it('keeps the ordinary games path compatible and reports completed balance samples', () => {
    const report = batchReport({ games: 4, completed: 3, stalled: 1, balance: { games: 3, homeWinRate: .5, awayWinRate: .5, tieRate: 0, winRateDelta: 0, averageScoreDelta: 0, warnings: [] } });
    const simulateBatch = vi.fn(() => report);
    const lines: string[] = [];

    expect(runCli(['--games', '4'], { simulateBatch, runMatchedAudit: vi.fn(), write: line => lines.push(line) })).toBe(0);
    expect(simulateBatch).toHaveBeenCalledWith(expect.objectContaining({ games: 4 }));
    expect(lines.join('\n')).toContain('Attempted: 4');
    expect(lines.join('\n')).toContain('Balance sample: 3 completed games');
    expect(lines.join('\n')).toContain('Stalled: 1');
  });

  it('prints n/a for nullable ordinary estimates and fails only crashes', () => {
    const report = batchReport({ games: 2, completed: 0, stalled: 1, crashed: 1 });
    const lines: string[] = [];
    expect(runCli([], { simulateBatch: () => report, runMatchedAudit: vi.fn(), write: line => lines.push(line) })).toBe(1);
    expect(lines.join('\n')).toContain('n/a');
    expect(exitCodeForBatchReport(batchReport({ stalled: 2 }))).toBe(0);
  });

  it('runs a complete audit successfully even when evidence is inconclusive', () => {
    const report = auditReport();
    const audit = vi.fn(() => report);
    const lines: string[] = [];
    expect(runCli(['--audit', '--pairs', '2'], { simulateBatch: vi.fn(), runMatchedAudit: audit, write: line => lines.push(line) })).toBe(0);
    expect(audit).toHaveBeenCalledWith(expect.objectContaining<Partial<RunMatchedAuditOptions>>({ pairs: 2, primary: 'heuristic', comparison: 'random' }));
    expect(lines.join('\n')).toContain('Matchup: heuristic vs random');
    expect(lines.join('\n')).toContain('Pairs: 2 requested, 2 completed, 0 excluded');
    expect(lines.join('\n')).toContain('Incomplete evidence: no');
  });

  it.each([
    [auditReport({ completedPairs: 1, excludedPairs: 1, statusCounts: { completed: 3, stalled: 1, crashed: 0 } }), 'stalled/excluded'],
    [auditReport({ statusCounts: { completed: 3, stalled: 0, crashed: 1 } }), 'crashed'],
  ])('fails incomplete audit evidence: %s', (report) => {
    expect(exitCodeForAuditReport(report)).toBe(1);
    expect(runCli(['--audit'], { simulateBatch: vi.fn(), runMatchedAudit: () => report, write: vi.fn() })).toBe(1);
  });

  it('fails cleanly when audit evidence generation throws', () => {
    const lines: string[] = [];
    expect(runCli(['--audit'], { simulateBatch: vi.fn(), runMatchedAudit: () => { throw new Error('bootstrap failed'); }, write: line => lines.push(line) })).toBe(1);
    expect(lines.join('\n')).toContain('Audit failed: bootstrap failed');
  });

  it('emits valid JSON only when audit evidence generation throws in JSON mode', () => {
    const lines: string[] = [];
    expect(runCli(['--audit', '--json'], { simulateBatch: vi.fn(), runMatchedAudit: () => { throw new Error('bootstrap failed'); }, write: line => lines.push(line) })).toBe(1);
    expect(JSON.parse(lines.join('\n'))).toEqual({ error: 'bootstrap failed' });
  });

  it('serializes explicit audit evidence as JSON', () => {
    const lines: string[] = [];
    runCli(['--audit', '--json'], { simulateBatch: vi.fn(), runMatchedAudit: () => auditReport(), write: line => lines.push(line) });
    const output = JSON.parse(lines.join('\n')) as MatchedAuditReport;
    expect(output).toMatchObject({ requestedPairs: 2, completedPairs: 2, excludedPairs: 0, attemptedGames: 4 });
    expect(output.statusCounts).toEqual({ completed: 4, stalled: 0, crashed: 0 });
  });
});

function batchReport(overrides: Partial<SimulationBatchReport> = {}): SimulationBatchReport {
  const emptyBalance = { games: 0, homeWinRate: null, awayWinRate: null, tieRate: null, winRateDelta: null, averageScoreDelta: null, warnings: [] };
  const bucket = { games: 0, homeWins: 0, awayWins: 0, ties: 0, averageHomeScore: null, averageAwayScore: null, balance: emptyBalance };
  return {
    games: 2, seed: 1, completed: 2, stalled: 0, crashed: 0, averageActions: 10,
    byPolicy: { heuristic: { games: 1, completed: 1, stalled: 0, crashed: 0, actions: 10 }, random: { games: 1, completed: 1, stalled: 0, crashed: 0, actions: 10 } },
    phases: { total: 0 }, resultTypes: { total: 0 }, actionTypes: { total: 0 }, actionOpportunities: { total: 0 }, formationChoices: { total: 0 }, driveOutcomes: { total: 0 }, anomalies: [],
    scoreDifferential: { homeWins: 1, awayWins: 1, ties: 0, averageHomeScore: 7, averageAwayScore: 7 }, balance: { ...emptyBalance, games: 2, homeWinRate: .5, awayWinRate: .5, tieRate: 0, winRateDelta: 0, averageScoreDelta: 0 },
    balanceByPolicy: { heuristic: bucket, random: bucket }, balanceByOpeningKickoff: { home: bucket, away: bucket }, balanceByOpeningReceiver: { home: bucket, away: bucket }, balanceByFinalDirection: { left: bucket, right: bucket },
    ...overrides,
  };
}

function auditReport(overrides: Partial<MatchedAuditReport> = {}): MatchedAuditReport {
  return {
    matchup: { primary: 'heuristic', comparison: 'random', formationPlan: null }, requestedPairs: 2, completedPairs: 2, excludedPairs: 0, attemptedGames: 4,
    seedConvention: 'base-seed-plus-pair-index', seedList: [1, 2], seedRange: { first: 1, last: 2 }, statusCounts: { completed: 4, stalled: 0, crashed: 0 }, excludedPairDetails: [], anomalies: [],
    symmetry: { pairEffects: [.5, .5], scoreDeltaEffects: [0, 0], winShareInterval: null, scoreDeltaInterval: null, classification: 'inconclusive' },
    skillGap: { pairEffects: [.5, .5], scoreDeltaEffects: [0, 0], primaryWins: 0, comparisonWins: 0, ties: 4, winShareInterval: null, scoreDeltaInterval: null, classification: null },
    telemetry: { actionTypes: { total: 0 }, actionOpportunities: { total: 0 }, formationChoices: { total: 0 }, driveOutcomes: { total: 0 }, selectionRates: {}, formationStratifiedOutcomes: {}, completion: { games: 4, actions: 0, averageActions: 0 }, tacticCohorts: {} },
    ...overrides,
  };
}
