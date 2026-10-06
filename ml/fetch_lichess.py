"""Stream real human games from the Lichess open database and keep (position, move, result) samples.

https://database.lichess.org  -- monthly PGN dumps (.pgn.zst, tens of GB). We stream the file over HTTP
and stop as soon as we have enough games, so only the first part of the file is downloaded.

Filters: both players' Elo inside [--min-elo, --max-elo], chosen speeds, normal termination.
"""
import argparse
import collections
import io
import random
import re
import ssl
import time
import urllib.request

import certifi
import chess
import chess.pgn
import numpy as np
import zstandard

from encode import N_MOVES, encode_board, legal_move_indices, move_index, position_key

URL = "https://database.lichess.org/standard/lichess_db_standard_rated_{month}.pgn.zst"
HDR = re.compile(r'^\[(\w+) "(.*)"\]$')


def games(stream):
    """Yield (headers dict, raw pgn text) for each game in a text stream."""
    headers, lines = {}, []
    for line in stream:
        line = line.rstrip("\n")
        if line.startswith("["):
            m = HDR.match(line)
            if m:
                if headers.get("_moves_seen"):
                    yield headers, "\n".join(lines)
                    headers, lines = {}, []
                headers[m.group(1)] = m.group(2)
            lines.append(line)
        elif line.strip():
            lines.append("")
            lines.append(line)
            headers["_moves_seen"] = True
    if headers.get("_moves_seen"):
        yield headers, "\n".join(lines)


def accept(h, args) -> bool:
    try:
        we, be = int(h["WhiteElo"]), int(h["BlackElo"])
    except (KeyError, ValueError):
        return False
    if not (args.min_elo <= we <= args.max_elo and args.min_elo <= be <= args.max_elo):
        return False
    if h.get("Result") not in ("1-0", "0-1", "1/2-1/2") or h.get("Termination") != "Normal":
        return False
    speed = h.get("Event", "").lower()
    return any(s in speed for s in args.speeds)


def wdl(result: str):
    return {"1-0": (1, 0, 0), "1/2-1/2": (0, 1, 0), "0-1": (0, 0, 1)}[result]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--month", default="2024-01", help="dump to stream, e.g. 2024-01")
    ap.add_argument("--min-elo", type=int, default=1800)
    ap.add_argument("--max-elo", type=int, default=2200)
    ap.add_argument("--speeds", default="blitz,rapid,classical", help="comma list matched against the Event header")
    ap.add_argument("--games", type=int, default=8000, help="stop after this many accepted games")
    ap.add_argument("--per-game", type=int, default=10, help="random positions sampled per game")
    ap.add_argument("--max-mb", type=int, default=600, help="hard cap on compressed megabytes streamed")
    ap.add_argument("--out", default="data/lichess.npz")
    args = ap.parse_args()
    args.speeds = args.speeds.split(",")
    random.seed(0)

    req = urllib.request.Request(URL.format(month=args.month), headers={"User-Agent": "fumblechess-ml"})
    resp = urllib.request.urlopen(req, context=ssl.create_default_context(cafile=certifi.where()))

    counted = {"bytes": 0}

    class Counting(io.RawIOBase):
        def readable(self):
            return True

        def readinto(self, b):
            n = resp.readinto(b)
            counted["bytes"] += n or 0
            if counted["bytes"] > args.max_mb * 1024 * 1024:
                return 0  # truncate stream: cap reached
            return n

    reader = zstandard.ZstdDecompressor().stream_reader(io.BufferedReader(Counting(), 1 << 20))
    text = io.TextIOWrapper(reader, encoding="utf-8", errors="replace")

    X, M, Y, V, ELO = [], [], [], [], []
    seen = kept = 0
    t0 = time.time()
    try:
        for h, pgn in games(text):
            seen += 1
            if accept(h, args):
                game = chess.pgn.read_game(io.StringIO(pgn))
                moves = list(game.mainline_moves()) if game else []
                if len(moves) >= 10:
                    kept += 1
                    plies = random.sample(range(len(moves)), min(args.per_game, len(moves)))
                    board = game.board()
                    chosen = set(plies)
                    seen_positions = collections.Counter({position_key(board): 1})
                    for ply, mv in enumerate(moves):
                        if ply in chosen and mv.promotion in (None, chess.QUEEN):
                            mask = np.zeros(N_MOVES, dtype=bool)
                            for idx, _ in legal_move_indices(board):
                                mask[idx] = True
                            f = encode_board(board, seen_positions[position_key(board)] - 1)
                            f[:, 20:22] *= 100  # the two clock features are stored as integers 0-100 (train.py divides by 100)
                            X.append(np.rint(f).astype(np.uint8))
                            M.append(np.packbits(mask))
                            Y.append(move_index(mv))
                            V.append(wdl(h["Result"]))
                            ELO.append(int(h["WhiteElo"] if board.turn == chess.WHITE else h["BlackElo"]))
                        board.push(mv)
                        seen_positions[position_key(board)] += 1
            if seen % 20000 == 0:
                print(f"scanned {seen} games, kept {kept}, {counted['bytes'] / 1e6:.0f} MB, {time.time() - t0:.0f}s", flush=True)
            if kept >= args.games:
                break
    finally:
        resp.close()

    print(f"done: scanned {seen}, kept {kept} games -> {len(Y)} positions ({counted['bytes'] / 1e6:.0f} MB streamed)")
    np.savez_compressed(
        args.out,
        x=np.stack(X), mask=np.stack(M), move=np.array(Y, dtype=np.int16),
        wdl=np.array(V, dtype=np.float32), elo=np.array(ELO, dtype=np.int16),
    )
    print("saved", args.out)


if __name__ == "__main__":
    main()
