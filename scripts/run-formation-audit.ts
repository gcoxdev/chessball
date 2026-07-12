import { runMatchedAudit, type MatchedAuditReport } from '../src/engine/audit';
import type { SimulationFormationPlan } from '../src/engine/simulator';

declare const process: { argv: string[] };

type Mode = 'screen' | 'followups' | 'all';
type Experiment = {
  name: string;
  pairs: number;
  seed: number;
  bootstrapSeed: number;
  primaryPlan: SimulationFormationPlan['home'];
  comparisonPlan: SimulationFormationPlan['away'];
};

const MAX_ACTIONS = 5_000;
const BOOTSTRAP_SAMPLES = 10_000;
const CONFIDENCE = .95;
const REFERENCE = { offense: 'i-form', defense: '4-3' };
const OFFENSES = ['i-form', 'shotgun', 'singleback'];
const DEFENSES = ['4-3', 'nickel', 'goal-line'];

function screenExperiments(): Experiment[] {
  let index = 0;
  return OFFENSES.flatMap(offense => DEFENSES.map(defense => {
    const experiment = {
      name: `screen-${offense}-${defense}-vs-i-form-4-3`,
      pairs: 100,
      seed: 10_001 + index * 100,
      bootstrapSeed: 71 + index,
      primaryPlan: { offense, defense },
      comparisonPlan: REFERENCE,
    };
    index++;
    return experiment;
  }));
}

function followupExperiments(): Experiment[] {
  return [
    {
      name: 'followup-goal-line-vs-4-3', pairs: 1_000, seed: 20_001, bootstrapSeed: 91,
      primaryPlan: { offense: 'i-form', defense: 'goal-line' }, comparisonPlan: REFERENCE,
    },
    {
      name: 'followup-shotgun-vs-i-form', pairs: 1_000, seed: 21_001, bootstrapSeed: 92,
      primaryPlan: { offense: 'shotgun', defense: '4-3' }, comparisonPlan: REFERENCE,
    },
  ];
}

function parseMode(args: string[]): Mode {
  if (args.length !== 2 || args[0] !== '--mode' || !['screen', 'followups', 'all'].includes(args[1])) {
    throw new Error('Usage: npm exec vite-node scripts/run-formation-audit.ts -- --mode screen|followups|all');
  }
  return args[1] as Mode;
}

function compact(experiment: Experiment, report: MatchedAuditReport, runtimeMs: number) {
  return {
    ...experiment,
    policy: { primary: 'heuristic', comparison: 'heuristic' },
    maxActions: MAX_ACTIONS,
    bootstrap: { samples: BOOTSTRAP_SAMPLES, confidence: CONFIDENCE },
    seedConvention: report.seedConvention,
    seedRange: report.seedRange,
    requestedPairs: report.requestedPairs,
    completedPairs: report.completedPairs,
    excludedPairs: report.excludedPairs,
    statusCounts: report.statusCounts,
    anomalyCount: report.anomalies.length,
    runtimeMs,
    homeSymmetry: {
      winShareInterval: report.symmetry.winShareInterval,
      scoreDeltaInterval: report.symmetry.scoreDeltaInterval,
    },
    primaryPlanEffect: {
      wins: report.skillGap.primaryWins,
      comparisonWins: report.skillGap.comparisonWins,
      ties: report.skillGap.ties,
      winShareInterval: report.skillGap.winShareInterval,
      scoreDeltaInterval: report.skillGap.scoreDeltaInterval,
    },
    completion: report.telemetry.completion,
    driveOutcomes: report.telemetry.driveOutcomes,
  };
}

const mode = parseMode(process.argv.slice(2));
const experiments = mode === 'screen' ? screenExperiments() : mode === 'followups' ? followupExperiments() : [...screenExperiments(), ...followupExperiments()];
const results = experiments.map(experiment => {
  const started = Date.now();
  const report = runMatchedAudit({
    pairs: experiment.pairs,
    seed: experiment.seed,
    primary: 'heuristic',
    comparison: 'heuristic',
    maxActions: MAX_ACTIONS,
    formationPlan: { home: experiment.primaryPlan, away: experiment.comparisonPlan },
    bootstrap: { seed: experiment.bootstrapSeed, samples: BOOTSTRAP_SAMPLES, confidence: CONFIDENCE },
  });
  return compact(experiment, report, Date.now() - started);
});

console.log(JSON.stringify({ mode, experiments: results }, null, 2));
