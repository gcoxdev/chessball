import type { PieceStyle } from './PieceToken';

export const SETTINGS_STORAGE_KEY = 'chessball.settings.v1';
export type MatchLength = 'standard' | 'short';

function storedSettings(): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Storage can be unavailable or contain an old/corrupt preference.
  }
  return {};
}

export function loadPieceStyle(): PieceStyle {
  const style = storedSettings().pieceStyle;
  return style === 'player' || style === 'helmet' ? style : 'circle';
}

export function loadMatchLength(): MatchLength {
  return storedSettings().matchLength === 'short' ? 'short' : 'standard';
}

function saveSettings(update: Record<string, unknown>): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ ...storedSettings(), ...update }));
  } catch {
    // Preferences still work for this session when storage is unavailable.
  }
}

export function savePieceStyle(pieceStyle: PieceStyle): void {
  saveSettings({ pieceStyle });
}

export function saveMatchLength(matchLength: MatchLength): void {
  saveSettings({ matchLength });
}
