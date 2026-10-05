"""Estimate a bot's Elo by playing it against Stockfish.

Method
  * Anchors: Stockfish with UCI_LimitStrength at fixed UCI_Elo values. Their nominal ratings are treated as known.
    Stockfish's lowest setting is 1320, so for weaker bots we add "weak" opponents: the same 1320 Stockfish that plays
    a random legal move with probability eps. Their ratings are NOT known, they are estimated jointly from their games
    against the 1320 anchor and against the bot.
  * Games that reach --max-plies are adjudicated by a full-strength Stockfish: a decisive evaluation (>= 3 pawns) is a
    win for that side, anything else a draw. (The bot has no deep search, so it often cannot mate a weak opponent.)
  * Every pair plays colour-swapped games from the same short random opening (fewer lucky openings).
  * Ratings come from a maximum-likelihood fit of the Elo model (draw = half a point) over all games, with the anchors
    held fixed and a weak prior (N(1000, 500)) so all-win / all-loss pairings stay finite.

Caveats: the result is on Stockfish's UCI_Elo scale (calibrated by its authors against engine ratings at long time
controls), NOT on the Lichess scale the training buckets come from, and it is measured with a short fixed move time on
the WASM "lite" build. Treat it as a relative, rough number. Confidence intervals only cover game-sampling noise.

Usage:  .venv/bin/python rate.py --level 1
"""
import argparse
import collections
import json
import random
import time
from pathlib import Path

import chess
import chess.engine
import chess.pgn
import numpy as np

from bot import Bot

ROOT = Path(__file__).resolve().parent
DEFAULT_ENGINE = ["node", str(ROOT.parent / "node_modules/stockfish/bin/stockfish-19-lite-single.js")]
K = np.log(10) / 400


# ---------------------------------------------------------------- players
class BotPlayer:
    def __init__(self, level, seed):
        self.name = f"bot-level{level}"
        self.bot = Bot(level, seed=seed)

    def move(self, board):
        return self.bot.choose(board)


class StockfishPlayer:
    """Stockfish limited to `elo`; with probability `eps` it plays a random legal move instead."""

    def __init__(self, engine, elo, eps, movetime, seed):
        self.engine, self.elo, self.eps, self.movetime = engine, elo, eps, movetime
        self.rng = random.Random(seed)
        self.name = f"sf{elo}" if eps == 0 else f"sf{elo}-rand{int(eps * 100)}"

    def move(self, board):
        if self.eps and self.rng.random() < self.eps:
            return self.rng.choice(list(board.legal_moves))
        self.engine.configure({"UCI_LimitStrength": True, "UCI_Elo": self.elo})
        return self.engine.play(board, chess.engine.Limit(time=self.movetime)).move


# ---------------------------------------------------------------- games
def play_game(white, black, opening_seed, random_plies, max_plies, judge):
    board = chess.Board()
    rng = random.Random(opening_seed)
    for _ in range(random_plies):
        if board.is_game_over():
            break
        board.push(rng.choice(list(board.legal_moves)))
    while not board.is_game_over(claim_draw=True) and len(board.move_stack) < max_plies:
        mover = white if board.turn == chess.WHITE else black
        board.push(mover.move(board))
    adjudicated = not board.is_game_over(claim_draw=True)
    result = judge(board) if adjudicated else board.result(claim_draw=True)
    game = chess.pgn.Game.from_board(board)
    game.headers.update({"White": white.name, "Black": black.name, "Result": result, "Event": "rating"})
    if adjudicated:
        game.headers["Termination"] = f"adjudicated by Stockfish after {max_plies} plies"
    return {"1-0": 1.0, "0-1": 0.0, "1/2-1/2": 0.5}[result], game


def play_match(a, b, games, args, log):
    """`games` games between a and b, alternating colours, each opening used twice. Returns scores for a."""
    scores = []
    for g in range(games):
        a_white = g % 2 == 0
        white, black = (a, b) if a_white else (b, a)
        s_white, game = play_game(white, black, opening_seed=args.seed * 1000 + g // 2, random_plies=args.random_plies, max_plies=args.max_plies, judge=args.judge)
        scores.append(s_white if a_white else 1 - s_white)
        log.append(game)
    return scores


# ---------------------------------------------------------------- rating fit
def fit_elo(results, fixed, prior_mean=1000.0, prior_sd=500.0):
    """results: list of (a, b, score_of_a). fixed: {name: rating}. Returns ({name: rating}, {name: sd})."""
    names = sorted({n for a, b, _ in results for n in (a, b)})
    free = [n for n in names if n not in fixed]
    idx = {n: i for i, n in enumerate(free)}
    r = {n: fixed.get(n, prior_mean) for n in names}
    pairs = collections.defaultdict(lambda: [0, 0.0])  # (a,b) -> [games, points of a]
    for a, b, s in results:
        pairs[(a, b)][0] += 1
        pairs[(a, b)][1] += s
    H = np.zeros((len(free), len(free)))
    for _ in range(200):
        g = np.array([-(r[n] - prior_mean) / prior_sd**2 for n in free])
        H = -np.eye(len(free)) / prior_sd**2
        for (a, b), (n, s) in pairs.items():
            e = 1 / (1 + 10 ** ((r[b] - r[a]) / 400))
            ga = K * (s - n * e)
            w = K * K * n * e * (1 - e)
            for x, sign in ((a, 1), (b, -1)):
                if x in idx:
                    g[idx[x]] += sign * ga
                    H[idx[x], idx[x]] -= w
            if a in idx and b in idx:
                H[idx[a], idx[b]] += w
                H[idx[b], idx[a]] += w
        step = np.clip(-np.linalg.solve(H, g), -150, 150)
        for n in free:
            r[n] += step[idx[n]]
        if np.abs(step).max() < 1e-3:
            break
    cov = np.linalg.inv(-H)
    sd = {n: float(np.sqrt(cov[idx[n], idx[n]])) for n in free}
    return r, sd


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--level", type=int, default=1, choices=(1, 2, 3))
    ap.add_argument("--games", type=int, default=20, help="games per pairing (even, colours alternate)")
    ap.add_argument("--anchors", default="1320,1500,1700", help="Stockfish UCI_Elo anchors (min 1320)")
    ap.add_argument("--weak", default="0.3,0.6", help="random-move probabilities for the weak opponents ('' to disable)")
    ap.add_argument("--movetime", type=float, default=0.1, help="Stockfish seconds per move")
    ap.add_argument("--random-plies", type=int, default=2, help="random opening plies shared by both colours")
    ap.add_argument("--max-plies", type=int, default=200, help="adjudicate with Stockfish after this many plies")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--engine", nargs="+", default=DEFAULT_ENGINE, help="UCI engine command")
    ap.add_argument("--out", default="results")
    args = ap.parse_args()
    args.games += args.games % 2

    anchors = [int(x) for x in args.anchors.split(",") if x]
    weak = [float(x) for x in args.weak.split(",") if x]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    engine = chess.engine.SimpleEngine.popen_uci(args.engine)
    try:
        def judge(board):
            engine.configure({"UCI_LimitStrength": False})  # StockfishPlayer re-enables the limit before its next move
            score = engine.analyse(board, chess.engine.Limit(time=0.3))["score"].white()
            cp = score.score(mate_score=10000)
            return "1-0" if cp >= 300 else "0-1" if cp <= -300 else "1/2-1/2"

        args.judge = judge
        bot = BotPlayer(args.level, args.seed)
        sf = {e: StockfishPlayer(engine, e, 0.0, args.movetime, args.seed) for e in anchors}
        base = anchors[0]
        weak_players = [StockfishPlayer(engine, base, eps, args.movetime, args.seed + i + 1) for i, eps in enumerate(weak)]

        pairings = [(bot, sf[e]) for e in anchors] + [(bot, w) for w in weak_players] + [(w, sf[base]) for w in weak_players]
        results, games, summary = [], [], []
        t0 = time.time()
        for a, b in pairings:
            scores = play_match(a, b, args.games, args, games)
            results += [(a.name, b.name, s) for s in scores]
            wins, draws = scores.count(1.0), scores.count(0.5)
            summary.append((a.name, b.name, wins, draws, len(scores) - wins - draws))
            print(f"{a.name:>14} vs {b.name:<14} +{wins} ={draws} -{len(scores) - wins - draws}   score {sum(scores) / len(scores):.0%}   [{time.time() - t0:.0f}s]", flush=True)
    finally:
        engine.quit()

    fixed = {f"sf{e}": float(e) for e in anchors}
    ratings, sd = fit_elo(results, fixed)

    print("\nRatings (Stockfish UCI_Elo scale, ±1.96 sd game-sampling error):")
    for n in sorted(ratings, key=lambda k: -ratings[k]):
        tag = "anchor" if n in fixed else f"±{1.96 * sd[n]:.0f}"
        print(f"  {n:<16} {ratings[n]:6.0f}  {tag}")
    me = f"bot-level{args.level}"
    print(f"\n{me}: {ratings[me]:.0f} ± {1.96 * sd[me]:.0f}")

    (out / f"level{args.level}.json").write_text(
        json.dumps(
            {
                "bot": me,
                "rating": ratings[me],
                "ci95": 1.96 * sd[me],
                "ratings": ratings,
                "pairings": [dict(a=a, b=b, wins=w, draws=d, losses=l) for a, b, w, d, l in summary],
                "settings": {k: v for k, v in vars(args).items() if k not in ("engine", "judge")},
            },
            indent=2,
        )
    )
    with open(out / f"level{args.level}_games.pgn", "w") as f:
        for g in games:
            print(g, file=f, end="\n\n")
    print(f"saved {out}/level{args.level}.json and _games.pgn")


if __name__ == "__main__":
    main()
