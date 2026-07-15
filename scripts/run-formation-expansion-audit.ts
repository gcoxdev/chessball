import { runMatchedAudit } from '../src/engine/audit';
import { formationExpansionAuditOutput } from '../src/engine/formation-expansion-audit';

declare const process: { argv: string[]; stdout: { write(value: string): void } };

process.stdout.write(formationExpansionAuditOutput(process.argv.slice(2), runMatchedAudit));
