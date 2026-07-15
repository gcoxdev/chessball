import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pairedBootstrapInterval, type BootstrapInterval, type MatchedAuditReport } from './audit';
import { defensiveFormations, offensiveFormations } from './rules';
import {
  canonicalFormationExpansionArtifact,
  FORMATION_EXPANSION_BOOTSTRAP,
  FORMATION_EXPANSION_PAIRS_PER_CELL,
  FORMATION_EXPANSION_THRESHOLDS,
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

  it('wires the no-argument runner to matched heuristic audits and stdout', () => {
    expect(runnerSource).toContain("if (process.argv.slice(2).length) throw new Error('Usage: npm exec vite-node scripts/run-formation-expansion-audit.ts')");
    expect(runnerSource).toContain("primary: 'heuristic'");
    expect(runnerSource).toContain("comparison: 'heuristic'");
    expect(runnerSource).toContain('pairs: cell.pairs');
    expect(runnerSource).toContain('maxActions: FORMATION_EXPANSION_MAX_ACTIONS');
    expect(runnerSource).toContain('formationPlan: { home: cell.primaryPlan, away: cell.comparisonPlan }');
    expect(runnerSource).toContain('bootstrap: { seed: cell.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }');
    expect(runnerSource).toContain('process.stdout.write');
    expect(runnerSource).not.toContain('writeFile');
  });
});
