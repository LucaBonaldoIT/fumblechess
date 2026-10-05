import { describe, expect, it } from 'vitest';
import { evalBar } from '../src/engine/eval';

describe('evalBar', () => {
  it('is balanced with no score yet', () => {
    expect(evalBar(null)).toEqual({ white: 0.5, label: '0.0' });
  });

  it('formats centipawns as signed pawns', () => {
    expect(evalBar({ cp: 80 }).label).toBe('+0.8');
    expect(evalBar({ cp: -130 }).label).toBe('-1.3');
    expect(evalBar({ cp: 3 }).label).toBe('0.0');
  });

  it('maps centipawns through the Elo logistic', () => {
    expect(evalBar({ cp: 0 }).white).toBeCloseTo(0.5);
    expect(evalBar({ cp: 100 }).white).toBeCloseTo(0.64, 2);
    expect(evalBar({ cp: 400 }).white).toBeCloseTo(0.909, 3);
    expect(evalBar({ cp: -400 }).white).toBeCloseTo(0.091, 3);
  });

  it('shows forced mates for the right side', () => {
    expect(evalBar({ mate: 3 })).toEqual({ white: 1, label: 'M3' });
    expect(evalBar({ mate: -2 })).toEqual({ white: 0, label: '-M2' });
  });

  it('shows the result once the game is over', () => {
    expect(evalBar({ cp: 500 }, 'black')).toEqual({ white: 0, label: '0-1' });
    expect(evalBar(null, 'white')).toEqual({ white: 1, label: '1-0' });
    expect(evalBar(null, 'draw').label).toBe('½-½');
  });
});
