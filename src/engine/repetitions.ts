import type { Chess } from 'chess.js';
import { positionKey } from './encoding';

/** Counts how often each position has occurred along the current line (game so far + moves tried in the tree). */
export class Repetitions {
  private counts = new Map<string, number>();
  private line: string[]; // position keys along the line; the last one is the position on the board

  constructor(chess: Chess) {
    const history = chess.history({ verbose: true });
    this.line = [positionKey(history.length ? history[0].before : chess.fen())];
    for (const m of history) this.line.push(positionKey(m.after));
    for (const k of this.line) this.counts.set(k, (this.counts.get(k) ?? 0) + 1);
  }

  push(key: string) {
    this.line.push(key);
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  pop() {
    const key = this.line.pop()!;
    this.counts.set(key, this.counts.get(key)! - 1);
  }

  /** how many times the position on the board occurred earlier in the line */
  previous(): number {
    return this.counts.get(this.line[this.line.length - 1])! - 1;
  }
}
