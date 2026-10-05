# Third-party notices

FumbleChess is distributed under the **GNU General Public License v3.0 or later** (see [LICENSE](LICENSE)).
It bundles the GPL-licensed Chessground and Stockfish.js, which is why the whole project is GPL.

## Runtime dependencies (bundled in the app)

| Component                                                                                | Version | License                      | Used for                                   |
| ---------------------------------------------------------------------------------------- | ------- | ---------------------------- | ------------------------------------------ |
| [Chessground](https://github.com/lichess-org/chessground) (Lichess)                      | 10.1    | GPL-3.0-or-later             | The board                                  |
| cburnett piece set, by [Colin M.L. Burnett](https://en.wikipedia.org/wiki/User:Cburnett) | -       | GPL-2.0-or-later (see below) | Piece images, shipped inside Chessground   |
| [chess.js](https://github.com/jhlywa/chess.js) (Jeff Hlywa)                              | 1.4     | BSD-2-Clause                 | Rules, move generation, PGN                |
| [ONNX Runtime Web](https://onnxruntime.ai) (Microsoft)                                   | 1.30    | MIT                          | Running the neural networks in the browser |
| [Stockfish.js](https://github.com/nmrugg/stockfish.js) (Nathan Rugg, Chess.com)          | 19      | GPL-3.0                      | Evaluation bar (WebAssembly "lite" build)  |
| [Stockfish](https://stockfishchess.org)                                                  | 19      | GPL-3.0                      | The engine inside Stockfish.js             |

The cburnett pieces are listed by lichess as GPL-2.0-or-later (`COPYING.md` in
[lichess-org/lila](https://github.com/lichess-org/lila/blob/master/COPYING.md)); the same artwork is also available
under other licenses on Wikimedia Commons.

Sound effects are generated in the browser with the Web Audio API and are original to this project.

## Build and test tooling (not shipped)

[Vite](https://vite.dev) (MIT), [TypeScript](https://www.typescriptlang.org) (Apache-2.0),
[Vitest](https://vitest.dev) (MIT), [Prettier](https://prettier.io) (MIT).

## Training pipeline (`ml/`, not shipped)

[PyTorch](https://pytorch.org) (BSD-3-Clause), [NumPy](https://numpy.org) (BSD-3-Clause),
[python-chess](https://github.com/niklasf/python-chess) (GPL-3.0), [ONNX](https://onnx.ai) (Apache-2.0),
[ONNX Runtime](https://onnxruntime.ai) (MIT), [zstandard](https://github.com/indygreg/python-zstandard) (BSD-3-Clause),
[certifi](https://github.com/certifi/python-certifi) (MPL-2.0).

## Data

The models are trained on games from the [Lichess open database](https://database.lichess.org), which is released
under [CC0](https://creativecommons.org/publicdomain/zero/1.0/). The games themselves are not included in this
repository or in the site, only the trained weights, served with the site.

## Research

The design draws on the papers listed under _Credits_ in the app's About section (also in
[docs/training.md](docs/training.md)): Maia, Maia-2, "Amortized Planning with Large-Scale Transformers", "Attention
Is All You Need", ConvMixer, pre-LayerNorm, UCT, the MCTS survey, and AlphaZero. No code from those projects is used.

FumbleChess is not affiliated with Lichess, Chess.com or the Stockfish team.
