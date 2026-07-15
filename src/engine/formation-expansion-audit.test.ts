import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pairedBootstrapInterval, type BootstrapInterval, type MatchedAuditReport, type RunMatchedAuditOptions } from './audit';
import { defensiveFormations, offensiveFormations } from './rules';
import {
  canonicalFormationExpansionArtifact,
  FORMATION_EXPANSION_BOOTSTRAP,
  FORMATION_EXPANSION_PAIRS_PER_CELL,
  FORMATION_EXPANSION_THRESHOLDS,
  formationExpansionAuditOutput,
  formationExpansionExperiments,
  serializeFormationExpansionArtifact,
  summarizeFormationComparison,
} from './formation-expansion-audit';

const runnerSource = readFileSync(join(process.cwd(), 'scripts/run-formation-expansion-audit.ts'), 'utf8');

const expectedGroups = [
  ['offense-pistol-vs-singleback', 'Pistol vs Singleback', 'offense', 'pistol', 'singleback'],
  ['offense-trips-vs-shotgun', 'Trips vs Shotgun', 'offense', 'trips', 'shotgun'],
  ['offense-power-vs-i-form', 'Power vs I-Form', 'offense', 'power', 'i-form'],
  ['defense-bear-front-vs-goal-line', 'Bear Front vs Goal Line', 'defense', 'bear-front', 'goal-line'],
  ['defense-pressure-vs-4-3', 'Pressure vs 4-3', 'defense', 'pressure', '4-3'],
  ['defense-deep-shell-vs-nickel', 'Deep Shell vs Nickel', 'defense', 'deep-shell', 'nickel'],
  ['offense-pistol-vs-trips', 'Pistol vs Trips', 'offense', 'pistol', 'trips'],
  ['offense-pistol-vs-power', 'Pistol vs Power', 'offense', 'pistol', 'power'],
  ['offense-trips-vs-power', 'Trips vs Power', 'offense', 'trips', 'power'],
  ['defense-bear-front-vs-pressure', 'Bear Front vs Pressure', 'defense', 'bear-front', 'pressure'],
  ['defense-bear-front-vs-deep-shell', 'Bear Front vs Deep Shell', 'defense', 'bear-front', 'deep-shell'],
  ['defense-pressure-vs-deep-shell', 'Pressure vs Deep Shell', 'defense', 'pressure', 'deep-shell'],
] as const;

function interval(value: number, neutral: number, seed = 1): BootstrapInterval {
  return { low: value, high: value, mean: value, seed, samples: 10_000, confidence: .95 };
}

function syntheticReport(win: number, score = 0, overrides: Partial<MatchedAuditReport> = {}): MatchedAuditReport {
  const pairEffects = Array(100).fill(win);
  const scoreDeltaEffects = Array(100).fill(score);
  return {
    matchup: { primary: 'heuristic', comparison: 'heuristic', formationPlan: null },
    requestedPairs: 100, completedPairs: 100, excludedPairs: 0, attemptedGames: 200,
    seedConvention: 'base-seed-plus-pair-index', seedList: Array.from({ length: 100 }, (_, index) => index), seedRange: { first: 0, last: 99 },
    statusCounts: { completed: 200, stalled: 0, crashed: 0 }, excludedPairDetails: [], anomalies: [],
    symmetry: { pairEffects: Array(100).fill(.5), scoreDeltaEffects: Array(100).fill(0), winShareInterval: interval(.5, .5), scoreDeltaInterval: interval(0, 0), classification: 'inconclusive' },
    skillGap: {
      pairEffects, scoreDeltaEffects, primaryWins: 0, comparisonWins: 0, ties: 200,
      winShareInterval: interval(win, .5), scoreDeltaInterval: interval(score, 0),
      classification: { state: win > .5 ? 'supported' : 'inconclusive', effect: win - .5, interval: interval(win, .5) },
    },
    telemetry: { actionTypes: { total: 0 }, actionOpportunities: { total: 0 }, formationChoices: { total: 0 }, driveOutcomes: { total: 0 }, selectionRates: {}, formationStratifiedOutcomes: {}, tacticCohorts: {}, completion: { games: 200, actions: 2_000, averageActions: 10 } },
    ...overrides,
  };
}

function reportsFor(values: number[], scores: number[] = Array(6).fill(0)): MatchedAuditReport[] {
  return values.map((value, index) => syntheticReport(value, scores[index]));
}

describe('formation expansion experiment matrix', () => {
  it('defines the exact 12 groups in deterministic order', () => {
    expect(formationExpansionExperiments().map(group => [group.id, group.name, group.side, group.primaryId, group.comparisonId])).toEqual(expectedGroups);
  });

  it('expands every group across the canonical opposing catalog in canonical order', () => {
    for (const group of formationExpansionExperiments()) {
      const expectedOpponents = (group.side === 'offense' ? defensiveFormations : offensiveFormations).map(formation => formation.id);
      expect(group.cells.map(cell => cell.opposingFormationId)).toEqual(expectedOpponents);
      expect(group.cells).toHaveLength(6);
      expect(group.cells.every(cell => cell.pairs === 100)).toBe(true);
    }
  });

  it('requests 600 pairs per group and 7,200 total', () => {
    const groups = formationExpansionExperiments();
    expect(groups.map(group => group.requestedPairs)).toEqual(Array(12).fill(600));
    expect(groups.flatMap(group => group.cells)).toHaveLength(72);
    expect(groups.flatMap(group => group.cells).reduce((sum, cell) => sum + cell.pairs, 0)).toBe(7_200);
    expect(FORMATION_EXPANSION_PAIRS_PER_CELL).toBe(100);
  });

  it('assigns disjoint uint32 seed blocks and unique bootstrap seeds', () => {
    const groups = formationExpansionExperiments();
    const cells = groups.flatMap(group => group.cells);
    const ranges = cells.map(cell => cell.seedRange);
    expect(ranges).toHaveLength(72);
    expect(ranges.every(range => range.first >= 0 && range.last <= 0xffff_ffff && range.last - range.first + 1 === 100)).toBe(true);
    expect(ranges.every((range, index) => ranges.every((other, otherIndex) => index === otherIndex || range.last < other.first || other.last < range.first))).toBe(true);
    expect(new Set(cells.map(cell => cell.bootstrapSeed)).size).toBe(72);
    expect(new Set(groups.map(group => group.bootstrapSeed)).size).toBe(12);
  });

  it('keeps every cell and group bootstrap seed outside pair ranges and globally unique', () => {
    const groups = formationExpansionExperiments();
    const cells = groups.flatMap(group => group.cells);
    const bootstrapSeeds = [...cells.map(cell => cell.bootstrapSeed), ...groups.map(group => group.bootstrapSeed)];
    expect(bootstrapSeeds.every(seed => Number.isInteger(seed) && seed >= 0 && seed <= 0xffff_ffff)).toBe(true);
    expect(new Set(bootstrapSeeds).size).toBe(bootstrapSeeds.length);
    expect(bootstrapSeeds.every(seed => cells.every(cell => seed < cell.seedRange.first || seed > cell.seedRange.last))).toBe(true);
  });

  it('changes only the compared side while holding the opponent equal', () => {
    for (const group of formationExpansionExperiments()) for (const cell of group.cells) {
      const compared = group.side;
      const opponent = compared === 'offense' ? 'defense' : 'offense';
      expect(cell.primaryPlan[compared]).toBe(group.primaryId);
      expect(cell.comparisonPlan[compared]).toBe(group.comparisonId);
      expect(cell.primaryPlan[opponent]).toBe(cell.comparisonPlan[opponent]);
      expect(cell.primaryPlan[opponent]).toBe(cell.opposingFormationId);
    }
  });

  it('covers every new formation in a closest and new-vs-new comparison', () => {
    const groups = formationExpansionExperiments();
    for (const id of ['pistol', 'trips', 'power', 'bear-front', 'pressure', 'deep-shell']) {
      const participation = groups.filter(group => group.primaryId === id || group.comparisonId === id);
      expect(participation.some(group => ['singleback', 'shotgun', 'i-form', 'goal-line', '4-3', 'nickel'].includes(group.primaryId === id ? group.comparisonId : group.primaryId))).toBe(true);
      expect(participation.some(group => ['pistol', 'trips', 'power', 'bear-front', 'pressure', 'deep-shell'].includes(group.primaryId === id ? group.comparisonId : group.primaryId))).toBe(true);
    }
  });

  it('consumes catalog expansion dynamically instead of a copied opponent list', () => {
    const added = { ...defensiveFormations[0], id: 'test-dynamic-defense' };
    defensiveFormations.push(added);
    try {
      const cells = formationExpansionExperiments()[0].cells;
      expect(cells[cells.length - 1].opposingFormationId).toBe(added.id);
    } finally {
      defensiveFormations.pop();
    }
  });
});

describe('formation comparison pooling and classification', () => {
  const group = () => formationExpansionExperiments()[0];

  it('pools all 600 effects with the required deterministic bootstrap configuration', () => {
    const summary = summarizeFormationComparison(group(), reportsFor(Array(6).fill(.7), Array(6).fill(2)));
    expect(summary.pooled.completedPairs).toBe(600);
    expect(summary.pooled.winShareInterval).toEqual(pairedBootstrapInterval(Array(600).fill(.7), { seed: group().bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }));
    expect(summary.pooled.scoreDeltaInterval).toEqual(pairedBootstrapInterval(Array(600).fill(2), { seed: group().bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }));
    expect(summary).toMatchObject({ classification: 'broad-dominance', direction: 'primary', decisiveMetric: 'win-share', supportingCells: 6, credibleCounters: [] });
  });

  it('classifies incomplete data before considering dominance', () => {
    const reports = reportsFor(Array(6).fill(.8));
    reports[2] = syntheticReport(.8, 0, { completedPairs: 99, excludedPairs: 1, statusCounts: { completed: 198, stalled: 2, crashed: 0 } });
    expect(summarizeFormationComparison(group(), reports)).toMatchObject({ classification: 'incomplete', direction: null, decisiveMetric: null });
  });

  it.each([
    ['missing cell', () => reportsFor(Array(5).fill(.8)), /Expected 6 cell reports; received 5/i],
    ['crash status', () => {
      const reports = reportsFor(Array(6).fill(.8));
      reports[1] = syntheticReport(.8, 0, { statusCounts: { completed: 199, stalled: 0, crashed: 1 } });
      return reports;
    }, /recorded 1 crashed game/i],
    ['anomaly', () => {
      const reports = reportsFor(Array(6).fill(.8));
      reports[1] = syntheticReport(.8, 0, { anomalies: [{ type: 'exception', message: 'synthetic', actionIndex: 1, phase: 'coinToss', recentActions: [], pair: 0, mirror: 'A', seed: 1 }] });
      return reports;
    }, /recorded 1 anomal/i],
    ['completed-pair count', () => {
      const reports = reportsFor(Array(6).fill(.8));
      reports[1] = syntheticReport(.8, 0, { completedPairs: 99 });
      return reports;
    }, /completed 99 pairs; expected 100/i],
    ['stall status', () => {
      const reports = reportsFor(Array(6).fill(.8));
      reports[1] = syntheticReport(.8, 0, { statusCounts: { completed: 199, stalled: 1, crashed: 0 } });
      return reports;
    }, /recorded 1 stalled game/i],
    ['wrong pool length', () => {
      const reports = reportsFor(Array(6).fill(.8));
      reports[1].skillGap.pairEffects.pop();
      return reports;
    }, /contains 99 win-share effects; expected 100/i],
  ])('classifies a %s report as incomplete with a specific durable reason', (_case, makeReports, expectedReason) => {
    const summary = summarizeFormationComparison(group(), makeReports());
    expect(summary).toMatchObject({ classification: 'incomplete', direction: null, decisiveMetric: null });
    expect(summary.reasons).toEqual(expect.arrayContaining([expect.stringMatching(expectedReason)]));
  });

  it('classifies statistically visible but practically small effects as sub-threshold', () => {
    expect(summarizeFormationComparison(group(), reportsFor(Array(6).fill(.53), Array(6).fill(.5)))).toMatchObject({ classification: 'sub-threshold', direction: null, decisiveMetric: null });
  });

  it('refuses dominance when actionable metrics point in conflicting directions', () => {
    expect(summarizeFormationComparison(group(), reportsFor(Array(6).fill(.7), Array(6).fill(-2)))).toMatchObject({ classification: 'conflicting-metrics', direction: null, decisiveMetric: null });
  });

  it('distinguishes split cell direction from a concentrated favorable matchup', () => {
    expect(summarizeFormationComparison(group(), reportsFor([.8, .8, .8, .4, .4, .4]))).toMatchObject({ classification: 'split-direction', direction: 'primary', decisiveMetric: 'win-share', supportingCells: 3 });
    expect(summarizeFormationComparison(group(), reportsFor([1, 1, .49, .49, .49, .49]))).toMatchObject({ classification: 'favorable-matchup', direction: 'primary', decisiveMetric: 'win-share', supportingCells: 2 });
  });

  it('preserves credible counter cells and blocks broad dominance', () => {
    const summary = summarizeFormationComparison(group(), reportsFor([.7, .7, .7, .7, .7, .5]));
    expect(summary).toMatchObject({ classification: 'credible-counter', direction: 'primary', decisiveMetric: 'win-share', supportingCells: 5 });
    expect(summary.credibleCounters).toEqual([group().cells[5].id]);
  });

  it('reports comparison-favored dominance with an explicit negative direction', () => {
    expect(summarizeFormationComparison(group(), reportsFor(Array(6).fill(.3), Array(6).fill(-2)))).toMatchObject({ classification: 'broad-dominance', direction: 'comparison', decisiveMetric: 'win-share', supportingCells: 6 });
  });

  it('includes an exact comparison-favored five-point win-share difference', () => {
    const reports = Array.from({ length: 6 }, () => {
      const report = syntheticReport(.45);
      report.skillGap.pairEffects = [...Array(90).fill(.5), ...Array(10).fill(0)];
      return report;
    });
    expect(summarizeFormationComparison(group(), reports)).toMatchObject({ classification: 'broad-dominance', direction: 'comparison', decisiveMetric: 'win-share' });
  });

  it.each([
    ['primary', 1, 'primary'],
    ['comparison', -1, 'comparison'],
  ] as const)('uses an exact %s score-delta practical boundary when win share is neutral', (_case, score, direction) => {
    const summary = summarizeFormationComparison(group(), reportsFor(Array(6).fill(.5), Array(6).fill(score)));
    expect(summary).toMatchObject({ classification: 'broad-dominance', direction, decisiveMetric: 'score-delta', supportingCells: 6, credibleCounters: [] });
    expect(summary.reasons[0]).toMatch(/pooled score-delta lead.*no credible counter/i);
  });

  it('counts score-delta cell directions and preserves score-based credible counters', () => {
    const summary = summarizeFormationComparison(group(), reportsFor(Array(6).fill(.5), [2, 2, 2, 2, -1, -1]));
    expect(summary).toMatchObject({ classification: 'credible-counter', direction: 'primary', decisiveMetric: 'score-delta', supportingCells: 4 });
    expect(summary.credibleCounters).toEqual([group().cells[4].id, group().cells[5].id]);
    expect(summary.reasons[0]).toMatch(/2 opposing cell interval/i);
  });
});

describe('formation expansion artifact', () => {
  it('serializes the complete v1 schema deterministically without raw pair arrays', () => {
    const groups = formationExpansionExperiments();
    const summaries = groups.map(group => summarizeFormationComparison(group, reportsFor(Array(6).fill(.5))));
    const artifact = canonicalFormationExpansionArtifact(groups, summaries);
    expect(artifact).toMatchObject({
      schema: 'chessball-formation-expansion-audit-v1',
      runner: 'scripts/run-formation-expansion-audit.ts',
      command: 'npm exec vite-node scripts/run-formation-expansion-audit.ts',
      policy: { primary: 'heuristic', comparison: 'heuristic' },
      maxActions: 5_000, pairsPerCell: 100, totalRequestedPairs: 7_200,
      bootstrap: FORMATION_EXPANSION_BOOTSTRAP,
      thresholds: FORMATION_EXPANSION_THRESHOLDS,
      groups: expect.arrayContaining([expect.objectContaining({ cells: expect.any(Array), summary: expect.objectContaining({ classification: 'sub-threshold' }) })]),
    });
    const serialized = serializeFormationExpansionArtifact(artifact);
    expect(serialized).toBe(serializeFormationExpansionArtifact(canonicalFormationExpansionArtifact(groups, summaries)));
    expect(serialized.endsWith('\n')).toBe(true);
    expect(serialized).not.toContain('pairEffects');
    expect(serialized).not.toContain('seedList');
    expect(serialized).not.toContain('excludedPairDetails');
  });

  it('protects every durable configuration, cell report, and pooled decision field', () => {
    const groups = formationExpansionExperiments();
    const reportsByGroup = groups.map(() => reportsFor(Array(6).fill(.5), [2, 2, 2, 2, -1, -1]));
    const summaries = groups.map((group, index) => summarizeFormationComparison(group, reportsByGroup[index]));
    const artifact = canonicalFormationExpansionArtifact(groups, summaries);
    const firstGroup = artifact.groups[0];
    const firstCell = firstGroup.cells[0];
    const firstReport = firstGroup.reports[0];
    expect(artifact).toMatchObject({
      schema: 'chessball-formation-expansion-audit-v1', runner: 'scripts/run-formation-expansion-audit.ts',
      command: 'npm exec vite-node scripts/run-formation-expansion-audit.ts',
      policy: { primary: 'heuristic', comparison: 'heuristic' }, maxActions: 5_000,
      pairsPerCell: 100, totalRequestedPairs: 7_200,
      bootstrap: { samples: 10_000, confidence: .95 }, thresholds: FORMATION_EXPANSION_THRESHOLDS,
    });
    expect(firstGroup).toMatchObject({
      id: 'offense-pistol-vs-singleback', name: 'Pistol vs Singleback', side: 'offense',
      primaryId: 'pistol', comparisonId: 'singleback', bootstrapSeed: groups[0].bootstrapSeed, requestedPairs: 600,
    });
    expect(firstCell).toEqual({
      id: 'offense-pistol-vs-singleback-against-4-3', opposingFormationId: '4-3',
      primaryPlan: { offense: 'pistol', defense: '4-3' }, comparisonPlan: { offense: 'singleback', defense: '4-3' },
      pairs: 100, seed: groups[0].cells[0].seed, seedRange: groups[0].cells[0].seedRange, bootstrapSeed: groups[0].cells[0].bootstrapSeed,
    });
    expect(firstReport).toEqual({
      id: firstCell.id, opposingFormationId: firstCell.opposingFormationId,
      primaryPlan: firstCell.primaryPlan, comparisonPlan: firstCell.comparisonPlan,
      requestedPairs: 100, completedPairs: 100, excludedPairs: 0, attemptedGames: 200,
      seedConvention: 'base-seed-plus-pair-index', seedRange: { first: 0, last: 99 },
      bootstrap: { seed: firstCell.bootstrapSeed, samples: 10_000, confidence: .95 },
      statusCounts: { completed: 200, stalled: 0, crashed: 0 }, anomalyCount: 0,
      completion: { games: 200, actions: 2_000, averageActions: 10 },
      primaryWins: 0, comparisonWins: 0, ties: 200,
      winShareInterval: { low: .5, high: .5, mean: .5, seed: 1, samples: 10_000, confidence: .95 },
      scoreDeltaInterval: { low: 2, high: 2, mean: 2, seed: 1, samples: 10_000, confidence: .95 },
    });
    expect(firstGroup.summary).toEqual({
      groupId: firstGroup.id, classification: 'credible-counter', direction: 'primary', decisiveMetric: 'score-delta', supportingCells: 4,
      credibleCounters: [firstGroup.cells[4].id, firstGroup.cells[5].id], reasons: [expect.stringMatching(/2 opposing cell interval/i)],
      pooled: {
        requestedPairs: 600, completedPairs: 600,
        winShareInterval: pairedBootstrapInterval(Array(600).fill(.5), { seed: groups[0].bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }),
        scoreDeltaInterval: pairedBootstrapInterval([
          ...Array(100).fill(2), ...Array(100).fill(2), ...Array(100).fill(2), ...Array(100).fill(2),
          ...Array(100).fill(-1), ...Array(100).fill(-1),
        ], { seed: groups[0].bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }),
      },
    });
    const forbiddenKeys = new Set(['pairEffects', 'scoreDeltaEffects', 'seedList', 'excludedPairDetails', 'runtimeMs']);
    const visit = (value: unknown): void => {
      if (!value || typeof value !== 'object') return;
      for (const [key, nested] of Object.entries(value)) {
        expect(forbiddenKeys.has(key), `forbidden artifact key: ${key}`).toBe(false);
        visit(nested);
      }
    };
    visit(artifact);
  });

  it('runs exactly 72 injected audits and returns canonical stdout content without file writes', () => {
    const calls: RunMatchedAuditOptions[] = [];
    const returnedReports: MatchedAuditReport[] = [];
    const output = formationExpansionAuditOutput([], options => {
      calls.push(options);
      const report = syntheticReport(.5);
      returnedReports.push(report);
      return report;
    });
    const groups = formationExpansionExperiments();
    const cells = groups.flatMap(group => group.cells);
    expect(calls).toHaveLength(72);
    calls.forEach((call, index) => expect(call).toEqual({
      pairs: 100, seed: cells[index].seed, primary: 'heuristic', comparison: 'heuristic', maxActions: 5_000,
      formationPlan: { home: cells[index].primaryPlan, away: cells[index].comparisonPlan },
      bootstrap: { seed: cells[index].bootstrapSeed, samples: 10_000, confidence: .95 },
    }));
    const expectedSummaries = groups.map((group, index) => summarizeFormationComparison(group, returnedReports.slice(index * 6, index * 6 + 6)));
    expect(output).toBe(serializeFormationExpansionArtifact(canonicalFormationExpansionArtifact(groups, expectedSummaries)));
    expect(runnerSource).toContain('process.stdout.write(formationExpansionAuditOutput(process.argv.slice(2), runMatchedAudit))');
    expect(runnerSource).not.toMatch(/node:fs|writeFile/);
  });

  it('rejects every CLI argument with a clear usage message before invoking audits', () => {
    let calls = 0;
    expect(() => formationExpansionAuditOutput(['unexpected'], () => {
      calls++;
      return syntheticReport(.5);
    })).toThrow('Usage: npm exec vite-node scripts/run-formation-expansion-audit.ts');
    expect(calls).toBe(0);
  });
});
