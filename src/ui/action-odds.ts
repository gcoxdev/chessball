import { actionOdds } from '../engine/rules';
import type { Action, GameState } from '../engine/types';

export function oddsText(game: GameState, action: Action): string | undefined {
  const odds = actionOdds(game, action);
  if (!odds) return undefined;
  const percent = (chance: number) => `${Number((chance * 100).toFixed(1))}%`;
  const outcome = action.type === 'tackle' ? 'stop' : 'success';
  const target = odds.required > 12 && odds.successChance > 0 ? 'double sixes only' : `${odds.required}+ on 2d6`;
  const strip = odds.stripChance > 0 ? `; ${percent(odds.stripChance)} strip turnover` : '';
  return `${percent(odds.successChance)} ${outcome} (${target}${strip})`;
}
