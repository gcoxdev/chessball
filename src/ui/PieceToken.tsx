import { useId } from 'react';
import type { Team } from '../engine/types';

export type PieceStyle = 'circle' | 'player' | 'helmet';

// Right-facing profile: flat neck opening, separate jaw pad, and an open eye line.
function HelmetProfile({ id }: { id: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <linearGradient id={`${id}-shell`} x1="0" y1="0" x2="0.8" y2="1" gradientUnits="objectBoundingBox">
          <stop stopColor="var(--piece-highlight)" />
          <stop offset="0.4" stopColor="var(--piece-color)" />
          <stop offset="1" stopColor="var(--piece-shadow)" />
        </linearGradient>
        <linearGradient id={`${id}-metal`} x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#eff4f5" />
          <stop offset="0.5" stopColor="#8b9ba5" />
          <stop offset="1" stopColor="#d5e0e4" />
        </linearGradient>
      </defs>
      <path d="M35 25H48L47 32L51 36L47 42H37L33 35Z" fill="#131e24" />
      <path d="M7 38V28C7 16 16 7 29 7C41 7 50 15 51 26H40L35 32V41L30 46H15C10 46 7 43 7 38Z" fill={`url(#${id}-shell)`} stroke="#cad7df" strokeWidth="1.2" />
      <path d="M12 24C16 11 35 7 45 20C34 12 20 15 12 27Z" fill="#fff" opacity="0.24" />
      <path d="M29 8C38 10 43 17 44 26H47C46 15 40 9 33 7Z" fill="#eceddf" opacity="0.85" />
      <path d="M8 39L12 43H28L33 39" fill="none" stroke="var(--piece-shadow)" strokeWidth="2.5" />
      <path d="M40 26H51" stroke="#e7eef0" strokeWidth="2" />
      <ellipse cx="27" cy="34" rx="4.8" ry="5.5" fill="var(--piece-shadow)" stroke="var(--piece-highlight)" strokeWidth="1" />
      <ellipse cx="27" cy="34" rx="2.2" ry="3" fill="#152126" />
      <path d="M13 27L15 24M17 23L19 21" stroke="var(--piece-shadow)" strokeWidth="2.5" />
      {/* The eye opening stays clear; two rails project forward below it. */}
      <path d="M35 34H54Q60 34 60 40V44Q60 49 55 49H37M35 41H60M44 34L46 49M54 35L55 48" fill="none" stroke="#14232c" strokeWidth="3.4" />
      <path d="M35 34H54Q60 34 60 40V44Q60 49 55 49H37M35 41H60M44 34L46 49M54 35L55 48" fill="none" stroke={`url(#${id}-metal)`} strokeWidth="1.8" />
      <path d="M28 40L36 49H45" fill="none" stroke="#e1e6dc" strokeWidth="1.8" />
      <path d="M37 47H44L45 51H38Z" fill="#ecede3" stroke="#7c8e94" strokeWidth="0.8" />
      <circle cx="35" cy="34" r="1.7" fill="#e9eeef" />
    </g>
  );
}

function PlayerProfile({ id }: { id: string }) {
  return (
    <g strokeLinejoin="round" strokeLinecap="round">
      <defs>
        <linearGradient id={`${id}-jersey`} x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="var(--piece-highlight)" />
          <stop offset="0.35" stopColor="var(--piece-color)" />
          <stop offset="1" stopColor="var(--piece-shadow)" />
        </linearGradient>
        <linearGradient id={`${id}-pants`} x1="0" y1="0" x2="1" y2="0.8">
          <stop stopColor="#f4f0df" />
          <stop offset="0.6" stopColor="#c8cecb" />
          <stop offset="1" stopColor="#79888a" />
        </linearGradient>
      </defs>
      {/* Far leg and arm sit behind the near-side pads and jersey. */}
      {/* Hip → forward knee → ankle behind the knee, with both toes facing right. */}
      <path d="M29 42L38 44L48 53Q51 56 48 60L43 71L37 70L40 58L32 53L26 49Z" fill="#85918e" stroke="#18282c" strokeWidth="1.2" />
      <path d="M39 66L45 68L43 73L37 71Z" fill="#cdd6d0" stroke="#809292" strokeWidth="0.8" />
      <path d="M37 70L43 71L46 74L54 75V78H36L35 75Z" fill="#17262c" stroke="#b5c6ca" strokeWidth="1" />
      <path d="M38 23L43 27L43 36L53 39L52 44L38 41L34 31Z" fill="#976847" stroke="#18282c" strokeWidth="1.2" />
      <path d="M50 38L55 39L57 43L52 45L49 42Z" fill="#e2e8e7" stroke="#667b83" strokeWidth="1" />
      <path d="M23 41L34 44C36 47 40 52 39 56C39 59 34 61 32 63L25 73L19 70L26 58L29 55L20 49Z" fill={`url(#${id}-pants)`} stroke="#20333a" strokeWidth="1.2" />
      <path d="M24 45L34 54Q36 56 32 59L26 64" fill="none" stroke="var(--piece-color)" strokeWidth="2.5" />
      <path d="M35 52Q40 54 37 58" fill="none" stroke="#f8f6e9" strokeWidth="1.3" />
      <path d="M22 66L28 69L25 74L19 72Z" fill="#eef0e9" stroke="#9eaeaf" strokeWidth="0.8" />
      <path d="M19 72L25 73L28 76L35 77V80H18L17 77Z" fill="#17262c" stroke="#b5c6ca" strokeWidth="1" />
      <path d="M19 79H33M38 77H52" stroke="#e9efed" strokeWidth="1.2" />
      <path d="M24 19C29 16 37 18 42 23L37 34L35 46L21 43L19 32Z" fill={`url(#${id}-jersey)`} stroke="#c6d4d7" strokeWidth="1.2" />
      <path d="M21 39L35 42M23 35L29 37" fill="none" stroke="var(--piece-shadow)" strokeWidth="1.5" />
      <path d="M33 19L36 15L43 17L41 24Z" fill="#ba8661" stroke="#23313a" strokeWidth="1" />
      <path d="M24 21C30 19 34 23 34 28L29 34L22 31L20 27Z" fill={`url(#${id}-jersey)`} stroke="#d0dde0" strokeWidth="1.2" />
      <path d="M22 27L32 30" stroke="#e7e9df" strokeWidth="2" />
      <path d="M25 32L30 33L28 40L39 44L37 49L23 44L21 40Z" fill="#bd8a64" stroke="#26343a" strokeWidth="1.2" />
      <path d="M35 43L41 44L43 47L41 51L36 50L34 47Z" fill="#eef0e9" stroke="#758b93" strokeWidth="1" />
      <g transform="translate(26 0) scale(.48)"><HelmetProfile id={`${id}-head`} /></g>
    </g>
  );
}

export function PieceToken({ team, label, style = 'player', selected = false }: {
  team: Team;
  label: string;
  style?: PieceStyle;
  selected?: boolean;
}) {
  const id = useId();
  return (
    <>
      <span className={`piece ${team} piece--${style}${selected ? ' selected' : ''}`}>
        {style === 'circle' ? label : (
          <svg viewBox={style === 'helmet' ? '0 0 64 64' : '0 0 64 82'} aria-hidden="true" focusable="false" className="piece-profile">
            {style === 'helmet' ? <HelmetProfile id={id} /> : <PlayerProfile id={id} />}
          </svg>
        )}
      </span>
      {style !== 'circle' && <span className={`piece-corner-label ${team}`} aria-hidden="true">{label}</span>}
    </>
  );
}
