import type { SfScore } from './stockfish';

export interface EvalBar {
  /** White's expected score, 0-1: how much of the bar is White's */
  white: number;
  /** text on the bar: "+0.8", "-1.3", "M3", "1-0", ... */
  label: string;
}

/**
 * Turn a Stockfish score (White's point of view) into the evaluation bar state.
 * `result` overrides the score once the game is decided.
 */
export function evalBar(
  score: SfScore | null,
  result: 'white' | 'black' | 'draw' | null = null,
): EvalBar {
  if (result === 'white') return { white: 1, label: '1-0' };
  if (result === 'black') return { white: 0, label: '0-1' };
  if (result === 'draw') return { white: 0.5, label: '½-½' };
  if (score?.mate !== undefined) {
    return {
      white: score.mate > 0 ? 1 : 0,
      label: `${score.mate > 0 ? '' : '-'}M${Math.abs(score.mate)}`,
    };
  }
  if (score?.cp !== undefined) {
    const pawns = score.cp / 100;
    return {
      white: 1 / (1 + 10 ** (-score.cp / 400)), // standard centipawn -> expected score
      label:
        Math.abs(pawns) < 0.05 ? '0.0' : `${pawns > 0 ? '+' : '-'}${Math.abs(pawns).toFixed(1)}`,
    };
  }
  return { white: 0.5, label: '0.0' };
}
