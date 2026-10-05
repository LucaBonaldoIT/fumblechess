"""Write tests/fixtures/encoding.json: reference feature vectors from the Python encoder.

The TypeScript encoder (src/engine/encoding.ts) must produce identical numbers; tests/encoding.test.ts checks that.
Regenerate after changing ml/encode.py:  .venv/bin/python export_encoding_fixture.py
"""
import collections
import json
from pathlib import Path

import chess

from encode import encode_board, position_key

CASES = {
    "start position": "",
    "en passant available": "e4 a6 e5 d5",
    "en passant square but no legal capture": "e4 a6 e5 b5",
    "position seen once before": "e4 e5 Nf3 Nf6 Ng1 Ng8",
    "position seen twice before": "e4 e5 Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8",
    "halfmove clock": "Nf3 Nf6 Ng1 Ng8",
    "castling rights lost": "e4 e5 Ke2",
    "middlegame": "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7",
    "queen promotion": "e4 d5 exd5 c6 dxc6 Nf6 cxb7 Nbd7 bxa8=Q",
}


def main():
    out = []
    for name, line in CASES.items():
        board = chess.Board()
        seen = collections.Counter({position_key(board): 1})
        for san in line.split():
            board.push_san(san)
            seen[position_key(board)] += 1
        prev = seen[position_key(board)] - 1
        out.append({"name": name, "moves": line.split(), "prevOccurrences": prev, "features": encode_board(board, prev).flatten().tolist()})
    path = Path(__file__).resolve().parent.parent / "tests" / "fixtures" / "encoding.json"
    path.write_text(json.dumps(out))
    print(f"wrote {path} ({len(out)} cases)")


if __name__ == "__main__":
    main()
