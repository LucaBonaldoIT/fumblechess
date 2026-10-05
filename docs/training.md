# Training and rating

The models in `public/models/` come from the pipeline in [`ml/`](../ml). You only need it to retrain or rate them.

## 1. Data

`ml/fetch_lichess.py` streams a monthly dump from the [Lichess open database](https://database.lichess.org)
(CC0), stops once it has enough games, and keeps `(position, human move, game result)` samples.

| Level | Elo band (both players) | Speeds               | Games | Positions |
| ----- | ----------------------- | -------------------- | ----- | --------- |
| 1     | 800-1200                | blitz, rapid, class. | 8,000 | ~80,000   |
| 2     | 1600-2400               | blitz, rapid, class. | 8,000 | ~80,000   |
| 3     | 2800+                   | + bullet             | 8,000 | ~80,000   |

Only January 2024 (the start of the file) was used. Games must end normally and last at least 10 plies; 10 random
positions are sampled per game. Master games are so rare that finding 8,000 meant streaming about 2.5 GB.

```sh
cd ml
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
./fetch_levels.sh        # writes data/level{1,2,3}.npz
```

## 2. Model and training

Architecture: see [architecture.md](architecture.md#the-network). Training (`ml/train.py`):

- policy target: the move the human played, with illegal moves masked out (cross-entropy)
- value target: the game result as win/draw/loss (cross-entropy, weight 0.5)
- AdamW, learning rate 4e-4 with a one-cycle schedule, batch 128, 1,500 steps (about 4 minutes on an Apple GPU),
  5% of positions held out

Held-out top-1 agreement with the human move after training: **37.5%** (level 1), **37.7%** (level 2),
**34.0%** (level 3). The models are small and briefly trained, so the value head in particular is rough.

```sh
./train_levels.sh        # trains, then exports ../public/models/level{1,2,3}.onnx
```

The export stores the weights in **fp16** (half the download, about 14 MB per level) and casts them back to fp32 when the
model loads: onnxruntime-web's WebAssembly backend has no fp16 kernels, so compute stays fp32. On 3,000 positions per
level the fp16 weights picked the same move as the fp32 model 99.97-100% of the time (largest policy-logit change below
0.01, value change below 0.005). Pass `--fp32` to `export.py` to keep full-precision weights.

## Shipping the models

The `.onnx` files are not committed. They stay in `public/models/`, where the export writes them: Vite serves them in
development and copies them into `dist/models/` at build time, so the site serves them itself. `./build.sh` refuses to
build if one is missing.

## 3. Keeping Python and TypeScript in sync

The network is trained on `ml/encode.py` and runs on `src/engine/encoding.ts`. `ml/export_encoding_fixture.py`
writes reference vectors for a set of tricky positions (en passant, repetitions, castling, promotion) to
`tests/fixtures/encoding.json`, and `tests/encoding.test.ts` checks the TypeScript encoder against them. After any
change to the encoding, regenerate the fixture and retrain.

## 4. Rating a bot against Stockfish

`ml/rate.py` plays a level against Stockfish and fits an Elo with maximum likelihood. `ml/bot.py` is a Python port of
the in-browser search, so the rated bot is the same bot.

```sh
.venv/bin/python rate.py --level 1
```

How it works:

- **Anchors:** Stockfish with `UCI_LimitStrength` at 1320, 1500 and 1700 (its minimum is 1320). Their nominal ratings are
  treated as known.
- **Weak opponents:** the 1320 Stockfish with a probability of playing a random move (30% and 60%). Their ratings are
  estimated from games against the 1320 anchor and against the bot, which lets the fit reach below 1320.
- **Games:** colour-swapped, each shared random opening (2 plies) played from both sides. Games unfinished after 200
  plies are adjudicated by a full-strength Stockfish (3 pawns or more counts as a win).
- **Fit:** all games go into one Elo likelihood (draw = half a point) with the anchors fixed and a weak prior so
  all-win or all-loss pairings stay finite.

| Level        | Rating (Stockfish UCI_Elo scale) | Games per pairing |
| ------------ | -------------------------------- | ----------------- |
| 1 (Beginner) | **698 ± 220** (95%)              | 20                |
| 2 (Club)     | not rated yet                    |                   |
| 3 (Master)   | not rated yet                    |                   |

Raw results: [`ml/results/level1.json`](../ml/results/level1.json).

**Caveats.** This is Stockfish's UCI_Elo scale, **not** the Lichess scale of the training data, so it is not comparable
with the 800-1200 label. It is measured with a short fixed move time on the WebAssembly "lite" build, the random-move
opponents' ratings are chained estimates, and the interval only covers game-sampling noise. Treat it as a rough,
relative number.

## References

- McIlroy-Young, Sen, Kleinberg, Anderson. [Aligning Superhuman AI with Human Behavior: Chess as a Model System](https://arxiv.org/abs/2006.01855). KDD 2020 (Maia).
- Tang, Jiao, McIlroy-Young et al. [Maia-2: A Unified Model for Human-AI Alignment in Chess](https://arxiv.org/abs/2409.20553). NeurIPS 2024.
- Ruoss et al. [Amortized Planning with Large-Scale Transformers: A Case Study on Chess](https://arxiv.org/abs/2402.04494). NeurIPS 2024.
- Vaswani et al. [Attention Is All You Need](https://arxiv.org/abs/1706.03762). NeurIPS 2017.
- Xiong et al. [On Layer Normalization in the Transformer Architecture](https://arxiv.org/abs/2002.04745). ICML 2020.
- Trockman and Kolter. [Patches Are All You Need?](https://arxiv.org/abs/2201.09792) 2022 (ConvMixer).
- Kocsis and Szepesvári. Bandit Based Monte-Carlo Planning. ECML 2006 (UCT).
- Browne et al. [A Survey of Monte Carlo Tree Search Methods](https://doi.org/10.1109/TCIAIG.2012.2186810). IEEE TCIAIG 2012.
- Silver et al. [A general reinforcement learning algorithm that masters chess, shogi, and Go through self-play](https://www.science.org/doi/10.1126/science.aar6404). Science 2018.
