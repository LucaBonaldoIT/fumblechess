export type Level = 1 | 2 | 3;

/** [win, draw, loss] probabilities from White's point of view. */
export type Wdl = [number, number, number];

/** Search budget for one difficulty level. */
export interface SearchConfig {
  /** MCTS simulations (one model evaluation per new position) */
  sims: number;
  /** hard time cap in milliseconds */
  maxMs: number;
  /** the final move is sampled from visit counts ^ (1 / temperature) */
  temperature: number;
}

export interface BatchOutput {
  /** policy logits, 4096 per position (index = from * 64 + to) */
  policy: Float32Array;
  /** win / draw / loss probabilities from White's point of view, 3 per position */
  wdl: Float32Array;
}

/** Evaluates `n` encoded positions (n * 64 * N_FEATURES floats) with the policy/value network. */
export type Evaluator = (features: Float32Array, n: number) => Promise<BatchOutput>;
