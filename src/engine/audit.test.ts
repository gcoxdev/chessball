import { describe, expect, it } from 'vitest';
import {
  classifyPairedEffect,
  classifySkillGap,
  classifySymmetry,
  nearestRankQuantile,
  pairedBootstrapInterval,
  runMatchedAudit,
} from './audit';
import type { SimulateGameOptions, SimulatedGame, SimulationStatus } from './simulator';

function game(options: SimulateGameOptions, score: [number, number], status: SimulationStatus = 'completed'): SimulatedGame {
  const counts = (entries: Record<string, number> = {}) => ({ total: Object.values(entries).reduce((a, b) => a + b, 0), ...entries });
  return {
    status,
    anomalies: status === 'completed' ? [] : [{ type: 'maxActions', message: status, actionIndex: 3, phase: 'live', recentActions: [] }],
    finalState: { score: { home: score[0], away: score[1] } } as SimulatedGame['finalState'],
    summary: {
      seed: options.seed, policy: options.policy ?? 'heuristic', policies: options.policies!, status,
      actions: 3, finalPhase: status === 'completed' ? 'final' : 'live', finalScore: { home: score[0], away: score[1] }, quarter: 4,
      resultTypes: counts(), actionTypes: counts({ 'policy=heuristic|action=move': 2 }),
      actionOpportunities: counts({ 'policy=heuristic|action=move': 4 }),
      formationChoices: counts({ 'team=home|side=offense|formation=x': 1 }), driveOutcomes: counts({ touchdown: 1 }),
      openingWinner: options.opening?.coinWinner ?? null, openingKicker: null,
      openingReceiver: options.opening?.choice === 'receive' ? options.opening.coinWinner : null,
      attackDirections: { home: 'right', away: 'left' }, formationPlan: options.formationPlan ?? null,
      formationSelections: { home: { offense: ['x'], defense: [] }, away: { offense: [], defense: [] } },
    },
  };
}

describe('pairedBootstrapInterval', () => {
  it('is deterministic and includes zero for balanced pair effects', () => {
    const a = pairedBootstrapInterval([-1, 1, -1, 1], { seed: 7, samples: 2_000 });
    expect(a).toEqual(pairedBootstrapInterval([-1, 1, -1, 1], { seed: 7, samples: 2_000 }));
    expect(a.confidence).toBe(.95);
    expect(a.low).toBeLessThanOrEqual(0);
    expect(a.high).toBeGreaterThanOrEqual(0);
  });

  it.each([[[1, 2, 3]], [[-1, -2, -3]]])('excludes zero for one-sided effects %#', (effects) => {
    const interval = pairedBootstrapInterval(effects, { seed: 8, samples: 1_000 });
    expect(interval.low * interval.high).toBeGreaterThan(0);
  });

  it('rejects invalid input', () => {
    expect(() => pairedBootstrapInterval([], { seed: 1 })).toThrow();
    expect(() => pairedBootstrapInterval([Number.NaN], { seed: 1 })).toThrow();
    expect(() => pairedBootstrapInterval([1], { seed: 1, samples: 0 })).toThrow();
    expect(() => pairedBootstrapInterval([1], { seed: 1, confidence: 1 })).toThrow();
  });

  it('resamples whole pair effects', () => {
    const interval = pairedBootstrapInterval([0, 10], { seed: 3, samples: 100 });
    expect([0, 5, 10]).toContain(interval.low);
    expect([0, 5, 10]).toContain(interval.high);
  });

  it('uses the clamped nearest-rank inverse ECDF convention', () => {
    expect(nearestRankQuantile([1, 2, 3, 4], 0)).toBe(1);
    expect(nearestRankQuantile([1, 2, 3, 4], .25)).toBe(1);
    expect(nearestRankQuantile([1, 2, 3, 4], .251)).toBe(2);
    expect(nearestRankQuantile([1, 2, 3, 4], 1)).toBe(4);
  });
});

describe('classifications', () => {
  it('classifies crossing effects as inconclusive', () => {
    expect(classifyPairedEffect({ low: -0.1, high: 0.2, mean: 0.05, seed: 1, samples: 10, confidence: .95 })).toBe('inconclusive');
  });

  it('applies symmetry action thresholds', () => {
    expect(classifySymmetry(
      { low: .51, high: .60, mean: .56, seed: 1, samples: 10, confidence: .95 },
      { low: -1, high: 2, mean: .2, seed: 1, samples: 10, confidence: .95 },
    )).toBe('actionable');
    expect(classifySymmetry(
      { low: .51, high: .53, mean: .52, seed: 1, samples: 10, confidence: .95 },
      { low: -1, high: 2, mean: .2, seed: 1, samples: 10, confidence: .95 },
    )).toBe('inconclusive');
  });

  it('supports a nominated skill gap only above chance', () => {
    const result = classifySkillGap({ low: .51, high: .8, mean: .65, seed: 1, samples: 10, confidence: .95 });
    expect(result.state).toBe('supported');
    expect(result.effect).toBeCloseTo(.15);
    expect(classifySkillGap({ low: .4, high: .8, mean: .6, seed: 1, samples: 10, confidence: .95 }).state).toBe('inconclusive');
  });
});

describe('runMatchedAudit', () => {
  it('uses exact mirrored calls and swaps formation plans', () => {
    const calls: SimulateGameOptions[] = [];
    const simulator = (o: SimulateGameOptions) => { calls.push(o); return game(o, [7, 3]); };
    const plan = { home: { offense: 'p-o', defense: 'p-d' }, away: { offense: 'c-o', defense: 'c-d' } };
    runMatchedAudit({ pairs: 1, seed: 10, primary: 'heuristic', comparison: 'random', formationPlan: plan, simulator, bootstrap: { seed: 5, samples: 100 } });
    expect(calls).toEqual([
      expect.objectContaining({ seed: 10, policies: { home: 'heuristic', away: 'random' }, opening: { coinWinner: 'home', choice: 'receive' }, formationPlan: plan }),
      expect.objectContaining({ seed: 10, policies: { home: 'random', away: 'heuristic' }, opening: { coinWinner: 'away', choice: 'receive' }, formationPlan: { home: plan.away, away: plan.home } }),
    ]);
  });

  it('excludes both mirrors from every estimate if either is incomplete', () => {
    let call = 0;
    const report = runMatchedAudit({ pairs: 1, seed: 4, primary: 'heuristic', comparison: 'random', bootstrap: { seed: 2, samples: 100 }, simulator: o => game(o, [1, 0], call++ ? 'stalled' : 'completed') });
    expect(report).toEqual(expect.objectContaining({ requestedPairs: 1, completedPairs: 0, excludedPairs: 1, attemptedGames: 2, statusCounts: { completed: 1, stalled: 1, crashed: 0 } }));
    expect(report.symmetry.pairEffects).toEqual([]);
    expect(report.skillGap.pairEffects).toEqual([]);
    expect(report.telemetry.actionTypes.total).toBe(0);
    expect(report.excludedPairDetails[0].mirrors.map(m => m.status)).toEqual(['completed', 'stalled']);
    expect(report.matchup).toEqual({ primary: 'heuristic', comparison: 'random', formationPlan: null });
  });

  it('orients outcomes to primary, scores ties as halves, and aggregates completed pairs', () => {
    const scores: [number, number][] = [[7, 3], [3, 3]];
    const report = runMatchedAudit({ pairs: 1, seed: 10, primary: 'heuristic', comparison: 'random', bootstrap: { seed: 9, samples: 100 }, simulator: o => game(o, scores.shift()!) });
    expect(report.skillGap.primaryWins).toBe(1);
    expect(report.skillGap.ties).toBe(1);
    expect(report.skillGap.pairEffects).toEqual([.75]);
    expect(report.skillGap.scoreDeltaEffects).toEqual([2]);
    expect(report.symmetry.pairEffects).toEqual([.75]);
    expect(report.telemetry.actionTypes.total).toBe(4);
    expect(report.telemetry.selectionRates['policy=heuristic|action=move']).toBe(.5);
    expect(report.seedList).toEqual([10]);
  });

  it('returns identical reports for identical inputs', () => {
    const options = { pairs: 1, seed: 2, primary: 'heuristic' as const, comparison: 'random' as const, bootstrap: { seed: 4, samples: 100 }, simulator: (o: SimulateGameOptions) => game(o, [2, 1]) };
    expect(runMatchedAudit(options)).toEqual(runMatchedAudit(options));
  });

  it.each([
    { seed: Number.NaN },
    { seed: Number.POSITIVE_INFINITY },
    { seed: 1.5 },
    { seed: 1, bootstrap: { seed: Number.NaN } },
    { seed: 1, bootstrap: { seed: 2, samples: 0 } },
    { seed: 1, bootstrap: { seed: 2, confidence: 1 } },
  ])('rejects invalid seed/bootstrap options before simulation %#', invalid => {
    let calls = 0;
    expect(() => runMatchedAudit({ pairs: 1, primary: 'heuristic', comparison: 'random', simulator: o => { calls++; return game(o, [0, 0], 'stalled'); }, ...invalid })).toThrow();
    expect(calls).toBe(0);
  });

  it('counts a repeated formation only once per game in outcome strata', () => {
    const report = runMatchedAudit({
      pairs: 1, seed: 3, primary: 'heuristic', comparison: 'random', bootstrap: { seed: 4, samples: 100 },
      simulator: o => {
        const result = game(o, [2, 1]);
        result.summary.formationSelections.home.offense = ['x', 'x', 'x'];
        return result;
      },
    });
    expect(report.telemetry.formationStratifiedOutcomes['heuristic:home|formation=x']).toEqual({ games: 1, wins: 1, losses: 0, ties: 0 });
    expect(report.telemetry.formationChoices.total).toBe(2);
  });

  it('builds exploratory selected-vs-not-selected cohorts once per completed game', () => {
    const context = 'team=home|policy=heuristic|phase=live|down=1|field=midfield|action=pass';
    let call = 0;
    const report = runMatchedAudit({
      pairs: 2, seed: 20, primary: 'heuristic', comparison: 'random', bootstrap: { seed: 4, samples: 100 },
      simulator: o => {
        const hasContext = call % 2 === 0;
        const selectedGame = call === 0;
        const result = game(o, selectedGame ? [10, 3] : [2, 5]);
        result.summary.actionOpportunities = hasContext ? { total: 5, [context]: 5 } : { total: 0 };
        result.summary.actionTypes = selectedGame ? { total: 3, [context]: 3 } : { total: 0 };
        call++;
        return result;
      },
    });
    expect(report.telemetry.tacticCohorts[context]).toEqual({
      exploratory: true, policy: 'heuristic', team: 'home', selections: 3, opportunities: 10,
      selected: { games: 1, wins: 1, ties: 0, losses: 0, averageScoreDifferential: 7 },
      notSelected: { games: 1, wins: 0, ties: 0, losses: 1, averageScoreDifferential: -3 },
      winRateDifference: 1,
    });
  });

  it('does not leak excluded games into tactic cohorts', () => {
    const context = 'team=away|policy=random|phase=live|down=2|field=own|action=move';
    let call = 0;
    const report = runMatchedAudit({ pairs: 1, seed: 8, primary: 'heuristic', comparison: 'random', simulator: o => {
      const result = game(o, [1, 0], call++ ? 'stalled' : 'completed');
      result.summary.actionOpportunities = { total: 2, [context]: 2 };
      result.summary.actionTypes = { total: 1, [context]: 1 };
      return result;
    }});
    expect(report.telemetry.tacticCohorts).toEqual({});
  });

  it.each([
    { seed: -1 }, { seed: 0x1_0000_0000 },
    { seed: 0xffff_ffff, pairs: 2 },
    { seed: 1, bootstrap: { seed: -1 } },
    { seed: 1, bootstrap: { seed: 0x1_0000_0000 } },
  ])('rejects seeds outside uint32 or overflowing the pair range %#', invalid => {
    expect(() => runMatchedAudit({ pairs: 1, primary: 'heuristic', comparison: 'random', ...invalid })).toThrow();
  });

  it('accepts the maximum uint32 seed for one pair', () => {
    expect(runMatchedAudit({ pairs: 1, seed: 0xffff_ffff, primary: 'heuristic', comparison: 'random', simulator: o => game(o, [0, 0]) }).seedList).toEqual([0xffff_ffff]);
  });
});
