import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { GameLine } from '../src/engine/gameline';

function play(...sans: string[]) {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess;
}

describe('GameLine', () => {
  it('is zero for a fresh position', () => {
    expect(new GameLine(play('e4', 'e5')).previous()).toBe(0);
  });

  it('counts earlier occurrences from the game history', () => {
    const once = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
    expect(new GameLine(once).previous()).toBe(1);
    const twice = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
    expect(new GameLine(twice).previous()).toBe(2);
  });

  it('tracks moves pushed and popped during a search', () => {
    const chess = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1');
    const line = new GameLine(chess);
    const move = chess.move('Ng8');
    line.push(move);
    expect(line.previous()).toBe(1); // back to the position after 1. e4 e5
    line.pop();
    expect(line.previous()).toBe(0);
  });

  it('remembers the last moves, oldest first', () => {
    const chess = play('e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4');
    const line = new GameLine(chess);
    expect(line.recent().map((m) => m.from + m.to)).toEqual([
      'e7e5',
      'g1f3',
      'b8c6',
      'f1b5',
      'a7a6',
      'b5a4',
    ]);
    line.push(chess.move('Nf6'));
    expect(line.recent().at(-1)!.to).toBe('f6');
    line.pop();
    expect(line.recent().at(-1)!.to).toBe('a4');
  });
});
