import { applyAction, defensiveFormations, fieldGoalAttempt, offensiveFormations } from './rules';
import type { Action, Coord, GameState, Piece, Team } from './types';

export type PlayerKind = 'human' | 'computer';
export type PlayerControl = Record<Team, PlayerKind>;

export function chooseComputerAction(game: GameState, legalActions: Action[], seed: number, players: PlayerControl): Action | null {
  if (game.phase === 'betweenDowns' && game.play.result?.type === 'touchdown') {
    return { type: 'kick', kickerId: `${game.play.result.team}-qb`, kind: 'extraPoint' };
  }
  if (game.phase === 'coinToss') {
    if (!game.coinToss.winner) return { type: 'coinToss' };
    return { type: 'chooseKickoffChoice', team: game.coinToss.winner, choice: 'receive' };
  }
  if (game.phase === 'kickoff') return { type: 'kick', kickerId: `${game.turn}-qb`, kind: 'kickoff' };
  if (game.phase === 'kickPlacement') return chooseComputerKickPlacement(game, legalActions, seed);
  if (game.phase === 'formation') return chooseComputerFormationAction(game, seed, players);
  if (game.phase !== 'live' && game.phase !== 'kickReturn') return null;

  const ball = game.ball;
  const carrier = ball.kind === 'controlled' ? game.pieces.find((piece) => piece.id === ball.pieceId) : undefined;
  if (carrier && carrier.team !== game.turn) {
    const tackles = legalActions.filter((action): action is Extract<Action, { type: 'tackle' }> => action.type === 'tackle');
    const tackle = pickSeeded(tackles, seed);
    if (tackle) return tackle;
  }

  const recovery = pickSeeded(legalActions.filter((action) => action.type === 'recover'), seed);
  if (recovery) return recovery;

  if (ball.kind === 'loose') {
    const pickupMove = pickSeeded(legalActions.filter((action): action is Extract<Action, { type: 'move' }> =>
      action.type === 'move' && sameCoord(action.to, ball.coord),
    ), seed);
    if (pickupMove) return pickupMove;
  }

  if (carrier?.team === game.turn) {
    if (game.phase === 'kickReturn') {
      const carrierMoves = legalActions.filter((action): action is Extract<Action, { type: 'move' }> =>
        action.type === 'move' && action.pieceId === carrier.id,
      );
      return pickFromTopSeeded(carrierMoves.sort((a, b) => compareOffensiveMoves(game, a.to, b.to)), seed, 3) ?? null;
    }

    if (!game.conversion && game.down === 4 && fieldGoalAttempt(game.direction, carrier.coord).required <= 10) {
      return { type: 'kick', kickerId: carrier.id, kind: 'fieldGoal' };
    }

    const carrierMoves = legalActions.filter((action): action is Extract<Action, { type: 'move' }> =>
      action.type === 'move' && action.pieceId === carrier.id,
    );
    const forwardCarrierMove = carrierMoves.some((action) => madeForwardProgress(game, carrier.coord, action.to));
    if (carrier.role === 'qb' && !forwardCarrierMove) {
      const routeMove = chooseRouteDevelopmentMove(game, legalActions, seed);
      if (routeMove) return routeMove;

      const receiverPass = chooseComputerPass(game, carrier, seed);
      if (receiverPass) return receiverPass;
    }

    const handoffs = legalActions
      .filter((action): action is Extract<Action, { type: 'handoff' }> => action.type === 'handoff')
      .sort((a, b) => handoffPriority(b.toId) - handoffPriority(a.toId));
    const handoff = pickFromTopSeeded(handoffs, seed, 2);
    if (carrier.role === 'qb' && handoff && !forwardCarrierMove) return handoff;

    const bestCarrierMove = pickFromTopSeeded(carrierMoves.sort((a, b) => compareOffensiveMoves(game, a.to, b.to)), seed, 3);
    if (bestCarrierMove) return bestCarrierMove;

    const powerMoves = legalActions.filter((action): action is Extract<Action, { type: 'powerMove' }> =>
      action.type === 'powerMove' && action.pieceId === carrier.id,
    );
    const bestPowerMove = pickFromTopSeeded(powerMoves.sort((a, b) => compareOffensiveMoves(game, a.to, b.to)), seed, 2);
    if (bestPowerMove) return bestPowerMove;
  }

  const ballAt = ballCoord(game);
  const recentMoverIds = recentMovingPieceIds(game);
  const moves = legalActions.filter((action): action is Extract<Action, { type: 'move' | 'powerMove' }> => action.type === 'move' || action.type === 'powerMove');
  const nonRepeatingMoves = moves.filter((action) => !recentMoverIds.has(action.pieceId));
  const candidateMoves = nonRepeatingMoves.length > 0 ? nonRepeatingMoves : moves;
  const bestMove = pickFromTopSeeded(candidateMoves.sort((a, b) => chebyshevDistance(a.to, ballAt) - chebyshevDistance(b.to, ballAt)), seed, 4);
  if (bestMove) return bestMove;

  return legalActions[0] ?? null;
}

function chooseComputerKickPlacement(game: GameState, legalActions: Action[], seed: number): Extract<Action, { type: 'placeKick' }> | null {
  const placements = legalActions.filter((action): action is Extract<Action, { type: 'placeKick' }> => action.type === 'placeKick');
  const direction = game.pendingKick ? directionFor(game.pendingKick.kickingTeam) : directionFor(game.turn);
  return pickFromTopSeeded(placements.sort((a, b) => {
    const depthA = direction === 1 ? a.at.x : -a.at.x;
    const depthB = direction === 1 ? b.at.x : -b.at.x;
    if (depthA !== depthB) return depthB - depthA;
    return Math.abs(a.at.y - 1 - (seed % 9)) - Math.abs(b.at.y - 1 - (seed % 9));
  }), seed, 6) ?? null;
}

function chooseComputerFormationAction(game: GameState, seed: number, players: PlayerControl): Action | null {
  const offenseChosen = game.play.actions.some((action) => action.type === 'chooseFormation' && action.side === 'offense');
  if (!game.formationConfirmed.offense && !offenseChosen) {
    if (players[game.possession] !== 'computer') return null;
    const formation = offensiveFormations[(seed + game.down) % offensiveFormations.length];
    return { type: 'chooseFormation', side: 'offense', formationId: formation.id };
  }

  if (!game.formationConfirmed.offense) {
    if (players[game.possession] !== 'computer') return null;
    return { type: 'confirmFormation', side: 'offense' };
  }

  const defenseChosen = game.play.actions.some((action) => action.type === 'chooseFormation' && action.side === 'defense');
  if (!game.formationConfirmed.defense && !defenseChosen) {
    const defenseTeam = otherTeam(game.possession);
    if (players[defenseTeam] !== 'computer') return null;
    const formation = defensiveFormations[(seed + game.down + 1) % defensiveFormations.length];
    return { type: 'chooseFormation', side: 'defense', formationId: formation.id };
  }

  if (!game.formationConfirmed.defense) {
    const defenseTeam = otherTeam(game.possession);
    if (players[defenseTeam] !== 'computer') return null;
    return { type: 'confirmFormation', side: 'defense' };
  }

  if (players[game.possession] !== 'computer') return null;
  return { type: 'snap' };
}

function compareOffensiveMoves(game: GameState, a: Coord, b: Coord): number {
  const progressA = game.direction === 1 ? a.x : -a.x;
  const progressB = game.direction === 1 ? b.x : -b.x;
  if (progressA !== progressB) return progressB - progressA;
  return Math.abs(a.y - 5) - Math.abs(b.y - 5);
}

function chooseComputerPass(game: GameState, passer: Piece, seed: number): Extract<Action, { type: 'pass' }> | null {
  const receivers = game.pieces
    .filter((piece) => piece.team === passer.team && piece.id !== passer.id)
    .filter((piece) => piece.role !== 'ol')
    .sort((a, b) => receiverPriority(b) - receiverPriority(a));

  for (const receiver of rotate(receivers, seed)) {
    const action = { type: 'pass' as const, passerId: passer.id, receiverId: receiver.id };
    try {
      applyAction(game, action);
      return action;
    } catch {
      continue;
    }
  }

  return null;
}

function chooseRouteDevelopmentMove(game: GameState, legalActions: Action[], seed: number): Extract<Action, { type: 'move' }> | null {
  const routeAlreadyDeveloped = game.play.actions.some((action) => {
    if (action.type !== 'move') return false;
    const piece = game.pieces.find((item) => item.id === action.pieceId);
    return piece?.team === game.possession && (piece.role === 'wr' || piece.role === 'te');
  });
  if (routeAlreadyDeveloped) return null;

  const routeMoves = legalActions
    .filter((action): action is Extract<Action, { type: 'move' }> => action.type === 'move')
    .filter((action) => {
      const piece = game.pieces.find((item) => item.id === action.pieceId);
      return Boolean(piece && piece.team === game.possession && (piece.role === 'wr' || piece.role === 'te') && madeForwardProgress(game, piece.coord, action.to));
    })
    .sort((a, b) => compareRouteMoves(game, a, b));

  return pickFromTopSeeded(routeMoves, seed, 3) ?? null;
}

function compareRouteMoves(game: GameState, a: Extract<Action, { type: 'move' }>, b: Extract<Action, { type: 'move' }>): number {
  const safetyA = nearestDefenderDistance(game, a.to);
  const safetyB = nearestDefenderDistance(game, b.to);
  const safeA = safetyA > 1 ? 1 : 0;
  const safeB = safetyB > 1 ? 1 : 0;
  if (safeA !== safeB) return safeB - safeA;
  if (safetyA !== safetyB) return safetyB - safetyA;

  const progressA = game.direction === 1 ? a.to.x : -a.to.x;
  const progressB = game.direction === 1 ? b.to.x : -b.to.x;
  if (progressA !== progressB) return progressB - progressA;
  return Math.abs(a.to.y - 5) - Math.abs(b.to.y - 5);
}

function nearestDefenderDistance(game: GameState, coord: Coord): number {
  const defenders = game.pieces.filter((piece) => piece.team !== game.possession);
  return Math.min(...defenders.map((piece) => chebyshevDistance(piece.coord, coord)));
}

function pickSeeded<T>(items: T[], seed: number): T | undefined {
  if (items.length === 0) return undefined;
  return items[Math.abs(seed) % items.length];
}

function pickFromTopSeeded<T>(items: T[], seed: number, limit: number): T | undefined {
  return pickSeeded(items.slice(0, Math.max(1, limit)), seed);
}

function rotate<T>(items: T[], seed: number): T[] {
  if (items.length === 0) return items;
  const offset = Math.abs(seed) % items.length;
  return [...items.slice(offset), ...items.slice(0, offset)];
}

function receiverPriority(piece: Piece): number {
  if (piece.role === 'wr') return 3;
  if (piece.role === 'te') return 2;
  return 1;
}

function madeForwardProgress(game: GameState, from: Coord, to: Coord): boolean {
  return game.direction === 1 ? to.x > from.x : to.x < from.x;
}

function handoffPriority(pieceId: string): number {
  if (pieceId.includes('-rb')) return 3;
  if (pieceId.includes('-fb')) return 2;
  return 1;
}

function recentMovingPieceIds(game: GameState): Set<string> {
  return new Set(game.play.actions
    .slice(-2)
    .filter((action): action is Extract<Action, { type: 'move' | 'powerMove' }> => action.type === 'move' || action.type === 'powerMove')
    .map((action) => action.pieceId));
}

function ballCoord(game: GameState): Coord {
  const ball = game.ball;
  if (ball.kind === 'loose') return ball.coord;
  return game.pieces.find((piece) => piece.id === ball.pieceId)?.coord ?? { x: game.lineOfScrimmage, y: 8 };
}

function sameCoord(a: Coord, b: Coord) {
  return a.x === b.x && a.y === b.y;
}

function otherTeam(team: Team): Team {
  return team === 'home' ? 'away' : 'home';
}

function chebyshevDistance(a: Coord, b: Coord): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function directionFor(team: Team): 1 | -1 {
  return team === 'home' ? 1 : -1;
}

