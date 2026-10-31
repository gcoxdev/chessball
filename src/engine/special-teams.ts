import type { Formation, FormationSelection } from './types';

const protection: Formation['positions'] = {
  ol1: { x: 0, y: 3 }, ol2: { x: 0, y: 4 }, ol3: { x: 0, y: 5 },
  ol4: { x: 0, y: 6 }, ol5: { x: 0, y: 7 },
  rb: { x: -1, y: 2 }, te: { x: 0, y: 8 }, fb: { x: -1, y: 5 },
};

export const specialTeamsFormations: Record<'fieldGoal' | 'punt', FormationSelection> = {
  fieldGoal: {
    offense: {
      id: 'field-goal-unit', name: 'Field goal unit', side: 'offense',
      description: 'Long snapper, holder, kicker and protection. Confirm, then choose to kick or fake into a pass.',
      positions: { qb: { x: -2, y: 5 }, ...protection, wr1: { x: 0, y: 1 }, wr2: { x: 0, y: 9 } },
    },
    defense: {
      id: 'field-goal-defense', name: 'Field goal defense', side: 'defense',
      description: 'Defenders crowd the line. Field goals resolve by distance and dice; there is no block roll.',
      positions: {
        wr1: { x: 1, y: 0 }, ol1: { x: 1, y: 1 }, rb: { x: 1, y: 2 },
        ol2: { x: 1, y: 3 }, fb: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
        qb: { x: 1, y: 6 }, ol4: { x: 1, y: 7 }, te: { x: 1, y: 8 },
        ol5: { x: 1, y: 9 }, wr2: { x: 1, y: 10 },
      },
    },
  },
  punt: {
    offense: {
      id: 'punt-unit', name: 'Punt unit', side: 'offense',
      description: 'Punter behind the long snapper, with protection and wide coverage players.',
      positions: { qb: { x: -3, y: 5 }, ...protection, wr1: { x: 0, y: 0 }, wr2: { x: 0, y: 10 } },
    },
    defense: {
      id: 'punt-return-unit', name: 'Punt return unit', side: 'defense',
      description: 'Two deep returners behind their blockers. The receiving team acts first after placement.',
      positions: {
        wr1: { x: 9, y: 2 }, wr2: { x: 9, y: 8 },
        ol1: { x: 1, y: 1 }, ol2: { x: 1, y: 3 }, ol3: { x: 1, y: 5 },
        ol4: { x: 1, y: 7 }, ol5: { x: 1, y: 9 },
        qb: { x: 1, y: 4 }, rb: { x: 3, y: 7 }, fb: { x: 3, y: 3 }, te: { x: 3, y: 5 },
      },
    },
  },
};

export const specialTeamsDefensiveFormations: Record<'fieldGoal' | 'punt', Formation[]> = {
  fieldGoal: [specialTeamsFormations.fieldGoal.defense, {
    id: 'safe-field-goal-defense', name: 'Safe field goal defense', side: 'defense',
    description: 'Hold defenders back to cover a fake pass. This changes coverage, not field-goal kick odds.',
    positions: {
      ol1: { x: 1, y: 3 }, ol2: { x: 1, y: 4 }, ol3: { x: 1, y: 5 },
      ol4: { x: 1, y: 6 }, ol5: { x: 1, y: 7 },
      rb: { x: 2, y: 5 }, fb: { x: 3, y: 3 }, te: { x: 4, y: 8 },
      qb: { x: 4, y: 5 }, wr1: { x: 3, y: 1 }, wr2: { x: 3, y: 9 },
    },
  }],
  punt: [specialTeamsFormations.punt.defense],
};
