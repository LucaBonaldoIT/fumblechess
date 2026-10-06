import type { Chess } from 'chess.js';
import { HISTORY, positionKey } from './encoding';

export interface PlayedMove {
  from: string;
  to: string;
  /** FEN after the move */
  after: string;
}

/**
 * The line being looked at (game so far + moves tried in the tree): counts how often each position has occurred and
 * remembers the moves that led here, both of which the network sees.
 */
export class GameLine {
  private counts = new Map<string, number>();
  private line: string[]; // position keys along the line; the last one is the position on the board
  private moves: PlayedMove[];

  constructor(chess: Chess) {
    const history = chess.history({ verbose: true });
    this.line = [positionKey(history.length ? history[0].before : chess.fen())];
    for (const m of history) this.line.push(positionKey(m.after));
    for (const k of this.line) this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
    this.moves = history.map((m) => ({ from: m.from, to: m.to, after: m.after }));
  }

  push(move: PlayedMove) {
    const key = positionKey(move.after);
    this.line.push(key);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
    this.moves.push(move);
  }

  pop() {
    const key = this.line.pop()!;
    this.counts.set(key, this.counts.get(key)! - 1);
    this.moves.pop();
  }

  /** how many times the position on the board occurred earlier in the line */
  previous(): number {
    return this.counts.get(this.line[this.line.length - 1])! - 1;
  }

  /** the last HISTORY moves, oldest first */
  recent(): readonly PlayedMove[] {
    return this.moves.slice(-HISTORY);
  }
}
