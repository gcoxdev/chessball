import {
  simulateGame,
  type CountMap,
  type SimulateGameOptions,
  type SimulatedGame,
  type SimulationAnomaly,
  type SimulationFormationPlan,
  type SimulationPolicy,
  type SimulationStatus,
} from './simulator';

export type BootstrapInterval = { low: number; high: number; mean: number; seed: number; samples: number; confidence: number };

export function pairedBootstrapInterval(
  pairEffects: number[],
  options: { seed: number; samples?: number; confidence?: number },
): BootstrapInterval {
  if (!pairEffects.length || pairEffects.some(value => !Number.isFinite(value))) throw new Error('pairEffects must contain finite values');
  const samples = options.samples ?? 10_000;
  const confidence = options.confidence ?? .95;
  validateBootstrapOptions({ seed: options.seed, samples, confidence });
  const random = seededRandom(options.seed);
  const means = Array.from({ length: samples }, () => {
    let sum = 0;
    for (let index = 0; index < pairEffects.length; index++) sum += pairEffects[Math.floor(random() * pairEffects.length)];
    return sum / pairEffects.length;
  }).sort((a, b) => a - b);
  const tail = (1 - confidence) / 2;
  return {
    low: percentile(means, tail),
    high: percentile(means, 1 - tail),
    mean: average(pairEffects), seed: options.seed, samples, confidence,
  };
}

export function classifyPairedEffect(interval: BootstrapInterval): 'positive' | 'negative' | 'inconclusive' {
  if (interval.low > 0) return 'positive';
  if (interval.high < 0) return 'negative';
  return 'inconclusive';
}

export function classifySymmetry(winShare: BootstrapInterval, scoreDelta: BootstrapInterval): 'actionable' | 'inconclusive' {
  const winExcludesHalf = winShare.low > .5 || winShare.high < .5;
  const scoreExcludesZero = scoreDelta.low > 0 || scoreDelta.high < 0;
  return (winExcludesHalf && Math.abs(winShare.mean - .5) >= .05) || (scoreExcludesZero && Math.abs(scoreDelta.mean) >= 1)
    ? 'actionable' : 'inconclusive';
}

export function classifySkillGap(interval: BootstrapInterval): { state: 'supported' | 'inconclusive'; effect: number; interval: BootstrapInterval } {
  return { state: interval.low > .5 ? 'supported' : 'inconclusive', effect: interval.mean - .5, interval };
}

export type RunMatchedAuditOptions = {
  pairs: number;
  seed: number;
  primary: SimulationPolicy;
  comparison: SimulationPolicy;
  maxActions?: number;
  repeatLimit?: number;
  formationPlan?: SimulationFormationPlan;
  bootstrap?: { seed: number; samples?: number; confidence?: number };
  simulator?: (options: SimulateGameOptions) => SimulatedGame;
};

type MirrorDisclosure = { mirror: 'A' | 'B'; seed: number; status: SimulationStatus; anomalies: SimulationAnomaly[] };
type Cohort = { policy: SimulationPolicy; team: 'home' | 'away'; games: number; actionSelections: CountMap; actionOpportunities: CountMap };

export type MatchedAuditReport = {
  requestedPairs: number; completedPairs: number; excludedPairs: number; attemptedGames: number;
  seedConvention: 'base-seed-plus-pair-index'; seedList: number[]; seedRange: { first: number; last: number };
  statusCounts: Record<SimulationStatus, number>;
  excludedPairDetails: Array<{ pair: number; seed: number; mirrors: MirrorDisclosure[] }>;
  anomalies: Array<SimulationAnomaly & { pair: number; mirror: 'A' | 'B'; seed: number }>;
  symmetry: { pairEffects: number[]; scoreDeltaEffects: number[]; winShareInterval: BootstrapInterval | null; scoreDeltaInterval: BootstrapInterval | null; classification: 'actionable' | 'inconclusive' };
  skillGap: { pairEffects: number[]; scoreDeltaEffects: number[]; primaryWins: number; comparisonWins: number; ties: number; winShareInterval: BootstrapInterval | null; scoreDeltaInterval: BootstrapInterval | null; classification: ReturnType<typeof classifySkillGap> | null };
  telemetry: { actionTypes: CountMap; actionOpportunities: CountMap; formationChoices: CountMap; driveOutcomes: CountMap; selectionRates: Record<string, number>; formationStratifiedOutcomes: Record<string, { games: number; wins: number; losses: number; ties: number }>; completion: { games: number; actions: number; averageActions: number | null }; tacticCohorts: Cohort[] };
};

export function runMatchedAudit(options: RunMatchedAuditOptions): MatchedAuditReport {
  if (!Number.isInteger(options.pairs) || options.pairs <= 0) throw new Error('pairs must be a positive integer');
  if (!Number.isInteger(options.seed)) throw new Error('seed must be a finite integer');
  const simulator = options.simulator ?? simulateGame;
  const bootstrap = options.bootstrap ?? { seed: options.seed };
  validateBootstrapOptions({ seed: bootstrap.seed, samples: bootstrap.samples ?? 10_000, confidence: bootstrap.confidence ?? .95 });
  const seedList = Array.from({ length: options.pairs }, (_, index) => options.seed + index);
  const statusCounts = { completed: 0, stalled: 0, crashed: 0 };
  const excludedPairDetails: MatchedAuditReport['excludedPairDetails'] = [];
  const anomalies: MatchedAuditReport['anomalies'] = [];
  const games: Array<{ game: SimulatedGame; policyByTeam: Record<'home' | 'away', SimulationPolicy> }> = [];
  const homeShares: number[] = [], homeScoreDeltas: number[] = [], primaryShares: number[] = [], primaryScoreDeltas: number[] = [];
  let primaryWins = 0, comparisonWins = 0, ties = 0;

  for (let pair = 0; pair < options.pairs; pair++) {
    const seed = seedList[pair];
    const common = { seed, maxActions: options.maxActions, repeatLimit: options.repeatLimit };
    const aOptions: SimulateGameOptions = { ...common, policies: { home: options.primary, away: options.comparison }, opening: { coinWinner: 'home', choice: 'receive' }, formationPlan: options.formationPlan };
    const bOptions: SimulateGameOptions = { ...common, policies: { home: options.comparison, away: options.primary }, opening: { coinWinner: 'away', choice: 'receive' }, formationPlan: options.formationPlan && { home: options.formationPlan.away, away: options.formationPlan.home } };
    const mirrors = [simulator(aOptions), simulator(bOptions)] as const;
    mirrors.forEach((game, index) => {
      statusCounts[game.status]++;
      game.anomalies.forEach(anomaly => anomalies.push({ ...anomaly, pair, mirror: index ? 'B' : 'A', seed }));
    });
    if (mirrors.some(game => game.status !== 'completed')) {
      excludedPairDetails.push({ pair, seed, mirrors: mirrors.map((game, index) => ({ mirror: index ? 'B' : 'A', seed, status: game.status, anomalies: game.anomalies })) });
      continue;
    }
    games.push({ game: mirrors[0], policyByTeam: aOptions.policies! }, { game: mirrors[1], policyByTeam: bOptions.policies! });
    const [a, b] = mirrors.map(game => game.summary.finalScore);
    homeShares.push(average([outcome(a.home, a.away), outcome(b.home, b.away)]));
    homeScoreDeltas.push(average([a.home - a.away, b.home - b.away]));
    const primaryOutcomes = [outcome(a.home, a.away), outcome(b.away, b.home)];
    primaryShares.push(average(primaryOutcomes));
    primaryScoreDeltas.push(average([a.home - a.away, b.away - b.home]));
    for (const result of primaryOutcomes) result === 1 ? primaryWins++ : result === 0 ? comparisonWins++ : ties++;
  }

  const winInterval = intervalOrNull(homeShares, bootstrap);
  const scoreInterval = intervalOrNull(homeScoreDeltas, bootstrap);
  const primaryInterval = intervalOrNull(primaryShares, bootstrap);
  const primaryScoreInterval = intervalOrNull(primaryScoreDeltas, bootstrap);
  const telemetry = aggregateTelemetry(games);
  return {
    requestedPairs: options.pairs, completedPairs: games.length / 2, excludedPairs: excludedPairDetails.length, attemptedGames: options.pairs * 2,
    seedConvention: 'base-seed-plus-pair-index', seedList, seedRange: { first: seedList[0], last: seedList[seedList.length - 1] }, statusCounts,
    excludedPairDetails, anomalies,
    symmetry: { pairEffects: homeShares, scoreDeltaEffects: homeScoreDeltas, winShareInterval: winInterval, scoreDeltaInterval: scoreInterval, classification: winInterval && scoreInterval ? classifySymmetry(winInterval, scoreInterval) : 'inconclusive' },
    skillGap: { pairEffects: primaryShares, scoreDeltaEffects: primaryScoreDeltas, primaryWins, comparisonWins, ties, winShareInterval: primaryInterval, scoreDeltaInterval: primaryScoreInterval, classification: primaryInterval ? classifySkillGap(primaryInterval) : null },
    telemetry,
  };
}

function aggregateTelemetry(games: Array<{ game: SimulatedGame; policyByTeam: Record<'home' | 'away', SimulationPolicy> }>): MatchedAuditReport['telemetry'] {
  const actionTypes = countMap(), actionOpportunities = countMap(), formationChoices = countMap(), driveOutcomes = countMap();
  const cohorts = new Map<string, Cohort>();
  const formationStratifiedOutcomes: MatchedAuditReport['telemetry']['formationStratifiedOutcomes'] = {};
  let actions = 0;
  for (const { game, policyByTeam } of games) {
    actions += game.summary.actions;
    merge(actionTypes, game.summary.actionTypes); merge(actionOpportunities, game.summary.actionOpportunities);
    merge(formationChoices, game.summary.formationChoices); merge(driveOutcomes, game.summary.driveOutcomes);
    for (const team of ['home', 'away'] as const) {
      const key = `${policyByTeam[team]}:${team}`;
      const cohort = cohorts.get(key) ?? { policy: policyByTeam[team], team, games: 0, actionSelections: countMap(), actionOpportunities: countMap() };
      cohort.games++;
      mergeMatching(cohort.actionSelections, game.summary.actionTypes, `team=${team}|policy=${policyByTeam[team]}|`);
      mergeMatching(cohort.actionOpportunities, game.summary.actionOpportunities, `team=${team}|policy=${policyByTeam[team]}|`);
      cohorts.set(key, cohort);
      const score = game.summary.finalScore;
      const result = outcome(score[team], score[team === 'home' ? 'away' : 'home']);
      const formationsUsed = new Set([...game.summary.formationSelections[team].offense, ...game.summary.formationSelections[team].defense]);
      for (const formation of formationsUsed) {
        const stratum = formationStratifiedOutcomes[`${key}|formation=${formation}`] ?? { games: 0, wins: 0, losses: 0, ties: 0 };
        stratum.games++; result === 1 ? stratum.wins++ : result === 0 ? stratum.losses++ : stratum.ties++;
        formationStratifiedOutcomes[`${key}|formation=${formation}`] = stratum;
      }
    }
  }
  const selectionRates: Record<string, number> = {};
  for (const [key, opportunities] of Object.entries(actionOpportunities)) if (key !== 'total' && opportunities > 0) selectionRates[key] = (actionTypes[key] ?? 0) / opportunities;
  return { actionTypes, actionOpportunities, formationChoices, driveOutcomes, selectionRates, formationStratifiedOutcomes, completion: { games: games.length, actions, averageActions: games.length ? actions / games.length : null }, tacticCohorts: [...cohorts.values()] };
}

function intervalOrNull(values: number[], options: { seed: number; samples?: number; confidence?: number }): BootstrapInterval | null { return values.length ? pairedBootstrapInterval(values, options) : null; }
function validateBootstrapOptions(options: { seed: number; samples: number; confidence: number }): void {
  if (!Number.isInteger(options.seed)) throw new Error('bootstrap seed must be a finite integer');
  if (!Number.isInteger(options.samples) || options.samples <= 0) throw new Error('samples must be a positive integer');
  if (!Number.isFinite(options.confidence) || options.confidence <= 0 || options.confidence >= 1) throw new Error('confidence must be between zero and one');
}
function outcome(forScore: number, againstScore: number): number { return forScore > againstScore ? 1 : forScore < againstScore ? 0 : .5; }
function average(values: number[]): number { return values.reduce((sum, value) => sum + value, 0) / values.length; }
function percentile(sorted: number[], probability: number): number { return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(probability * sorted.length)))]; }
function countMap(): CountMap { return { total: 0 }; }
function merge(target: CountMap, source: CountMap): void { for (const [key, value] of Object.entries(source)) target[key] = (target[key] ?? 0) + value; }
function mergeMatching(target: CountMap, source: CountMap, prefix: string): void {
  for (const [key, value] of Object.entries(source)) if (key !== 'total' && key.startsWith(prefix)) {
    target[key] = (target[key] ?? 0) + value;
    target.total += value;
  }
}
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; };
}
