import { simulateBatch } from './engine/simulator';
import type { BalanceBucket } from './engine/simulator';

type CliOptions = {
  games: number;
  seed: number;
  maxActions: number;
  repeatLimit: number;
  balanceWinRateThreshold: number;
  balanceScoreThreshold: number;
  json: boolean;
};

const options = parseArgs(process.argv.slice(2));
const report = simulateBatch({
  games: options.games,
  seed: options.seed,
  maxActionsPerGame: options.maxActions,
  repeatLimit: options.repeatLimit,
  balanceWinRateThreshold: options.balanceWinRateThreshold,
  balanceScoreThreshold: options.balanceScoreThreshold,
});

if (options.json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  printReport(report);
}

if (report.crashed > 0) {
  process.exit(1);
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    games: 1_000,
    seed: 1,
    maxActions: 2_000,
    repeatLimit: 80,
    balanceWinRateThreshold: 0.1,
    balanceScoreThreshold: 2,
    json: false,
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const next = args[index + 1];
    if (arg === '--games' && next) {
      options.games = Number(next);
      index += 1;
    } else if (arg === '--seed' && next) {
      options.seed = Number(next);
      index += 1;
    } else if (arg === '--max-actions' && next) {
      options.maxActions = Number(next);
      index += 1;
    } else if (arg === '--repeat-limit' && next) {
      options.repeatLimit = Number(next);
      index += 1;
    } else if (arg === '--balance-win-threshold' && next) {
      options.balanceWinRateThreshold = Number(next);
      index += 1;
    } else if (arg === '--balance-score-threshold' && next) {
      options.balanceScoreThreshold = Number(next);
      index += 1;
    } else if (arg === '--json') {
      options.json = true;
    }
  }

  return options;
}

function printReport(report: ReturnType<typeof simulateBatch>): void {
  console.log(`Chessball simulator`);
  console.log(`Games: ${report.games}`);
  console.log(`Seed: ${report.seed}`);
  console.log(`Completed: ${report.completed}`);
  console.log(`Stalled: ${report.stalled}`);
  console.log(`Crashed: ${report.crashed}`);
  console.log(`Average actions: ${report.averageActions.toFixed(1)}`);
  console.log(`Score: home ${report.scoreDifferential.averageHomeScore.toFixed(1)} avg, away ${report.scoreDifferential.averageAwayScore.toFixed(1)} avg`);
  console.log(`Record: home ${report.scoreDifferential.homeWins}, away ${report.scoreDifferential.awayWins}, ties ${report.scoreDifferential.ties}`);
  console.log(`Balance: win delta ${formatPercent(report.balance.winRateDelta)}, score delta ${report.balance.averageScoreDelta.toFixed(2)}`);
  if (report.balance.warnings.length > 0) {
    console.log(`Balance warnings:`);
    for (const warning of report.balance.warnings) console.log(`  ${warning}`);
  }
  console.log('');
  console.log(`Policies:`);
  for (const [policy, summary] of Object.entries(report.byPolicy)) {
    console.log(`  ${policy}: ${summary.games} games, ${summary.completed} completed, ${summary.stalled} stalled, ${summary.crashed} crashed, ${summary.actions} actions`);
  }
  console.log('');
  printBalanceGroup('Policy balance', report.balanceByPolicy);
  printBalanceGroup('Opening kickoff balance', report.balanceByOpeningKickoff);
  printBalanceGroup('Opening receiver balance', report.balanceByOpeningReceiver);
  printBalanceGroup('Final direction balance', report.balanceByFinalDirection);
  console.log('');
  console.log(`Final phases: ${formatCounts(report.phases)}`);
  console.log(`Results: ${formatCounts(report.resultTypes)}`);
  console.log('');
  console.log(`Anomalies: ${report.anomalies.length}`);
  for (const anomaly of report.anomalies.slice(0, 10)) {
    console.log(`  game ${anomaly.game} ${anomaly.policy} seed ${anomaly.seed}: ${anomaly.type} at ${anomaly.phase} action ${anomaly.actionIndex} - ${anomaly.message}`);
  }
}

function printBalanceGroup(title: string, group: Record<string, BalanceBucket>): void {
  console.log(`${title}:`);
  for (const [label, bucket] of Object.entries(group)) {
    console.log(
      `  ${label}: ${bucket.games} games, home ${bucket.homeWins}, away ${bucket.awayWins}, ties ${bucket.ties}, ` +
        `avg ${bucket.averageHomeScore.toFixed(1)}-${bucket.averageAwayScore.toFixed(1)}, ` +
        `win delta ${formatPercent(bucket.balance.winRateDelta)}, score delta ${bucket.balance.averageScoreDelta.toFixed(2)}`,
    );
    for (const warning of bucket.balance.warnings) console.log(`    ${warning}`);
  }
}

function formatCounts(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([key]) => key !== 'total')
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => `${key}=${value}`)
    .join(', ') || 'none';
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
