import { pairedBootstrapInterval, type BootstrapInterval, type MatchedAuditReport, type RunMatchedAuditOptions } from './audit';
import { defensiveFormations, offensiveFormations } from './rules';
import type { SimulationFormationPlan } from './simulator';

export type FormationComparisonSide = 'offense' | 'defense';
export type FormationComparisonDirection = 'primary' | 'comparison';
export type FormationComparisonMetric = 'win-share' | 'score-delta';
export type FormationComparisonClassification =
  | 'incomplete'
  | 'inconclusive'
  | 'sub-threshold'
  | 'conflicting-metrics'
  | 'favorable-matchup'
  | 'split-direction'
  | 'credible-counter'
  | 'broad-dominance';

export type FormationExpansionCell = Readonly<{
  id: string;
  opposingFormationId: string;
  pairs: number;
  seed: number;
  seedRange: Readonly<{ first: number; last: number }>;
  bootstrapSeed: number;
  primaryPlan: Readonly<SimulationFormationPlan['home']>;
  comparisonPlan: Readonly<SimulationFormationPlan['away']>;
}>;

export type FormationExpansionExperiment = Readonly<{
  id: string;
  name: string;
  side: FormationComparisonSide;
  primaryId: string;
  comparisonId: string;
  bootstrapSeed: number;
  requestedPairs: number;
  cells: readonly FormationExpansionCell[];
}>;

export const FORMATION_EXPANSION_MAX_ACTIONS = 5_000;
export const FORMATION_EXPANSION_PAIRS_PER_CELL = 100;
export const FORMATION_EXPANSION_BOOTSTRAP = Object.freeze({ samples: 10_000, confidence: .95 });
export const FORMATION_EXPANSION_THRESHOLDS = Object.freeze({
  winShareNeutral: .5,
  winSharePracticalDifference: .05,
  scoreDeltaNeutral: 0,
  scoreDeltaPracticalDifference: 1,
  minimumSupportingCells: 4,
  requiredCompletedPairsPerCell: FORMATION_EXPANSION_PAIRS_PER_CELL,
});

const GROUP_DEFINITIONS = Object.freeze([
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
] as const);

const CELL_SEED_BASE = 100_001;
const CELL_BOOTSTRAP_SEED_BASE = 2_000_001;
const GROUP_BOOTSTRAP_SEED_BASE = 3_000_001;

export function formationExpansionExperiments(): readonly FormationExpansionExperiment[] {
  let cellIndex = 0;
  return Object.freeze(GROUP_DEFINITIONS.map(([id, name, side, primaryId, comparisonId], groupIndex) => {
    const opponents = side === 'offense' ? defensiveFormations : offensiveFormations;
    const cells = opponents.map(opponent => {
      const seed = CELL_SEED_BASE + cellIndex * FORMATION_EXPANSION_PAIRS_PER_CELL;
      const primaryPlan = side === 'offense'
        ? { offense: primaryId, defense: opponent.id }
        : { offense: opponent.id, defense: primaryId };
      const comparisonPlan = side === 'offense'
        ? { offense: comparisonId, defense: opponent.id }
        : { offense: opponent.id, defense: comparisonId };
      const cell = Object.freeze({
        id: `${id}-against-${opponent.id}`,
        opposingFormationId: opponent.id,
        pairs: FORMATION_EXPANSION_PAIRS_PER_CELL,
        seed,
        seedRange: Object.freeze({ first: seed, last: seed + FORMATION_EXPANSION_PAIRS_PER_CELL - 1 }),
        bootstrapSeed: CELL_BOOTSTRAP_SEED_BASE + cellIndex,
        primaryPlan: Object.freeze(primaryPlan),
        comparisonPlan: Object.freeze(comparisonPlan),
      });
      cellIndex++;
      return cell;
    });
    return Object.freeze({
      id, name, side, primaryId, comparisonId,
      bootstrapSeed: GROUP_BOOTSTRAP_SEED_BASE + groupIndex,
      requestedPairs: cells.reduce((sum, cell) => sum + cell.pairs, 0),
      cells: Object.freeze(cells),
    });
  }));
}

export type FormationExpansionCellReport = Readonly<{
  id: string;
  opposingFormationId: string;
  primaryPlan: Readonly<SimulationFormationPlan['home']>;
  comparisonPlan: Readonly<SimulationFormationPlan['away']>;
  requestedPairs: number;
  completedPairs: number;
  excludedPairs: number;
  attemptedGames: number;
  gamesPerPair: number;
  seedConvention: MatchedAuditReport['seedConvention'];
  seedRange: Readonly<MatchedAuditReport['seedRange']>;
  bootstrap: Readonly<{ seed: number; samples: number; confidence: number }>;
  statusCounts: Readonly<MatchedAuditReport['statusCounts']>;
  anomalyCount: number;
  completion: Readonly<MatchedAuditReport['telemetry']['completion']>;
  primaryWins: number;
  comparisonWins: number;
  ties: number;
  winShareInterval: Readonly<BootstrapInterval> | null;
  scoreDeltaInterval: Readonly<BootstrapInterval> | null;
}>;

export type FormationComparisonSummary = Readonly<{
  groupId: string;
  classification: FormationComparisonClassification;
  direction: FormationComparisonDirection | null;
  decisiveMetric: FormationComparisonMetric | null;
  supportingCells: number;
  credibleCounters: readonly string[];
  reasons: readonly string[];
  pooled: Readonly<{
    requestedPairs: number;
    completedPairs: number;
    winShareInterval: Readonly<BootstrapInterval> | null;
    scoreDeltaInterval: Readonly<BootstrapInterval> | null;
  }>;
  cells: readonly FormationExpansionCellReport[];
}>;

export function summarizeFormationComparison(
  group: FormationExpansionExperiment,
  cellReports: readonly MatchedAuditReport[],
): FormationComparisonSummary {
  const cells = group.cells.map((cell, index) => compactCellReport(cell, cellReports[index]));
  const incompleteReasons: string[] = [];
  if (cellReports.length !== group.cells.length) incompleteReasons.push(`Expected ${group.cells.length} cell reports; received ${cellReports.length}.`);
  cellReports.forEach((report, index) => {
    const cellId = group.cells[index]?.id ?? `unexpected-cell-${index + 1}`;
    incompleteReasons.push(...validateCellReport(group.cells[index], report, cellId));
  });
  const winEffects = cellReports.flatMap(report => Array.isArray(report.skillGap?.pairEffects) ? report.skillGap.pairEffects : []);
  const scoreEffects = cellReports.flatMap(report => Array.isArray(report.skillGap?.scoreDeltaEffects) ? report.skillGap.scoreDeltaEffects : []);
  if (winEffects.length !== group.requestedPairs) incompleteReasons.push(`Pooled win-share effects total ${winEffects.length}; expected ${group.requestedPairs}.`);
  if (scoreEffects.length !== group.requestedPairs) incompleteReasons.push(`Pooled score-delta effects total ${scoreEffects.length}; expected ${group.requestedPairs}.`);
  if (incompleteReasons.length || !cellReports.every(hasSkillGapIntervals)) return summary(group.id, 'incomplete', null, null, 0, [], incompleteReasons, Object.freeze({
    requestedPairs: group.requestedPairs,
    completedPairs: cellReports.reduce((sum, report) => sum + report.completedPairs, 0),
    winShareInterval: null,
    scoreDeltaInterval: null,
  }), cells);

  const validReports = cellReports.filter(hasSkillGapIntervals);
  const pooled = Object.freeze({
    requestedPairs: group.requestedPairs,
    completedPairs: validReports.reduce((sum, report) => sum + report.completedPairs, 0),
    winShareInterval: cloneInterval(pairedBootstrapInterval(winEffects, { seed: group.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP })),
    scoreDeltaInterval: cloneInterval(pairedBootstrapInterval(scoreEffects, { seed: group.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP })),
  });

  const winStatisticalLead = statisticalLead(pooled.winShareInterval, .5);
  const scoreStatisticalLead = statisticalLead(pooled.scoreDeltaInterval, 0);
  if (!winStatisticalLead && !scoreStatisticalLead) return summary(group.id, 'inconclusive', null, null, 0, [], [
    'Neither pooled 95% interval excludes neutral.',
  ], pooled, cells);
  const winLead = practicalLead(pooled.winShareInterval, .5, FORMATION_EXPANSION_THRESHOLDS.winSharePracticalDifference, winStatisticalLead);
  const scoreLead = practicalLead(pooled.scoreDeltaInterval, 0, FORMATION_EXPANSION_THRESHOLDS.scoreDeltaPracticalDifference, scoreStatisticalLead);
  if (winLead && scoreLead && winLead !== scoreLead) return summary(group.id, 'conflicting-metrics', null, null, 0, [], [
    'Win-share and score-delta leads are actionable in opposite directions.',
  ], pooled, cells);

  const decisiveMetric: FormationComparisonMetric | null = winLead ? 'win-share' : scoreLead ? 'score-delta' : null;
  const direction = winLead ?? scoreLead;
  if (!decisiveMetric || !direction) return summary(group.id, 'sub-threshold', null, null, 0, [], [
    'At least one pooled effect is statistically clear but remains below its practical threshold.',
  ], pooled, cells);

  const neutral = decisiveMetric === 'win-share' ? .5 : 0;
  const intervals = validReports.map(report => decisiveMetric === 'win-share' ? report.skillGap.winShareInterval : report.skillGap.scoreDeltaInterval);
  const supportingCells = intervals.filter(cellInterval => direction === 'primary' ? cellInterval.mean > neutral : cellInterval.mean < neutral).length;
  const credibleCounters = intervals.flatMap((cellInterval, index) => {
    const isCounter = direction === 'primary' ? cellInterval.low <= neutral : cellInterval.high >= neutral;
    return isCounter ? [group.cells[index].id] : [];
  });

  if (supportingCells < FORMATION_EXPANSION_THRESHOLDS.minimumSupportingCells) {
    const classification = supportingCells === group.cells.length / 2 ? 'split-direction' : 'favorable-matchup';
    return summary(group.id, classification, direction, decisiveMetric, supportingCells, credibleCounters, [
      `Only ${supportingCells} of ${group.cells.length} cell point estimates support the pooled ${direction} direction.`,
    ], pooled, cells);
  }
  if (credibleCounters.length) return summary(group.id, 'credible-counter', direction, decisiveMetric, supportingCells, credibleCounters, [
    `${credibleCounters.length} opposing cell interval(s) include neutral or favor the opposite direction.`,
  ], pooled, cells);
  return summary(group.id, 'broad-dominance', direction, decisiveMetric, supportingCells, [], [
    `The pooled ${decisiveMetric} lead is statistical, practical, supported by ${supportingCells} cells, and has no credible counter.`,
  ], pooled, cells);
}

type ReportWithIntervals = MatchedAuditReport & {
  skillGap: MatchedAuditReport['skillGap'] & { winShareInterval: BootstrapInterval; scoreDeltaInterval: BootstrapInterval };
};

function hasSkillGapIntervals(report: MatchedAuditReport): report is ReportWithIntervals {
  return report.skillGap?.winShareInterval !== null && report.skillGap?.winShareInterval !== undefined
    && report.skillGap?.scoreDeltaInterval !== null && report.skillGap?.scoreDeltaInterval !== undefined;
}

function validateCellReport(cell: FormationExpansionCell | undefined, report: MatchedAuditReport, cellId: string): string[] {
  const reasons: string[] = [];
  if (report.gamesPerPair !== 4) reasons.push(`${cellId} must use four games per seed group.`);
  if (report.requestedPairs !== FORMATION_EXPANSION_PAIRS_PER_CELL) reasons.push(`${cellId} requested ${report.requestedPairs} pairs; expected ${FORMATION_EXPANSION_PAIRS_PER_CELL}.`);
  if (report.completedPairs !== FORMATION_EXPANSION_PAIRS_PER_CELL) reasons.push(`${cellId} completed ${report.completedPairs} pairs; expected ${FORMATION_EXPANSION_PAIRS_PER_CELL}.`);
  if (report.excludedPairs) reasons.push(`${cellId} excluded ${report.excludedPairs} pairs.`);
  if (report.completedPairs + report.excludedPairs !== report.requestedPairs) reasons.push(`${cellId} completed-plus-excluded pairs do not equal requested pairs.`);
  if (report.attemptedGames !== FORMATION_EXPANSION_PAIRS_PER_CELL * 4) reasons.push(`${cellId} attempted ${report.attemptedGames} games; expected ${FORMATION_EXPANSION_PAIRS_PER_CELL * 4}.`);
  const statusTotal = report.statusCounts.completed + report.statusCounts.stalled + report.statusCounts.crashed;
  if (statusTotal !== report.attemptedGames) reasons.push(`${cellId} status counts total ${statusTotal} games; expected ${report.attemptedGames}.`);
  if (report.statusCounts.stalled) reasons.push(`${cellId} recorded ${report.statusCounts.stalled} stalled ${plural(report.statusCounts.stalled, 'game')}.`);
  if (report.statusCounts.crashed) reasons.push(`${cellId} recorded ${report.statusCounts.crashed} crashed ${plural(report.statusCounts.crashed, 'game')}.`);
  if (report.anomalies.length) {
    reasons.push(`${cellId} recorded ${report.anomalies.length} ${plural(report.anomalies.length, 'anomaly', 'anomalies')}.`);
    report.anomalies.forEach(anomaly => reasons.push(`${cellId} anomaly ${anomaly.type}: ${anomaly.message}`));
  }
  if (report.telemetry.completion.games !== report.completedPairs * 4) reasons.push(`${cellId} completion telemetry records ${report.telemetry.completion.games} games; expected ${report.completedPairs * 4}.`);
  if (report.seedConvention !== 'base-seed-plus-pair-index') reasons.push(`${cellId} seed convention is ${String(report.seedConvention)}; expected base-seed-plus-pair-index.`);
  if (cell && (report.seedRange.first !== cell.seedRange.first || report.seedRange.last !== cell.seedRange.last)) reasons.push(`${cellId} seed range ${report.seedRange.first}-${report.seedRange.last} does not match ${cell.seedRange.first}-${cell.seedRange.last}.`);
  if (report.matchup.primary !== 'heuristic' || report.matchup.comparison !== 'heuristic') reasons.push(`${cellId} matchup policies do not match heuristic/heuristic.`);
  if (cell && !sameFormationPlan(report.matchup.formationPlan, cell)) reasons.push(`${cellId} formation plan does not match the cell plans.`);
  const winEffectsValid = validateEffects(reasons, cellId, 'win-share', report.skillGap?.pairEffects, true);
  const scoreEffectsValid = validateEffects(reasons, cellId, 'score-delta', report.skillGap?.scoreDeltaEffects, false);
  validateInterval(reasons, cellId, 'win-share', report.skillGap?.winShareInterval, cell?.bootstrapSeed, winEffectsValid ? report.skillGap.pairEffects : undefined);
  validateInterval(reasons, cellId, 'score-delta', report.skillGap?.scoreDeltaInterval, cell?.bootstrapSeed, scoreEffectsValid ? report.skillGap.scoreDeltaEffects : undefined);
  return reasons;
}

function validateEffects(reasons: string[], cellId: string, label: string, effects: number[] | undefined, boundedWinShare: boolean): boolean {
  const length = Array.isArray(effects) ? effects.length : 0;
  if (length !== FORMATION_EXPANSION_PAIRS_PER_CELL) reasons.push(`${cellId} contains ${length} ${label} effects; expected ${FORMATION_EXPANSION_PAIRS_PER_CELL}.`);
  const finite = Array.isArray(effects) && effects.every(Number.isFinite);
  if (!finite) reasons.push(`${cellId} contains a nonfinite ${label} effect.`);
  const inRange = !boundedWinShare || (Array.isArray(effects) && effects.every(value => value >= 0 && value <= 1));
  if (!inRange) reasons.push(`${cellId} contains a win-share effect outside 0-1.`);
  return length === FORMATION_EXPANSION_PAIRS_PER_CELL && finite && inRange;
}

function validateInterval(
  reasons: string[],
  cellId: string,
  label: string,
  interval: BootstrapInterval | null | undefined,
  bootstrapSeed: number | undefined,
  effects: number[] | undefined,
): void {
  if (!interval) {
    reasons.push(`${cellId} is missing its ${label} interval.`);
    return;
  }
  if (![interval.low, interval.high, interval.mean].every(Number.isFinite) || interval.low > interval.mean || interval.mean > interval.high) reasons.push(`${cellId} ${label} interval bounds are invalid.`);
  if (bootstrapSeed !== undefined && interval.seed !== bootstrapSeed) reasons.push(`${cellId} ${label} interval bootstrap seed is ${interval.seed}; expected ${bootstrapSeed}.`);
  if (interval.samples !== FORMATION_EXPANSION_BOOTSTRAP.samples) reasons.push(`${cellId} ${label} interval bootstrap samples are ${interval.samples}; expected ${FORMATION_EXPANSION_BOOTSTRAP.samples}.`);
  if (interval.confidence !== FORMATION_EXPANSION_BOOTSTRAP.confidence) reasons.push(`${cellId} ${label} interval bootstrap confidence is ${interval.confidence}; expected ${FORMATION_EXPANSION_BOOTSTRAP.confidence}.`);
  if (effects && bootstrapSeed !== undefined) {
    const expected = pairedBootstrapInterval(effects, { seed: bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP });
    if (!sameIntervalValues(interval, expected)) reasons.push(`${cellId} ${label} interval does not match its effects.`);
  }
}

function sameIntervalValues(actual: BootstrapInterval, expected: BootstrapInterval): boolean {
  return Math.abs(actual.low - expected.low) <= 1e-12
    && Math.abs(actual.high - expected.high) <= 1e-12
    && Math.abs(actual.mean - expected.mean) <= 1e-12;
}

function sameFormationPlan(plan: MatchedAuditReport['matchup']['formationPlan'] | unknown, cell: FormationExpansionCell): boolean {
  if (!plan || typeof plan !== 'object') return false;
  const candidate = plan as Partial<Record<'home' | 'away', Partial<Record<'offense' | 'defense', unknown>>>>;
  return candidate.home?.offense === cell.primaryPlan.offense && candidate.home?.defense === cell.primaryPlan.defense
    && candidate.away?.offense === cell.comparisonPlan.offense && candidate.away?.defense === cell.comparisonPlan.defense;
}

function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return count === 1 ? singular : pluralForm;
}

function statisticalLead(interval: Readonly<BootstrapInterval>, neutral: number): FormationComparisonDirection | null {
  if (interval.low > neutral) return 'primary';
  if (interval.high < neutral) return 'comparison';
  return null;
}

function practicalLead(
  interval: Readonly<BootstrapInterval>,
  neutral: number,
  practicalDifference: number,
  direction: FormationComparisonDirection | null,
): FormationComparisonDirection | null {
  if (direction === 'primary' && interval.mean >= neutral + practicalDifference) return direction;
  if (direction === 'comparison' && interval.mean <= neutral - practicalDifference) return direction;
  return null;
}

function compactCellReport(cell: FormationExpansionCell, report: MatchedAuditReport | undefined): FormationExpansionCellReport {
  return Object.freeze({
    id: cell.id,
    opposingFormationId: cell.opposingFormationId,
    primaryPlan: cell.primaryPlan,
    comparisonPlan: cell.comparisonPlan,
    requestedPairs: report?.requestedPairs ?? cell.pairs,
    completedPairs: report?.completedPairs ?? 0,
    excludedPairs: report?.excludedPairs ?? cell.pairs,
    attemptedGames: report?.attemptedGames ?? 0,
    gamesPerPair: report?.gamesPerPair ?? 4,
    seedConvention: report?.seedConvention ?? 'base-seed-plus-pair-index',
    seedRange: Object.freeze({ ...(report?.seedRange ?? cell.seedRange) }),
    bootstrap: Object.freeze({ seed: cell.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }),
    statusCounts: Object.freeze({ ...(report?.statusCounts ?? { completed: 0, stalled: 0, crashed: 0 }) }),
    anomalyCount: report?.anomalies.length ?? 0,
    completion: Object.freeze({ ...(report?.telemetry.completion ?? { games: 0, actions: 0, averageActions: null }) }),
    primaryWins: report?.skillGap.primaryWins ?? 0,
    comparisonWins: report?.skillGap.comparisonWins ?? 0,
    ties: report?.skillGap.ties ?? 0,
    winShareInterval: cloneInterval(report?.skillGap.winShareInterval),
    scoreDeltaInterval: cloneInterval(report?.skillGap.scoreDeltaInterval),
  });
}

function cloneInterval(interval: BootstrapInterval): Readonly<BootstrapInterval>;
function cloneInterval(interval: null | undefined): null;
function cloneInterval(interval: BootstrapInterval | null | undefined): Readonly<BootstrapInterval> | null;
function cloneInterval(interval: BootstrapInterval | null | undefined): Readonly<BootstrapInterval> | null {
  return interval ? Object.freeze({ ...interval }) : null;
}

function summary(
  groupId: string,
  classification: FormationComparisonClassification,
  direction: FormationComparisonDirection | null,
  decisiveMetric: FormationComparisonMetric | null,
  supportingCells: number,
  credibleCounters: readonly string[],
  reasons: readonly string[],
  pooled: FormationComparisonSummary['pooled'],
  cells: readonly FormationExpansionCellReport[],
): FormationComparisonSummary {
  return Object.freeze({ groupId, classification, direction, decisiveMetric, supportingCells, credibleCounters: Object.freeze([...credibleCounters]), reasons: Object.freeze([...reasons]), pooled, cells: Object.freeze(cells) });
}

export function canonicalFormationExpansionArtifact(
  groups: readonly FormationExpansionExperiment[],
  summaries: readonly FormationComparisonSummary[],
) {
  return deepFreeze({
    schema: 'chessball-formation-expansion-audit-v2' as const,
    runner: 'scripts/run-formation-expansion-audit.ts',
    command: 'npm run audit:expansion',
    policy: { primary: 'heuristic' as const, comparison: 'heuristic' as const },
    maxActions: FORMATION_EXPANSION_MAX_ACTIONS,
    pairsPerCell: FORMATION_EXPANSION_PAIRS_PER_CELL,
    totalRequestedPairs: groups.reduce((sum, group) => sum + group.requestedPairs, 0),
    bootstrap: FORMATION_EXPANSION_BOOTSTRAP,
    thresholds: FORMATION_EXPANSION_THRESHOLDS,
    groups: groups.map((group, index) => ({
      id: group.id,
      name: group.name,
      side: group.side,
      primaryId: group.primaryId,
      comparisonId: group.comparisonId,
      bootstrapSeed: group.bootstrapSeed,
      requestedPairs: group.requestedPairs,
      cells: group.cells,
      reports: summaries[index]?.cells ?? [],
      summary: summaries[index] ? omitCells(summaries[index]) : null,
    })),
  });
}

function omitCells(value: FormationComparisonSummary): Omit<FormationComparisonSummary, 'cells'> {
  const { cells: _cells, ...summaryWithoutCells } = value;
  return summaryWithoutCells;
}

export type FormationExpansionArtifact = ReturnType<typeof canonicalFormationExpansionArtifact>;

export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T
  : T extends readonly (infer Item)[] ? readonly DeepReadonly<Item>[]
    : T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> }
      : T;

function deepFreeze<T>(value: T): DeepReadonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(nested => deepFreeze(nested));
    Object.freeze(value);
  }
  return value as DeepReadonly<T>;
}

export function serializeFormationExpansionArtifact(artifact: FormationExpansionArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function formationExpansionAuditOutput(
  args: readonly string[],
  runAudit: (options: RunMatchedAuditOptions) => MatchedAuditReport,
): string {
  if (args.length) throw new Error('Usage: npm run audit:expansion');
  const groups = formationExpansionExperiments();
  const summaries = groups.map(group => summarizeFormationComparison(group, group.cells.map(cell => runAudit({
    pairs: cell.pairs,
    seed: cell.seed,
    primary: 'heuristic',
    comparison: 'heuristic',
    maxActions: FORMATION_EXPANSION_MAX_ACTIONS,
    formationPlan: { home: cell.primaryPlan, away: cell.comparisonPlan },
    bootstrap: { seed: cell.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP },
  }))));
  return serializeFormationExpansionArtifact(canonicalFormationExpansionArtifact(groups, summaries));
}
