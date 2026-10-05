"""Python port of the in-browser bot (src/mcts.ts): policy+value network guided PUCT tree search.

Keep SEARCH in sync with LEVELS in src/engine/levels.ts. Used for offline experiments such as rate.py.
"""
import math
import random
from pathlib import Path

import chess
import numpy as np
import onnxruntime as ort

from encode import encode_board, position_key

SEARCH = {  # level -> (simulations, final-move temperature)
    1: (24, 1.0),
    2: (96, 0.8),
    3: (180, 0.6),
}
C_PUCT = 1.5
FPU_REDUCTION = 0.2
BATCH = 8
MODELS = Path(__file__).resolve().parent.parent / "public" / "models"


class Node:
    __slots__ = ("n", "w", "edges", "terminal", "pending")

    def __init__(self):
        self.n = 0  # visits (includes in-flight virtual visits)
        self.w = 0.0  # sum of values from the side to move at this node
        self.edges = None  # list[Edge], None until evaluated
        self.terminal = None  # -1 (side to move is mated) or 0 (draw)
        self.pending = False


class Edge:
    __slots__ = ("move", "prior", "child")

    def __init__(self, move, prior):
        self.move, self.prior, self.child = move, prior, None


def legal_moves(board: chess.Board):
    """Queen promotions only: the model has no underpromotion output."""
    return [m for m in board.legal_moves if m.promotion in (None, chess.QUEEN)]


class Bot:
    def __init__(self, level: int = 1, sims: int | None = None, temperature: float | None = None, seed: int | None = None):
        d_sims, d_temp = SEARCH[level]
        self.sims = sims or d_sims
        self.temperature = temperature or d_temp
        self.rng = random.Random(seed)
        so = ort.SessionOptions()
        so.intra_op_num_threads = 1  # games run one at a time; keep results reproducible and cheap
        self.sess = ort.InferenceSession(str(MODELS / f"level{level}.onnx"), so, providers=["CPUExecutionProvider"])

    # ---- network ----
    def _evaluate(self, feats: np.ndarray):
        policy, value = self.sess.run(None, {"board": feats.astype(np.float32)})
        e = np.exp(value - value.max(axis=1, keepdims=True))
        return policy, e / e.sum(axis=1, keepdims=True)

    # ---- search ----
    @staticmethod
    def _select(node: Node) -> Edge:
        parent_q = node.w / node.n if node.n > 0 else 0.0
        sqrt_n = math.sqrt(max(1, node.n))
        best, best_score = None, -1e18
        for e in node.edges:
            c = e.child
            q = -c.w / c.n if c is not None and c.n > 0 else parent_q - FPU_REDUCTION
            score = q + C_PUCT * e.prior * sqrt_n / (1 + (c.n if c is not None else 0))
            if score > best_score:
                best, best_score = e, score
        return best

    @staticmethod
    def _backup(path, value):
        v = value
        for node in reversed(path):
            node.w += v - 1  # -1 removes the virtual loss added during selection
            v = -v

    @staticmethod
    def _expand(node, legal, policy_row):
        logits = np.array([policy_row[m.from_square * 64 + m.to_square] for m in legal])
        p = np.exp(logits - logits.max())
        p /= p.sum()
        node.edges = [Edge(m, float(pi)) for m, pi in zip(legal, p)]
        node.pending = False

    @staticmethod
    def _terminal_value(board: chess.Board):
        if board.is_checkmate():
            return -1
        if board.is_stalemate() or board.is_insufficient_material() or board.halfmove_clock >= 100 or board.is_repetition(3):
            return 0
        return None

    def _simulate(self, root, board, counts, line):
        path = [root]
        root.n += 1
        root.w += 1
        node, plies = root, 0

        def restore():
            for _ in range(plies):
                board.pop()
                k = line.pop()
                counts[k] -= 1

        while True:
            if node.terminal is not None:
                restore()
                self._backup(path, node.terminal)
                return "terminal"
            if node.edges is None:
                if node.pending:
                    restore()
                    for nd in path:
                        nd.n -= 1
                        nd.w -= 1
                    return "collision"
                node.pending = True
                leaf = (node, path, encode_board(board, counts[line[-1]] - 1), legal_moves(board), board.turn)
                restore()
                return leaf
            edge = self._select(node)
            board.push(edge.move)
            plies += 1
            key = position_key(board)
            line.append(key)
            counts[key] = counts.get(key, 0) + 1
            if edge.child is None:
                edge.child = Node()
                edge.child.terminal = self._terminal_value(board)
            node = edge.child
            node.n += 1
            node.w += 1
            path.append(node)

    def choose(self, board: chess.Board) -> chess.Move:
        board = board.copy(stack=True)  # search mutates the board
        root_moves = legal_moves(board)
        if len(root_moves) == 1:
            return root_moves[0]

        # repetition bookkeeping: occurrences of every position along the game so far
        replay = board.root()
        line = [position_key(replay)]
        for mv in board.move_stack:
            replay.push(mv)
            line.append(position_key(replay))
        counts: dict[str, int] = {}
        for k in line:
            counts[k] = counts.get(k, 0) + 1

        policy, wdl = self._evaluate(encode_board(board, counts[line[-1]] - 1)[None])
        root = Node()
        self._expand(root, root_moves, policy[0])

        sims = 0
        while sims < self.sims:
            leaves = []
            while len(leaves) < BATCH and sims + len(leaves) < self.sims:
                r = self._simulate(root, board, counts, line)
                if r == "collision":
                    break
                if r == "terminal":
                    sims += 1
                else:
                    leaves.append(r)
            if leaves:
                policy, wdl = self._evaluate(np.stack([lf[2] for lf in leaves]))
                for i, (node, path, _, legal, white_to_move) in enumerate(leaves):
                    self._expand(node, legal, policy[i])
                    v_white = float(wdl[i, 0] - wdl[i, 2])
                    self._backup(path, v_white if white_to_move else -v_white)
                sims += len(leaves)

        # sample from visit counts ^ (1 / T): varied, human-like play instead of always the top move
        weights = [(e.child.n if e.child else 0) ** (1 / self.temperature) for e in root.edges]
        total = sum(weights)
        if total <= 0:
            return self.rng.choice(root_moves)
        r = self.rng.random() * total
        for e, w in zip(root.edges, weights):
            r -= w
            if r <= 0:
                return e.move
        return root.edges[-1].move
