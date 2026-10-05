import type { Chess } from 'chess.js';

// Board encoding. Must match ml/encode.py exactly (tests/encoding.test.ts checks it against Python output).
// Square index = rank * 8 + file (a1 = 0). 22 features per square:
// 0-5 white PNBRQK, 6-11 black pnbrqk, 12 white to move, 13-16 castling K Q k q,
// 17 en-passant target square (only when a legal en-passant capture exists), 18-19 position seen once / twice before,
// 20 halfmove clock / 100 (capped), 21 fullmove number / 100 (capped). Features 12-16 and 18-21 are broadcast to every square.
export const N_FEATURES = 22;
const PIECE_PLANE: Record<string, number> = { p: 0, n: 1, b: 2, r: 3, q: 4, k: 5 };

export const sqIndex = (s: string) => (s.charCodeAt(1) - 49) * 8 + (s.charCodeAt(0) - 97);

/** Key for counting repetitions: pieces, side to move, castling, legal en-passant square (first 4 FEN fields). */
export const positionKey = (fen: string) => fen.split(' ', 4).join(' ');

/**
 * @param prevOccurrences how many times this exact position came up earlier in the game
 */
export function encodeBoard(chess: Chess, prevOccurrences = 0): Float32Array {
  const x = new Float32Array(64 * N_FEATURES);
  for (const row of chess.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const plane = PIECE_PLANE[cell.type] + (cell.color === 'w' ? 0 : 6);
      x[sqIndex(cell.square) * N_FEATURES + plane] = 1;
    }
  }
  // chess.js only writes the en-passant square into the FEN when the capture is legal, same as python-chess' has_legal_en_passant
  const [, , , ep, halfmove, fullmove] = chess.fen().split(' ');
  if (ep !== '-') x[sqIndex(ep) * N_FEATURES + 17] = 1;
  const wc = chess.getCastlingRights('w');
  const bc = chess.getCastlingRights('b');
  const globals = [
    chess.turn() === 'w' ? 1 : 0,
    wc.k ? 1 : 0,
    wc.q ? 1 : 0,
    bc.k ? 1 : 0,
    bc.q ? 1 : 0,
  ];
  const tail = [
    prevOccurrences >= 1 ? 1 : 0,
    prevOccurrences >= 2 ? 1 : 0,
    Math.min(Number(halfmove), 100) / 100,
    Math.min(Number(fullmove), 100) / 100,
  ];
  for (let sq = 0; sq < 64; sq++) {
    const o = sq * N_FEATURES;
    for (let i = 0; i < globals.length; i++) x[o + 12 + i] = globals[i];
    for (let i = 0; i < tail.length; i++) x[o + 18 + i] = tail[i];
  }
  return x;
}
