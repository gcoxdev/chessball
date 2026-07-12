import { runMatchedAudit } from '../src/engine/audit';
import {
  canonicalArtifact,
  compactFormationReport,
  FORMATION_AUDIT_BOOTSTRAP,
  FORMATION_AUDIT_MAX_ACTIONS,
  formationExperiments,
  parseFormationAuditMode,
  serializeCanonicalArtifact,
} from '../src/engine/formation-audit-runner';

declare const process: { argv: string[]; stdout: { write(value: string): void } };

const mode = parseFormationAuditMode(process.argv.slice(2));
const reports = formationExperiments(mode).map(experiment => compactFormationReport(experiment, runMatchedAudit({
  pairs: experiment.pairs,
  seed: experiment.seed,
  primary: 'heuristic',
  comparison: 'heuristic',
  maxActions: FORMATION_AUDIT_MAX_ACTIONS,
  formationPlan: { home: experiment.primaryPlan, away: experiment.comparisonPlan },
  bootstrap: { seed: experiment.bootstrapSeed, ...FORMATION_AUDIT_BOOTSTRAP },
})));

process.stdout.write(serializeCanonicalArtifact(canonicalArtifact(reports)));
