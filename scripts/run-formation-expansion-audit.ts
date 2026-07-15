import { runMatchedAudit } from '../src/engine/audit';
import {
  canonicalFormationExpansionArtifact,
  FORMATION_EXPANSION_BOOTSTRAP,
  FORMATION_EXPANSION_MAX_ACTIONS,
  formationExpansionExperiments,
  serializeFormationExpansionArtifact,
  summarizeFormationComparison,
} from '../src/engine/formation-expansion-audit';

declare const process: { argv: string[]; stdout: { write(value: string): void } };

if (process.argv.slice(2).length) throw new Error('Usage: npm exec vite-node scripts/run-formation-expansion-audit.ts');

const groups = formationExpansionExperiments();
const summaries = groups.map(group => {
  const reports = group.cells.map(cell => runMatchedAudit({
    pairs: cell.pairs,
    seed: cell.seed,
    primary: 'heuristic',
    comparison: 'heuristic',
    maxActions: FORMATION_EXPANSION_MAX_ACTIONS,
    formationPlan: { home: cell.primaryPlan, away: cell.comparisonPlan },
    bootstrap: { seed: cell.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP },
  }));
  return summarizeFormationComparison(group, reports);
});

process.stdout.write(serializeFormationExpansionArtifact(canonicalFormationExpansionArtifact(groups, summaries)));
