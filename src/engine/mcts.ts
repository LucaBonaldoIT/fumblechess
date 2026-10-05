import { Chess } from 'chess.js';
import type { Square } from 'chess.js';
import { encodeBoard, N_FEATURES, positionKey, sqIndex } from './encoding';
import { Repetitions } from './repetitions';
import type { Evaluator, SearchConfig, Wdl } from './types';

/**
 * Monte-Carlo tree search in the AlphaZero style (PUCT), guided only by the neural network:
 *  - the policy head gives each move a prior probability,
 *  - the value head scores new positions (no rollouts),
 *  - the final move is *sampled* from visit counts, so play stays varied and human-like.
 */
const C_PUCT = 1.5; // exploration constant
const FPU_REDUCTION = 0.2; // unexplored moves look a bit worse than their parent
const BATCH = 8; // positions evaluated per model call (leaves selected with virtual loss)

interface Edge {
  from: Square;
  to: Square;
  promotion?: 'q';
  prior: number;
  child: Node | null;
}

interface Node {
  /** visits (includes in-flight virtual visits during a batch) */
  n: number;
  /** sum of values from the point of view of the side to move at this node */
  w: number;
  edges: Edge[] | null; // null until the node has been evaluated
  /** exact result when the game is over here: -1 (side to move is mated) or 0 (draw) */
  terminal: number | null;
  pending: boolean;
}

export interface RootStat {
  from: Square;
  to: Square;
  promotion?: 'q';
  san: string;
  /** simulations that went through this move */
  visits: number;
  /** the policy head's probability before searching */
  prior: number;
  /** the AI's expected score (0-1) after this move, null if never visited */
  q: number | null;
}

export interface SearchResult {
  /** all legal moves, most visited first */
  stats: RootStat[];
  /** index into `stats` of the move to play */
  pick: number;
  /** value head's win/draw/loss for the root position (White's view) */
  wdl: Wdl;
  sims: number;
  ms: number;
}

interface Leaf {
  node: Node;
  path: Node[];
  features: Float32Array;
  legal: { from: Square; to: Square; promotion?: 'q' }[];
  whiteToMove: boolean;
}

const newNode = (): Node => ({ n: 0, w: 0, edges: null, terminal: null, pending: false });

/** Legal moves, queen promotions only (the model has no underpromotion output). */
const legalMoves = (chess: Chess) =>
  chess
    .moves({ verbose: true })
    .filter((m) => !m.promotion || m.promotion === 'q')
    .map((m) => ({
      from: m.from,
      to: m.to,
      promotion: m.promotion as 'q' | undefined,
      san: m.san,
    }));

function select(node: Node): Edge {
  const parentQ = node.n > 0 ? node.w / node.n : 0;
  const sqrtN = Math.sqrt(Math.max(1, node.n));
  let best = node.edges![0];
  let bestScore = -Infinity;
  for (const e of node.edges!) {
    const c = e.child;
    const q = c && c.n > 0 ? -c.w / c.n : parentQ - FPU_REDUCTION;
    const score = q + (C_PUCT * e.prior * sqrtN) / (1 + (c ? c.n : 0));
    if (score > bestScore) {
      bestScore = score;
      best = e;
    }
  }
  return best;
}

/** Add `value` (from the leaf's side to move) up the path, flipping sign each ply and removing virtual loss. */
function backup(path: Node[], value: number) {
  let v = value;
  for (let i = path.length - 1; i >= 0; i--) {
    path[i].w += v - 1; // -1 undoes the virtual loss added during selection
    v = -v;
  }
}

function undoVirtualLoss(path: Node[]) {
  for (const nd of path) {
    nd.n -= 1;
    nd.w -= 1;
  }
}

function expand(node: Node, legal: Leaf['legal'], policy: Float32Array, offset: number) {
  const logits = legal.map((m) => policy[offset + sqIndex(m.from) * 64 + sqIndex(m.to)]);
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const total = exps.reduce((a, b) => a + b, 0);
  node.edges = legal.map((m, i) => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    prior: exps[i] / total,
    child: null,
  }));
  node.pending = false;
}

/** One selection pass from the root. Mutates `chess` while descending and restores it before returning. */
function simulate(root: Node, chess: Chess, rep: Repetitions): Leaf | 'terminal' | 'collision' {
  const path: Node[] = [root];
  root.n += 1;
  root.w += 1;
  let node = root;
  let plies = 0;
  const restore = () => {
    for (let i = 0; i < plies; i++) {
      chess.undo();
      rep.pop();
    }
  };
  for (;;) {
    if (node.terminal !== null) {
      restore();
      backup(path, node.terminal);
      return 'terminal';
    }
    if (!node.edges) {
      if (node.pending) {
        // another leaf in this batch is already waiting on this position
        restore();
        undoVirtualLoss(path);
        return 'collision';
      }
      node.pending = true;
      const leaf: Leaf = {
        node,
        path,
        features: encodeBoard(chess, rep.previous()),
        legal: legalMoves(chess),
        whiteToMove: chess.turn() === 'w',
      };
      restore();
      return leaf;
    }
    const edge = select(node);
    const played = chess.move({ from: edge.from, to: edge.to, promotion: edge.promotion });
    rep.push(positionKey(played.after));
    plies += 1;
    if (!edge.child) {
      edge.child = newNode();
      if (chess.isGameOver()) edge.child.terminal = chess.isCheckmate() ? -1 : 0;
    }
    node = edge.child;
    node.n += 1;
    node.w += 1;
    path.push(node);
  }
}

function snapshot(root: Node, sans: Map<string, string>): RootStat[] {
  return root
    .edges!.map((e) => ({
      from: e.from,
      to: e.to,
      promotion: e.promotion,
      san: sans.get(e.from + e.to + (e.promotion ?? ''))!,
      visits: e.child?.n ?? 0,
      prior: e.prior,
      q: e.child && e.child.n > 0 ? (-e.child.w / e.child.n + 1) / 2 : null,
    }))
    .sort((a, b) => b.visits - a.visits || b.prior - a.prior);
}

export interface SearchHooks {
  /** the policy/value network (injected so the search can be tested without a model) */
  evaluate: Evaluator;
  config: SearchConfig;
  onProgress?: (stats: RootStat[], sims: number, wdl: Wdl) => void;
  aborted?: () => boolean;
}

/** Search the current position. Resolves null if aborted. `chess` is left unchanged. */
export async function search(chess: Chess, hooks: SearchHooks): Promise<SearchResult | null> {
  const cfg = hooks.config;
  const evaluateBatch = hooks.evaluate;
  const t0 = performance.now();
  const rootMoves = legalMoves(chess);
  const sans = new Map(rootMoves.map((m) => [m.from + m.to + (m.promotion ?? ''), m.san]));

  // evaluate the root once to get priors and the value head's opinion
  const rep = new Repetitions(chess);
  const rootOut = await evaluateBatch(encodeBoard(chess, rep.previous()), 1);
  const root = newNode();
  expand(root, rootMoves, rootOut.policy, 0);
  const wdl: Wdl = [rootOut.wdl[0], rootOut.wdl[1], rootOut.wdl[2]];

  let sims = 0;
  let lastReport = 0;
  while (sims < cfg.sims && performance.now() - t0 < cfg.maxMs) {
    if (hooks.aborted?.()) return null;
    const leaves: Leaf[] = [];
    while (leaves.length < BATCH && sims + leaves.length < cfg.sims) {
      const r = simulate(root, chess, rep);
      if (r === 'collision') break;
      if (r === 'terminal') sims += 1;
      else leaves.push(r);
    }
    if (leaves.length) {
      const feats = new Float32Array(leaves.length * 64 * N_FEATURES);
      leaves.forEach((l, i) => feats.set(l.features, i * 64 * N_FEATURES));
      const out = await evaluateBatch(feats, leaves.length);
      if (hooks.aborted?.()) return null;
      leaves.forEach((l, i) => {
        expand(l.node, l.legal, out.policy, i * 4096);
        const vWhite = out.wdl[i * 3] - out.wdl[i * 3 + 2]; // P(win) - P(loss) for White
        backup(l.path, l.whiteToMove ? vWhite : -vWhite);
      });
      sims += leaves.length;
    }
    const now = performance.now();
    if (hooks.onProgress && now - lastReport > 120) {
      lastReport = now;
      hooks.onProgress(snapshot(root, sans), sims, wdl);
    }
    if (!leaves.length && sims >= cfg.sims) break;
  }

  const stats = snapshot(root, sans);
  // sample the move from visit counts ^ (1 / T): varied, human-like play instead of always the top move
  const weights = stats.map((s) => Math.pow(s.visits, 1 / cfg.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = 0;
  if (total > 0) {
    let r = Math.random() * total;
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        pick = i;
        break;
      }
    }
  }
  return { stats, pick, wdl, sims, ms: performance.now() - t0 };
}
