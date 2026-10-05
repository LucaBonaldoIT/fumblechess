import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { positionKey } from '../src/engine/encoding';
import { Repetitions } from '../src/engine/repetitions';

function play(...sans: string[]) {
  const chess = new Chess();
  for (const san of sans) chess.move(san);
  return chess;
}

describe('Repetitions', () => {
  it('is zero for a fresh position', () => {
    expect(new Repetitions(play('e4', 'e5')).previous()).toBe(0);
  });

  it('counts earlier occurrences from the game history', () => {
    const once = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
    expect(new Repetitions(once).previous()).toBe(1);
    const twice = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8');
    expect(new Repetitions(twice).previous()).toBe(2);
  });

  it('tracks moves pushed and popped during a search', () => {
    const chess = play('e4', 'e5', 'Nf3', 'Nf6', 'Ng1');
    const rep = new Repetitions(chess);
    const move = chess.move('Ng8');
    rep.push(positionKey(move.after));
    expect(rep.previous()).toBe(1); // back to the position after 1. e4 e5
    rep.pop();
    expect(rep.previous()).toBe(0);
  });
});
