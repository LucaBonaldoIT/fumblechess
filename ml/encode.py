"""Board encoding. Must match src/engine/encoding.ts (encodeBoard) exactly.

Square index = rank * 8 + file, a1 = 0, h8 = 63 (same as python-chess).
Per-square features (N_FEATURES = 34):
  0-5   white P N B R Q K one-hot
  6-11  black p n b r q k one-hot
  12    side to move is white                          (broadcast to all squares)
  13-16 castling rights: white K, white Q, black k, black q   (broadcast)
  17    en-passant target square, only if a legal en-passant capture exists (1 on that square)
  18    current position has occurred once before      (broadcast)
  19    current position has occurred twice before     (broadcast)
  20    halfmove clock / 100, capped at 1              (broadcast)
  21    fullmove number / 100, capped at 1             (broadcast)
  22-33 the last HISTORY moves, most recent first: 22 + 2k on the from square and 23 + 2k on the to square
        of the move played k + 1 plies ago (castling is the king's move)
Move index = from_square * 64 + to_square (promotions are always queen).
"""
import chess
import numpy as np

HISTORY = 6
N_FEATURES = 22 + 2 * HISTORY
N_MOVES = 64 * 64


def encode_board(board: chess.Board, prev_occurrences: int = 0) -> np.ndarray:
    """`prev_occurrences`: how many times this exact position (pieces, side, castling, legal ep) came up earlier in the game.
    The previous moves are read from `board.move_stack`."""
    x = np.zeros((64, N_FEATURES), dtype=np.float32)
    for sq, piece in board.piece_map().items():
        x[sq, (piece.piece_type - 1) + (0 if piece.color == chess.WHITE else 6)] = 1.0
    x[:, 12] = 1.0 if board.turn == chess.WHITE else 0.0
    x[:, 13] = board.has_kingside_castling_rights(chess.WHITE)
    x[:, 14] = board.has_queenside_castling_rights(chess.WHITE)
    x[:, 15] = board.has_kingside_castling_rights(chess.BLACK)
    x[:, 16] = board.has_queenside_castling_rights(chess.BLACK)
    if board.ep_square is not None and board.has_legal_en_passant():
        x[board.ep_square, 17] = 1.0
    x[:, 18] = 1.0 if prev_occurrences >= 1 else 0.0
    x[:, 19] = 1.0 if prev_occurrences >= 2 else 0.0
    x[:, 20] = min(board.halfmove_clock, 100) / 100
    x[:, 21] = min(board.fullmove_number, 100) / 100
    for k, mv in enumerate(reversed(board.move_stack[-HISTORY:])):
        x[mv.from_square, 22 + 2 * k] = 1.0
        x[mv.to_square, 23 + 2 * k] = 1.0
    return x


def position_key(board: chess.Board) -> str:
    """Key for counting repetitions: pieces, side to move, castling, legal en-passant square."""
    return board.epd()


def move_index(move: chess.Move) -> int:
    return move.from_square * 64 + move.to_square


def legal_move_indices(board: chess.Board) -> list[tuple[int, chess.Move]]:
    """Legal moves keyed by from/to index; underpromotions are dropped (queen only)."""
    out = []
    for m in board.legal_moves:
        if m.promotion not in (None, chess.QUEEN):
            continue
        out.append((move_index(m), m))
    return out
