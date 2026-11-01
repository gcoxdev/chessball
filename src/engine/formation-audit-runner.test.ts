import { describe, expect, it } from 'vitest';
import type { MatchedAuditReport } from './audit';
import {
  canonicalArtifact,
  compactFormationReport,
  formationExperiments,
  parseFormationAuditMode,
  serializeCanonicalArtifact,
} from './formation-audit-runner';

function report(): MatchedAuditReport {
  return {
    gamesPerPair: 4, seedConvention: 'base-seed-plus-pair-index', seedRange: { first: 1, last: 2 }, seedList: [1, 2],
    requestedPairs: 2, completedPairs: 2, excludedPairs: 0, attemptedGames: 8,
    matchup: { primary: 'heuristic', comparison: 'heuristic', formationPlan: null },
    statusCounts: { completed: 8, stalled: 0, crashed: 0 }, excludedPairDetails: [], anomalies: [],
    symmetry: { pairEffects: [.5], scoreDeltaEffects: [0], winShareInterval: { low: .4, high: .6, mean: .5, seed: 9, samples: 100, confidence: .95 }, scoreDeltaInterval: { low: -1, high: 1, mean: 0, seed: 9, samples: 100, confidence: .95 }, classification: 'inconclusive' },
    skillGap: { pairEffects: [.75], scoreDeltaEffects: [2], primaryWins: 3, comparisonWins: 1, ties: 0, winShareInterval: { low: .6, high: .9, mean: .75, seed: 9, samples: 100, confidence: .95 }, scoreDeltaInterval: { low: 1, high: 3, mean: 2, seed: 9, samples: 100, confidence: .95 }, classification: { state: 'supported', effect: .25, interval: { low: .6, high: .9, mean: .75, seed: 9, samples: 100, confidence: .95 } } },
    telemetry: { actionTypes: { total: 0 }, actionOpportunities: { total: 0 }, formationChoices: { total: 0 }, driveOutcomes: { total: 4, touchdown: 4 }, selectionRates: {}, formationStratifiedOutcomes: {}, tacticCohorts: {}, completion: { games: 4, actions: 40, averageActions: 10 } },
  };
}

describe('formation audit canonical output', () => {
  it('defines exactly nine screen and two controlled follow-up experiments with valid plans and disjoint seeds', () => {
    const experiments = formationExperiments('all');
    expect(experiments.filter(item => item.group === 'screen')).toHaveLength(9);
    expect(experiments.filter(item => item.group === 'followups')).toHaveLength(2);
    expect(new Set(experiments.flatMap(item => [item.primaryPlan.offense, item.comparisonPlan.offense]))).toEqual(new Set(['i-form', 'shotgun', 'singleback']));
    expect(new Set(experiments.flatMap(item => [item.primaryPlan.defense, item.comparisonPlan.defense]))).toEqual(new Set(['4-3', 'nickel', 'goal-line']));
    const ranges = experiments.map(item => [item.seed, item.seed + item.pairs - 1]);
    expect(ranges.every((range, index) => ranges.every((other, otherIndex) => index === otherIndex || range[1] < other[0] || other[1] < range[0]))).toBe(true);
  });

  it('rejects invalid and reordered arguments', () => {
    expect(parseFormationAuditMode(['--mode', 'all'])).toBe('all');
    expect(() => parseFormationAuditMode(['all', '--mode'])).toThrow(/Usage/);
    expect(() => parseFormationAuditMode(['--mode', 'invalid'])).toThrow(/Usage/);
  });

  it('compacts reports without runtime or pair arrays while retaining classifications', () => {
    const compact = compactFormationReport(formationExperiments('screen')[0], report());
    expect(compact).toMatchObject({ gamesPerPair: 4, seedConvention: 'base-seed-plus-pair-index', requestedPairs: 2, completedPairs: 2, excludedPairs: 0, symmetry: { classification: 'inconclusive' }, primaryPlanEffect: { classification: { state: 'supported' } } });
    expect(compact).not.toHaveProperty('runtimeMs');
    expect(compact).not.toHaveProperty('pairEffects');
  });

  it('serializes the canonical root schema deterministically', () => {
    const experiment = formationExperiments('screen')[0], compact = compactFormationReport(experiment, report());
    const artifact = canonicalArtifact([compact]);
    expect(artifact).toMatchObject({ schema: 'chessball-formation-audit-v3', policy: { primary: 'heuristic', comparison: 'heuristic' }, screen: [compact], followups: [] });
    expect(serializeCanonicalArtifact(artifact)).toBe(serializeCanonicalArtifact(canonicalArtifact([compact])));
    expect(serializeCanonicalArtifact(artifact).endsWith('\n')).toBe(true);
  });

  it('assembles all experiments into the canonical artifact in definition order', () => {
    const experiments = formationExperiments('all');
    const artifact = canonicalArtifact(experiments.map(experiment => compactFormationReport(experiment, {
      ...report(), requestedPairs: experiment.pairs,
    })));
    expect(artifact.schema).toBe('chessball-formation-audit-v3');
    expect([...artifact.screen, ...artifact.followups].map(item => item.name)).toEqual(experiments.map(item => item.name));
    expect([...artifact.screen, ...artifact.followups].map(item => item.requestedPairs)).toEqual(experiments.map(item => item.pairs));
    expect(JSON.stringify(artifact)).not.toContain('runtimeMs');
    expect(serializeCanonicalArtifact(artifact)).toBe(`${JSON.stringify(artifact, null, 2)}\n`);
  });
});
