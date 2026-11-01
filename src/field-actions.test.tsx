// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from './main';
import { applyAction, createGame } from './engine/rules';

const humans = { home: 'human', away: 'human' } as const;
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe.each(['home', 'away'] as const)('%s direct field actions', team => {
  const x = (column: number) => team === 'home' ? column : 23 - column;
  const cell = (column: number, row: number) => screen.getByTitle(`${x(column)},${row}`);
  const setup = () => {
    const game = createGame({ possession: team, phase: 'live', lineOfScrimmage: x(12) });
    const positions = { qb: [10, 5], rb: [9, 5], ol3: [11, 5], wr1: [12, 1] };
    game.pieces = game.pieces.filter(piece => piece.team === team && piece.id.slice(team.length + 1) in positions).map(piece => {
      const [column, row] = positions[piece.id.slice(team.length + 1) as keyof typeof positions];
      return { ...piece, coord: { x: x(column), y: row } };
    });
    return game;
  };

  it('shows simultaneous targets and passes by clicking a marked receiver', () => {
    vi.spyOn(Math, 'random').mockReturnValue(.99);
    const { container } = render(<App initialGame={setup()} initialPlayers={humans} />);
    fireEvent.click(cell(10, 5));
    expect(cell(10, 4)).toHaveClass('move-target');
    expect(cell(9, 5)).toHaveClass('handoff-target');
    expect(cell(11, 5)).toHaveClass('handoff-target');
    expect(cell(12, 1)).toHaveClass('pass-target');
    expect(screen.queryByRole('button', { name: /^(Pass|Handoff|Tackle)/ })).not.toBeInTheDocument();
    fireEvent.click(cell(12, 1));
    expect(cell(12, 1)).toHaveAccessibleName(/WR; controlled ball/);
    expect(screen.getByRole('status')).toHaveTextContent(/completed pass:/i);
    expect(container.querySelector('.pass-target, .handoff-target, .move-target')).toBeNull();
  });

  it('hands off to an adjacent teammate using Enter, without rolling dice', () => {
    const random = vi.spyOn(Math, 'random');
    render(<App initialGame={setup()} initialPlayers={humans} />);
    fireEvent.click(cell(10, 5));
    expect(cell(9, 5)).not.toHaveClass('pass-target');
    fireEvent.keyDown(cell(9, 5), { key: 'Enter' });
    expect(cell(9, 5)).toHaveAccessibleName(/RB; controlled ball/);
    expect(screen.getByRole('status')).toHaveTextContent('Handoff:');
    expect(random).not.toHaveBeenCalled();
  });

  it('recovers a loose ball by selecting its player and clicking the marked square', () => {
    const game = setup();
    game.ball = { kind: 'loose', coord: { x: x(9), y: 5 } };
    render(<App initialGame={game} initialPlayers={humans} />);
    fireEvent.click(cell(9, 5));
    expect(cell(9, 5)).toHaveClass('recovery-target');
    expect(cell(9, 5)).toHaveAccessibleName(/recover ball/);
    fireEvent.click(cell(9, 5));
    expect(cell(9, 5)).toHaveAccessibleName(/RB; controlled ball/);
    expect(screen.getByRole('status')).toHaveTextContent(/recover/i);
  });

  it('moves the displayed ball from Center to QB on the snap', () => {
    let game = createGame({ possession: team, lineOfScrimmage: 12 });
    game = applyAction(applyAction(game, { type: 'confirmFormation', side: 'offense' }), { type: 'confirmFormation', side: 'defense' });
    render(<App initialGame={game} initialPlayers={humans} />);
    expect(screen.getByRole('img', { name: 'Ball: controlled by C' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Snap' }));
    expect(screen.getByRole('img', { name: 'Ball: controlled by QB' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Ball: controlled by C' })).not.toBeInTheDocument();
  });
});
