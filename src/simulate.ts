import { runMatchedAudit, type BootstrapInterval, type MatchedAuditReport, type RunMatchedAuditOptions } from './engine/audit';
import { simulateBatch, type BalanceBucket, type SimulationBatchReport, type SimulationPolicy } from './engine/simulator';

export type CliOptions = {
  audit: boolean;
  games: number;
  pairs: number;
  seed: number;
  maxActions: number;
  repeatLimit: number;
  balanceWinRateThreshold: number;
  balanceScoreThreshold: number;
  homePolicy: SimulationPolicy;
  awayPolicy: SimulationPolicy;
  json: boolean;
};

type CliDependencies = {
  simulateBatch: (options: Parameters<typeof simulateBatch>[0]) => SimulationBatchReport;
  runMatchedAudit: (options: RunMatchedAuditOptions) => MatchedAuditReport;
  write: (output: string) => void;
};

const DEFAULT_PAIRS = 100;

export function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    audit: false,
    games: 1_000,
    pairs: DEFAULT_PAIRS,
    seed: 1,
    maxActions: 2_000,
    repeatLimit: 80,
    balanceWinRateThreshold: 0.1,
    balanceScoreThreshold: 2,
    homePolicy: 'heuristic',
    awayPolicy: 'random',
    json: false,
  };
  let pairsWasProvided = false;
  let gamesWasProvided = false;
  let policyWasProvided = false;

  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === '--audit') options.audit = true;
    else if (flag === '--json') options.json = true;
    else {
      const value = args[index + 1];
      if (!knownValueFlags.has(flag)) throw new Error(`Unknown flag: ${flag}`);
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      index += 1;
      switch (flag) {
        case '--games': options.games = positiveInteger(flag, value); gamesWasProvided = true; break;
        case '--pairs': options.pairs = positiveInteger(flag, value); pairsWasProvided = true; break;
        case '--seed': options.seed = uint32(flag, value); break;
        case '--max-actions': options.maxActions = positiveInteger(flag, value); break;
        case '--repeat-limit': options.repeatLimit = positiveInteger(flag, value); break;
        case '--balance-win-threshold': options.balanceWinRateThreshold = boundedNumber(flag, value, 0, 1); break;
        case '--balance-score-threshold': options.balanceScoreThreshold = minimumNumber(flag, value, 0); break;
        case '--home-policy': options.homePolicy = policy(flag, value); policyWasProvided = true; break;
        case '--away-policy': options.awayPolicy = policy(flag, value); policyWasProvided = true; break;
      }
    }
  }

  if (pairsWasProvided && !options.audit) throw new Error('--pairs requires --audit; --games remains the ordinary batch count');
  if (gamesWasProvided && options.audit) throw new Error('--games is a batch option and cannot be combined with --audit; use --pairs');
  if (policyWasProvided && !options.audit) throw new Error('--home-policy and --away-policy require --audit');
  if (options.audit && options.seed + options.pairs - 1 > 0xffff_ffff) throw new Error(`--seed ${options.seed} with --pairs ${options.pairs} exceeds the uint32 seed range`);
  return options;
}

const knownValueFlags = new Set([
  '--games', '--pairs', '--seed', '--max-actions', '--repeat-limit', '--balance-win-threshold',
  '--balance-score-threshold', '--home-policy', '--away-policy',
]);

function numericValue(flag: string, value: string): number {
  if (value.trim() === '') throw new Error(`${flag} requires a numeric value; received an empty value`);
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`${flag} requires a finite numeric value; received ${JSON.stringify(value)}`);
  return parsed;
}

function positiveInteger(flag: string, value: string): number {
  const parsed = numericValue(flag, value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${flag} requires a positive integer; received ${JSON.stringify(value)}`);
  return parsed;
}

function uint32(flag: string, value: string): number {
  const parsed = numericValue(flag, value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 0xffff_ffff) throw new Error(`${flag} requires a uint32 integer; received ${JSON.stringify(value)}`);
  return parsed;
}

function boundedNumber(flag: string, value: string, minimum: number, maximum: number): number {
  const parsed = numericValue(flag, value);
  if (parsed < minimum || parsed > maximum) throw new Error(`${flag} must be between ${minimum} and ${maximum}; received ${JSON.stringify(value)}`);
  return parsed;
}

function minimumNumber(flag: string, value: string, minimum: number): number {
  const parsed = numericValue(flag, value);
  if (parsed < minimum) throw new Error(`${flag} must be at least ${minimum}; received ${JSON.stringify(value)}`);
  return parsed;
}

function policy(flag: string, value: string): SimulationPolicy {
  if (value !== 'heuristic' && value !== 'random') throw new Error(`${flag} must be heuristic or random; received ${JSON.stringify(value)}`);
  return value;
}

export function exitCodeForBatchReport(report: Pick<SimulationBatchReport, 'crashed'>): number {
  return report.crashed > 0 ? 1 : 0;
}

export function exitCodeForAuditReport(report: Pick<MatchedAuditReport, 'excludedPairs' | 'statusCounts'>): number {
  return report.excludedPairs > 0 || report.statusCounts.stalled > 0 || report.statusCounts.crashed > 0 ? 1 : 0;
}

export function runCli(args: string[], dependencies: Partial<CliDependencies> = {}): number {
  const options = parseArgs(args);
  const deps: CliDependencies = {
    simulateBatch,
    runMatchedAudit,
    write: output => console.log(output),
    ...dependencies,
  };

  if (!options.audit) {
    const report = deps.simulateBatch({
      games: options.games,
      seed: options.seed,
      maxActionsPerGame: options.maxActions,
      repeatLimit: options.repeatLimit,
      balanceWinRateThreshold: options.balanceWinRateThreshold,
      balanceScoreThreshold: options.balanceScoreThreshold,
    });
    deps.write(options.json ? JSON.stringify(report, null, 2) : formatBatchReport(report));
    return exitCodeForBatchReport(report);
  }

  try {
    const report = deps.runMatchedAudit({
      pairs: options.pairs,
      seed: options.seed,
      primary: options.homePolicy,
      comparison: options.awayPolicy,
      maxActions: options.maxActions,
      repeatLimit: options.repeatLimit,
    });
    deps.write(options.json ? JSON.stringify(report, null, 2) : formatAuditReport(report));
    return exitCodeForAuditReport(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.write(options.json ? JSON.stringify({ error: message }) : `Audit failed: ${message}`);
    return 1;
  }
}

function formatBatchReport(report: SimulationBatchReport): string {
  const lines = [
    'Chessball simulator',
    `Games: ${report.games}`,
    `Seed: ${report.seed}`,
    `Attempted: ${report.games}`,
    `Completed: ${report.completed}`,
    `Stalled: ${report.stalled}`,
    `Crashed: ${report.crashed}`,
    `Balance sample: ${report.balance.games} completed games`,
    `Average actions: ${formatMetric(report.averageActions, 1)}`,
    `Score: home ${formatMetric(report.scoreDifferential.averageHomeScore, 1)} avg, away ${formatMetric(report.scoreDifferential.averageAwayScore, 1)} avg`,
    `Record: home ${report.scoreDifferential.homeWins}, away ${report.scoreDifferential.awayWins}, ties ${report.scoreDifferential.ties}`,
    `Balance: win delta ${formatPercent(report.balance.winRateDelta)}, score delta ${formatMetric(report.balance.averageScoreDelta, 2)}`,
  ];
  if (report.balance.warnings.length) lines.push('Balance warnings:', ...report.balance.warnings.map(warning => `  ${warning}`));
  lines.push('', 'Policies:');
  for (const [name, summary] of Object.entries(report.byPolicy)) lines.push(`  ${name}: ${summary.games} attempted, ${summary.completed} completed, ${summary.stalled} stalled, ${summary.crashed} crashed, ${summary.actions} actions`);
  lines.push('', ...formatBalanceGroup('Policy balance', report.balanceByPolicy), ...formatBalanceGroup('Opening kickoff balance', report.balanceByOpeningKickoff), ...formatBalanceGroup('Opening receiver balance', report.balanceByOpeningReceiver), ...formatBalanceGroup('Final direction balance', report.balanceByFinalDirection));
  lines.push('', `Final phases: ${formatCounts(report.phases)}`, `Results: ${formatCounts(report.resultTypes)}`, '', `Anomalies: ${report.anomalies.length}`);
  for (const anomaly of report.anomalies.slice(0, 10)) lines.push(`  game ${anomaly.game} ${anomaly.policy} seed ${anomaly.seed}: ${anomaly.type} at ${anomaly.phase} action ${anomaly.actionIndex} - ${anomaly.message}`);
  return lines.join('\n');
}

function formatAuditReport(report: MatchedAuditReport): string {
  return [
    'Chessball matched audit',
    `Matchup: ${report.matchup.primary} vs ${report.matchup.comparison}`,
    `Pairs: ${report.requestedPairs} requested, ${report.completedPairs} completed, ${report.excludedPairs} excluded`,
    `Attempted games: ${report.attemptedGames}`,
    `Statuses: ${report.statusCounts.completed} completed, ${report.statusCounts.stalled} stalled, ${report.statusCounts.crashed} crashed`,
    `Symmetry win-share interval: ${formatInterval(report.symmetry.winShareInterval)} (${report.symmetry.classification})`,
    `Symmetry score-delta interval: ${formatInterval(report.symmetry.scoreDeltaInterval)}`,
    `Skill win-share interval: ${formatInterval(report.skillGap.winShareInterval)} (${report.skillGap.classification?.state ?? 'inconclusive'})`,
    `Skill score-delta interval: ${formatInterval(report.skillGap.scoreDeltaInterval)}`,
    `Incomplete evidence: ${report.excludedPairs || report.statusCounts.stalled || report.statusCounts.crashed ? 'yes' : 'no'}`,
  ].join('\n');
}

function formatInterval(interval: BootstrapInterval | null): string {
  return interval ? `${formatMetric(interval.low, 3)}..${formatMetric(interval.high, 3)} (mean ${formatMetric(interval.mean, 3)})` : 'n/a';
}

function formatBalanceGroup(title: string, group: Record<string, BalanceBucket>): string[] {
  const lines = [`${title}:`];
  for (const [label, bucket] of Object.entries(group)) {
    lines.push(`  ${label}: ${bucket.games} completed, home ${bucket.homeWins}, away ${bucket.awayWins}, ties ${bucket.ties}, avg ${formatMetric(bucket.averageHomeScore, 1)}-${formatMetric(bucket.averageAwayScore, 1)}, win delta ${formatPercent(bucket.balance.winRateDelta)}, score delta ${formatMetric(bucket.balance.averageScoreDelta, 2)}`);
    lines.push(...bucket.balance.warnings.map(warning => `    ${warning}`));
  }
  return lines;
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts).filter(([key]) => key !== 'total').sort((a, b) => b[1] - a[1]).map(([key, value]) => `${key}=${value}`).join(', ') || 'none';
}

function formatMetric(value: number | null, digits: number): string { return value === null ? 'n/a' : value.toFixed(digits); }
function formatPercent(value: number | null): string { return value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`; }
