import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import { N_FEATURES } from '../src/engine/encoding';
import { search } from '../src/engine/mcts';
import type { Evaluator, SearchConfig } from '../src/engine/types';

/** A network that knows nothing: uniform policy, even win/draw/loss. The search must do the work. */
const blank: Evaluator = async (features, n) => {
  expect(features.length).toBe(n * 64 * N_FEATURES);
  return { policy: new Float32Array(n * 4096), wdl: new Float32Array(n * 3).fill(1 / 3) };
};

const config = (over: Partial<SearchConfig> = {}): SearchConfig => ({
  sims: 120,
  maxMs: 10_000,
  temperature: 0.05,
  ...over,
});

describe('search', () => {
  it('finds mate in one using only the terminal-position rules', async () => {
    const chess = new Chess();
    for (const san of ['f3', 'e5', 'g4']) chess.move(san);
    const res = await search(chess, { evaluate: blank, config: config() });
    expect(res).not.toBeNull();
    expect(res!.stats[0].san).toBe('Qh4#');
    expect(res!.stats[res!.pick].san).toBe('Qh4#');
  });

  it('leaves the board unchanged', async () => {
    const chess = new Chess();
    for (const san of ['e4', 'e5', 'Nf3']) chess.move(san);
    const before = { fen: chess.fen(), history: chess.history() };
    await search(chess, { evaluate: blank, config: config({ sims: 40 }) });
    expect(chess.fen()).toBe(before.fen);
    expect(chess.history()).toEqual(before.history);
  });

  it('only ever returns legal moves, queen promotions only', async () => {
    const chess = new Chess('4k3/P7/8/8/8/8/p7/4K3 w - - 0 1');
    const res = await search(chess, {
      evaluate: blank,
      config: config({ sims: 30, temperature: 1 }),
    });
    const legal = chess.moves({ verbose: true }).filter((m) => !m.promotion || m.promotion === 'q');
    expect(res!.stats).toHaveLength(legal.length);
    const picked = res!.stats[res!.pick];
    expect(legal.some((m) => m.from === picked.from && m.to === picked.to)).toBe(true);
  });

  it('respects the simulation budget', async () => {
    const res = await search(new Chess(), { evaluate: blank, config: config({ sims: 16 }) });
    expect(res!.sims).toBe(16);
    const visits = res!.stats.reduce((sum, s) => sum + s.visits, 0);
    expect(visits).toBe(16);
  });

  it('stops when aborted', async () => {
    const res = await search(new Chess(), {
      evaluate: blank,
      config: config(),
      aborted: () => true,
    });
    expect(res).toBeNull();
  });

  it('follows a strong prior when the search budget is tiny', async () => {
    // policy puts nearly all weight on e2e4 (square index e2 = 12, e4 = 28)
    const e4: Evaluator = async (_f, n) => {
      const policy = new Float32Array(n * 4096);
      for (let i = 0; i < n; i++) policy[i * 4096 + 12 * 64 + 28] = 12;
      return { policy, wdl: new Float32Array(n * 3).fill(1 / 3) };
    };
    const res = await search(new Chess(), { evaluate: e4, config: config({ sims: 8 }) });
    expect(res!.stats[0].san).toBe('e4');
    expect(res!.stats[0].prior).toBeGreaterThan(0.9);
  });
});
