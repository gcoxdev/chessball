import type { PieceStyle } from './PieceToken';

export const SETTINGS_STORAGE_KEY = 'chessball.settings.v1';

export function loadPieceStyle(): PieceStyle {
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(SETTINGS_STORAGE_KEY) ?? 'null');
    if (value && typeof value === 'object' && 'pieceStyle' in value) {
      const style = value.pieceStyle;
      if (style === 'circle' || style === 'player' || style === 'helmet') return style;
    }
  } catch {
    // Storage can be unavailable or contain an old/corrupt preference.
  }
  return 'circle';
}

export function savePieceStyle(pieceStyle: PieceStyle): void {
  try {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ pieceStyle }));
  } catch {
    // The selected style still works for this session when storage is unavailable.
  }
}
