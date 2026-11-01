import type { MatchedAuditReport } from './audit';
import type { SimulationFormationPlan } from './simulator';

export type FormationAuditMode = 'screen' | 'followups' | 'all';
export type FormationExperiment = {
  group: 'screen' | 'followups';
  name: string;
  pairs: number;
  seed: number;
  bootstrapSeed: number;
  primaryPlan: SimulationFormationPlan['home'];
  comparisonPlan: SimulationFormationPlan['away'];
};

export const FORMATION_AUDIT_MAX_ACTIONS = 5_000;
export const FORMATION_AUDIT_BOOTSTRAP = Object.freeze({ samples: 10_000, confidence: .95 });
const REFERENCE = Object.freeze({ offense: 'i-form', defense: '4-3' });
const OFFENSES = ['i-form', 'shotgun', 'singleback'];
const DEFENSES = ['4-3', 'nickel', 'goal-line'];

export function formationExperiments(mode: FormationAuditMode): FormationExperiment[] {
  let index = 0;
  const screen = OFFENSES.flatMap(offense => DEFENSES.map(defense => {
    const experiment: FormationExperiment = {
      group: 'screen', name: `screen-${offense}-${defense}-vs-i-form-4-3`, pairs: 100,
      seed: 10_001 + index * 100, bootstrapSeed: 71 + index,
      primaryPlan: { offense, defense }, comparisonPlan: { ...REFERENCE },
    };
    index++;
    return experiment;
  }));
  const followups: FormationExperiment[] = [
    { group: 'followups', name: 'followup-goal-line-vs-4-3', pairs: 1_000, seed: 20_001, bootstrapSeed: 91, primaryPlan: { offense: 'i-form', defense: 'goal-line' }, comparisonPlan: { ...REFERENCE } },
    { group: 'followups', name: 'followup-shotgun-vs-i-form', pairs: 1_000, seed: 21_001, bootstrapSeed: 92, primaryPlan: { offense: 'shotgun', defense: '4-3' }, comparisonPlan: { ...REFERENCE } },
  ];
  return mode === 'screen' ? screen : mode === 'followups' ? followups : [...screen, ...followups];
}

export function parseFormationAuditMode(args: string[]): FormationAuditMode {
  if (args.length !== 2 || args[0] !== '--mode' || !['screen', 'followups', 'all'].includes(args[1])) {
    throw new Error('Usage: npm exec vite-node scripts/run-formation-audit.ts -- --mode screen|followups|all');
  }
  return args[1] as FormationAuditMode;
}

export function compactFormationReport(experiment: FormationExperiment, report: MatchedAuditReport) {
  return {
    group: experiment.group,
    name: experiment.name,
    matchup: { primary: 'heuristic' as const, comparison: 'heuristic' as const },
    primaryPlan: experiment.primaryPlan,
    comparisonPlan: experiment.comparisonPlan,
    maxActions: FORMATION_AUDIT_MAX_ACTIONS,
    bootstrap: { seed: experiment.bootstrapSeed, ...FORMATION_AUDIT_BOOTSTRAP },
    gamesPerPair: report.gamesPerPair,
    seedConvention: report.seedConvention,
    seedRange: report.seedRange,
    requestedPairs: report.requestedPairs,
    completedPairs: report.completedPairs,
    excludedPairs: report.excludedPairs,
    attemptedGames: report.attemptedGames,
    statusCounts: report.statusCounts,
    anomalyCount: report.anomalies.length,
    symmetry: {
      winShareInterval: report.symmetry.winShareInterval,
      scoreDeltaInterval: report.symmetry.scoreDeltaInterval,
      classification: report.symmetry.classification,
    },
    primaryPlanEffect: {
      wins: report.skillGap.primaryWins,
      comparisonWins: report.skillGap.comparisonWins,
      ties: report.skillGap.ties,
      winShareInterval: report.skillGap.winShareInterval,
      scoreDeltaInterval: report.skillGap.scoreDeltaInterval,
      classification: report.skillGap.classification,
    },
    completion: report.telemetry.completion,
    driveOutcomes: report.telemetry.driveOutcomes,
  };
}

export type CompactFormationReport = ReturnType<typeof compactFormationReport>;

export function canonicalArtifact(reports: CompactFormationReport[]) {
  return {
    schema: 'chessball-formation-audit-v3' as const,
    runner: 'scripts/run-formation-audit.ts',
    command: 'npm exec vite-node scripts/run-formation-audit.ts -- --mode all',
    policy: { primary: 'heuristic' as const, comparison: 'heuristic' as const },
    screen: reports.filter(report => report.group === 'screen'),
    followups: reports.filter(report => report.group === 'followups'),
  };
}

export function serializeCanonicalArtifact(artifact: ReturnType<typeof canonicalArtifact>): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
