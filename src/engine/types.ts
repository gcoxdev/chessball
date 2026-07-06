export type Team = 'home' | 'away';
export type Direction = 1 | -1;
export type Phase = 'pregame' | 'coinToss' | 'kickoff' | 'formation' | 'live' | 'betweenDowns' | 'final';
export type FieldZone = 'leftEndZone' | 'field' | 'rightEndZone' | 'out';

export type Coord = {
  x: number;
  y: number;
};

export type DiceRoll = {
  die1: number;
  die2: number;
};

export type CoinFace = 'heads' | 'tails';

export type RollResult = {
  roll: DiceRoll;
  total: number;
  required: number;
  distance: number;
};

export type Role = 'qb' | 'rb' | 'fb' | 'wr' | 'te' | 'ol';
export type FormationSide = 'offense' | 'defense';

export type Piece = {
  id: string;
  team: Team;
  role: Role;
  label: string;
  coord: Coord;
};

export type BallState =
  | { kind: 'controlled'; pieceId: string }
  | { kind: 'loose'; coord: Coord };

export type Board = {
  width: number;
  height: number;
};

export type Formation = {
  id: string;
  name: string;
  side: FormationSide;
  positions: Record<string, Coord>;
};

export type FormationSelection = {
  offense: Formation;
  defense: Formation;
};

export type PlayResult =
  | { type: 'touchdown'; team: Team }
  | { type: 'fieldGoal'; team: Team; good: boolean; roll?: RollResult }
  | { type: 'extraPoint'; team: Team; good: boolean; roll?: RollResult }
  | { type: 'kickoff'; team: Team; receivingTeam: Team; at: Coord; roll?: RollResult }
  | { type: 'punt'; team: Team; receivingTeam: Team; at: Coord; roll?: RollResult }
  | { type: 'safety'; team: Team }
  | { type: 'tackle'; at: Coord; roll?: RollResult }
  | { type: 'fumble'; at: Coord; recoveredBy?: Team; roll?: RollResult }
  | { type: 'recovery'; team: Team; at: Coord }
  | { type: 'incomplete'; at: Coord; roll?: RollResult }
  | { type: 'interception'; team: Team; roll?: RollResult }
  | { type: 'turnoverOnDowns'; team: Team }
  | { type: 'outOfBounds'; at: Coord };

export type ScoreState = {
  home: number;
  away: number;
};

export type CoinTossState = {
  winner?: Team;
  choice?: 'kick' | 'receive';
  result?: CoinFace;
};

export type PlayState = {
  result?: PlayResult;
  actions: Action[];
};

export type GameState = {
  board: Board;
  phase: Phase;
  pieces: Piece[];
  ball: BallState;
  possession: Team;
  direction: Direction;
  turn: Team;
  score: ScoreState;
  quarter: 1 | 2 | 3 | 4;
  drivesThisQuarter: Record<Team, number>;
  openingKickoffTeam: Team;
  coinToss: CoinTossState;
  down: 1 | 2 | 3 | 4;
  lineOfScrimmage: number;
  firstDownLine: number;
  drivesRemaining: Record<Team, number>;
  forwardPassUsed: boolean;
  formation: FormationSelection;
  formationConfirmed: Record<FormationSide, boolean>;
  formationShiftsRemaining: Record<Team, number>;
  play: PlayState;
};

export type MoveAction = {
  type: 'move';
  pieceId: string;
  to: Coord;
};

export type PowerMoveAction = {
  type: 'powerMove';
  pieceId: string;
  to: Coord;
  roll?: DiceRoll;
};

export type ShiftAction = {
  type: 'shift';
  pieceId: string;
  to: Coord;
};

export type PassAction = {
  type: 'pass';
  passerId: string;
  target: Coord;
  roll?: DiceRoll;
};

export type HandoffAction = {
  type: 'handoff';
  fromId: string;
  toId: string;
};

export type KickAction = {
  type: 'kick';
  kickerId: string;
  kind: 'kickoff' | 'fieldGoal' | 'extraPoint' | 'punt';
  roll?: DiceRoll;
};

export type TackleAction = {
  type: 'tackle';
  defenderId: string;
  targetId: string;
  strip?: boolean;
  roll?: DiceRoll;
};

export type BlockAction = {
  type: 'block';
  blockerId: string;
  targetId: string;
};

export type RecoverAction = {
  type: 'recover';
  pieceId: string;
};

export type SnapAction = {
  type: 'snap';
};

export type ChooseFormationAction = {
  type: 'chooseFormation';
  side: FormationSide;
  formationId: string;
};

export type ConfirmFormationAction = {
  type: 'confirmFormation';
  side: FormationSide;
};

export type CoinTossAction = {
  type: 'coinToss';
  result?: CoinFace;
};

export type ChooseKickoffChoiceAction = {
  type: 'chooseKickoffChoice';
  team: Team;
  choice: 'kick' | 'receive';
};

export type Action =
  | MoveAction
  | PowerMoveAction
  | ShiftAction
  | PassAction
  | HandoffAction
  | KickAction
  | TackleAction
  | BlockAction
  | RecoverAction
  | SnapAction
  | ChooseFormationAction
  | ConfirmFormationAction
  | CoinTossAction
  | ChooseKickoffChoiceAction;

export type LegalAction = Action;
