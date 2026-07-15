import { pairedBootstrapInterval, type BootstrapInterval, type MatchedAuditReport } from './audit';
import { defensiveFormations, offensiveFormations } from './rules';
import type { SimulationFormationPlan } from './simulator';

export type FormationComparisonSide = 'offense' | 'defense';
export type FormationComparisonDirection = 'primary' | 'comparison';
export type FormationComparisonMetric = 'win-share' | 'score-delta';
export type FormationComparisonClassification =
  | 'incomplete'
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
  seedConvention: MatchedAuditReport['seedConvention'];
  seedRange: MatchedAuditReport['seedRange'];
  bootstrap: Readonly<{ seed: number; samples: number; confidence: number }>;
  statusCounts: MatchedAuditReport['statusCounts'];
  anomalyCount: number;
  completion: MatchedAuditReport['telemetry']['completion'];
  primaryWins: number;
  comparisonWins: number;
  ties: number;
  winShareInterval: BootstrapInterval | null;
  scoreDeltaInterval: BootstrapInterval | null;
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
    winShareInterval: BootstrapInterval | null;
    scoreDeltaInterval: BootstrapInterval | null;
  }>;
  cells: readonly FormationExpansionCellReport[];
}>;

export function summarizeFormationComparison(
  group: FormationExpansionExperiment,
  cellReports: readonly MatchedAuditReport[],
): FormationComparisonSummary {
  const cells = group.cells.map((cell, index) => compactCellReport(cell, cellReports[index]));
  const reportsComplete = cellReports.length === group.cells.length && cellReports.every(report =>
    report.requestedPairs === FORMATION_EXPANSION_PAIRS_PER_CELL
    && report.completedPairs === FORMATION_EXPANSION_PAIRS_PER_CELL
    && report.excludedPairs === 0
    && report.statusCounts.stalled === 0
    && report.statusCounts.crashed === 0
    && report.anomalies.length === 0
    && report.skillGap.pairEffects.length === FORMATION_EXPANSION_PAIRS_PER_CELL
    && report.skillGap.scoreDeltaEffects.length === FORMATION_EXPANSION_PAIRS_PER_CELL);
  const winEffects = reportsComplete ? cellReports.flatMap(report => report.skillGap.pairEffects) : [];
  const scoreEffects = reportsComplete ? cellReports.flatMap(report => report.skillGap.scoreDeltaEffects) : [];
  const pooledComplete = reportsComplete && winEffects.length === group.requestedPairs && scoreEffects.length === group.requestedPairs;
  const pooled = Object.freeze({
    requestedPairs: group.requestedPairs,
    completedPairs: cellReports.reduce((sum, report) => sum + report.completedPairs, 0),
    winShareInterval: pooledComplete ? pairedBootstrapInterval(winEffects, { seed: group.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }) : null,
    scoreDeltaInterval: pooledComplete ? pairedBootstrapInterval(scoreEffects, { seed: group.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }) : null,
  });

  if (!pooledComplete) return summary(group.id, 'incomplete', null, null, 0, [], [
    `Every cell must complete ${FORMATION_EXPANSION_PAIRS_PER_CELL} clean pairs and pooled effects must total ${group.requestedPairs}.`,
  ], pooled, cells);

  const winLead = actionableLead(pooled.winShareInterval!, .5, FORMATION_EXPANSION_THRESHOLDS.winSharePracticalDifference);
  const scoreLead = actionableLead(pooled.scoreDeltaInterval!, 0, FORMATION_EXPANSION_THRESHOLDS.scoreDeltaPracticalDifference);
  if (winLead && scoreLead && winLead !== scoreLead) return summary(group.id, 'conflicting-metrics', null, null, 0, [], [
    'Win-share and score-delta leads are actionable in opposite directions.',
  ], pooled, cells);

  const decisiveMetric: FormationComparisonMetric | null = winLead ? 'win-share' : scoreLead ? 'score-delta' : null;
  const direction = winLead ?? scoreLead;
  if (!decisiveMetric || !direction) return summary(group.id, 'sub-threshold', null, null, 0, [], [
    'No pooled interval meets both the statistical and practical threshold.',
  ], pooled, cells);

  const neutral = decisiveMetric === 'win-share' ? .5 : 0;
  const intervals = cellReports.map(report => decisiveMetric === 'win-share' ? report.skillGap.winShareInterval! : report.skillGap.scoreDeltaInterval!);
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

function actionableLead(interval: BootstrapInterval, neutral: number, practicalDifference: number): FormationComparisonDirection | null {
  if (interval.low > neutral && interval.mean >= neutral + practicalDifference) return 'primary';
  if (interval.high < neutral && interval.mean <= neutral - practicalDifference) return 'comparison';
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
    seedConvention: report?.seedConvention ?? 'base-seed-plus-pair-index',
    seedRange: report?.seedRange ?? cell.seedRange,
    bootstrap: Object.freeze({ seed: cell.bootstrapSeed, ...FORMATION_EXPANSION_BOOTSTRAP }),
    statusCounts: report?.statusCounts ?? { completed: 0, stalled: 0, crashed: 0 },
    anomalyCount: report?.anomalies.length ?? 0,
    completion: report?.telemetry.completion ?? { games: 0, actions: 0, averageActions: null },
    primaryWins: report?.skillGap.primaryWins ?? 0,
    comparisonWins: report?.skillGap.comparisonWins ?? 0,
    ties: report?.skillGap.ties ?? 0,
    winShareInterval: report?.skillGap.winShareInterval ?? null,
    scoreDeltaInterval: report?.skillGap.scoreDeltaInterval ?? null,
  });
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
  return {
    schema: 'chessball-formation-expansion-audit-v1' as const,
    runner: 'scripts/run-formation-expansion-audit.ts',
    command: 'npm exec vite-node scripts/run-formation-expansion-audit.ts',
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
  };
}

function omitCells(value: FormationComparisonSummary): Omit<FormationComparisonSummary, 'cells'> {
  const { cells: _cells, ...summaryWithoutCells } = value;
  return summaryWithoutCells;
}

export type FormationExpansionArtifact = ReturnType<typeof canonicalFormationExpansionArtifact>;

export function serializeFormationExpansionArtifact(artifact: FormationExpansionArtifact): string {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}
