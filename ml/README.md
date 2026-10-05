# ml: data, training and rating

Python pipeline behind the networks in `../public/models/`. Background and results: [../docs/training.md](../docs/training.md).

```sh
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt

./fetch_levels.sh                              # data/level{1,2,3}.npz from the Lichess open database
./train_levels.sh                              # checkpoints/level{N}.pt, then ../public/models/level{N}.onnx
.venv/bin/python rate.py --level 1             # Elo estimate against Stockfish
```

| File                            | Purpose                                                                          |
| ------------------------------- | -------------------------------------------------------------------------------- |
| `encode.py`                     | Board encoding. **Must match** `../src/engine/encoding.ts`                       |
| `model.py`                      | The network (square encoder, local mixer, transformer, policy and value heads)   |
| `fetch_lichess.py`              | Streams a Lichess dump and keeps human `(position, move, result)` samples        |
| `train.py`                      | Trains one level; `train_levels.sh` loops over the three                         |
| `export.py`                     | Exports a checkpoint to ONNX (fp16 weights) and checks it against PyTorch        |
| `bot.py`                        | Python port of the in-browser search (`../src/engine/mcts.ts`)                   |
| `rate.py`                       | Plays a bot against Stockfish and fits its Elo                                   |
| `export_encoding_fixture.py`    | Writes the golden vectors used by `../tests/encoding.test.ts`                    |

`data/`, `checkpoints/` and `.venv/` are git-ignored. `results/` holds the rating outputs.

Stockfish for `rate.py` is the npm package's WebAssembly build, run through Node (`npm install` at the repo root first);
pass `--engine /path/to/stockfish` to use a native binary instead.
