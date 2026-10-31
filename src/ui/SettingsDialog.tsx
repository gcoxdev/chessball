import { useRef, type RefObject } from 'react';
import { X } from 'lucide-react';
import { Modal } from './Modal';
import type { MatchLength } from './settings';
import { PieceToken, type PieceStyle } from './PieceToken';

const styles: { value: PieceStyle; label: string; description: string }[] = [
  { value: 'player', label: 'Football players', description: 'Side-profile players in full pads' },
  { value: 'helmet', label: 'Helmets', description: 'Contoured shells and face masks' },
  { value: 'circle', label: 'Circles', description: 'Classic board pieces' },
];

export function SettingsDialog({ pieceStyle, onPieceStyleChange, matchLength, onMatchLengthChange, fallbackFocus, onClose }: {
  pieceStyle: PieceStyle;
  matchLength: MatchLength;
  onMatchLengthChange: (length: MatchLength) => void;
  onPieceStyleChange: (style: PieceStyle) => void;
  fallbackFocus: RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  return (
    <Modal label="Settings" dismissible initialFocus={closeRef} fallbackFocus={fallbackFocus} onClose={onClose} dialogClassName="rules-help-dialog settings-dialog">
      <header className="rules-header">
        <h2>Settings</h2>
        <button ref={closeRef} className="rules-close" type="button" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
      </header>
      <div className="rules-content">
        <p>Choose how players appear on the field. Team colors and position labels stay visible.</p>
        <fieldset className="piece-style-options">
          <legend>Player appearance</legend>
          {styles.map(({ value, label, description }) => (
            <label className={`piece-style-option${pieceStyle === value ? ' is-active' : ''}`} key={value}>
              <input type="radio" name="piece-style" value={value} checked={pieceStyle === value} onChange={() => onPieceStyleChange(value)} aria-label={label} />
              <span className="piece-style-copy"><strong>{label}</strong><span>{description}</span></span>
              <span className="piece-style-preview" aria-hidden="true">
                <span><PieceToken team="home" label="QB" style={value} /></span>
                <span><PieceToken team="away" label="MLB" style={value} /></span>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="piece-style-options match-length-options">
          <legend>Match length</legend>
          <p className="hint">Applies when you start a new match. Both formats have four quarters and a halftime kickoff.</p>
          {(['standard', 'short'] as const).map(length => (
            <label className={`piece-style-option${matchLength === length ? ' is-active' : ''}`} key={length}>
              <input type="radio" name="match-length" checked={matchLength === length} onChange={() => onMatchLengthChange(length)} aria-label={length === 'standard' ? 'Standard match' : 'Short match'} />
              <span className="piece-style-copy">
                <strong>{length === 'standard' ? 'Standard' : 'Short'}</strong>
                <span>{length === 'standard' ? '2 drives per team per quarter' : '1 drive per team per quarter'}</span>
              </span>
            </label>
          ))}
        </fieldset>
      </div>
    </Modal>
  );
}
