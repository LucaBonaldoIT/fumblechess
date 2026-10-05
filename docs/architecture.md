# Architecture

Everything runs in the browser. There is no backend.

```
           ┌────────────────────────────────────────────────────────────┐
           │                       src/main.ts                          │
           │  game state (chess.js) · board (Chessground) · panels      │
           └───────┬───────────────────────────────┬────────────────────┘
                   │ your move / AI's turn         │ every new position
                   ▼                               ▼
        ┌─────────────────────┐          ┌─────────────────────┐
        │  engine/mcts.ts     │          │ engine/stockfish.ts │
        │  PUCT tree search   │          │ Web Worker, UCI     │
        └─────────┬───────────┘          └──────────┬──────────┘
                  │ batches of encoded positions    │ centipawns
                  ▼                                 ▼
        ┌─────────────────────┐          ┌─────────────────────┐
        │ engine/network.ts   │          │   engine/eval.ts    │
        │ ONNX Runtime Web    │          │ score → bar + label │
        │ (worker, WASM)      │          └─────────────────────┘
        └─────────────────────┘
```

## Modules

| Path                        | Responsibility                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------- |
| `src/main.ts`               | App controller: game state, board events, new game / game over, history browsing, wiring |
| `src/engine/encoding.ts`    | Position → 64 × 22 feature tensor. **Must match `ml/encode.py`**                         |
| `src/engine/repetitions.ts` | Counts earlier occurrences of a position along the game and the search line              |
| `src/engine/mcts.ts`        | PUCT search guided by the network. Pure: the evaluator is injected, so it is unit-tested |
| `src/engine/network.ts`     | Loads the level's ONNX model, serialises and batches inference                           |
| `src/engine/levels.ts`      | The three levels: label, Elo band, search budget and temperature                         |
| `src/engine/stockfish.ts`   | Runs Stockfish 19 (lite, single thread) in a worker; newer requests supersede older ones |
| `src/engine/eval.ts`        | Pure mapping from a Stockfish score to the evaluation bar                                |
| `src/ui/thoughts.ts`        | The live "AI thoughts" panel and the arrows drawn on the board                           |
| `src/ui/dialogs.ts`         | The game-over card over the board                                                        |
| `src/ui/sound.ts`           | Sound effects synthesised with the Web Audio API                                         |
| `src/ui/theme.ts`           | Light/dark theme toggle (the initial theme is set by an inline script in `index.html`)   |
| `src/ui/clipboard.ts`       | Copy PGN and the toast                                                                   |
| `src/ui/about.ts`           | The About and Credits content                                                            |
| `ml/`                       | Python pipeline: data, training, export, rating (see [training.md](training.md))         |

## The network

Input: 64 tokens (one per square), 22 features each (piece planes, side to move, castling, en-passant square,
repetition flags, move counters).

`square encoder` (linear + learned square embedding) → `local mixer` (2 ConvMixer blocks on the 8 × 8 grid) →
`transformer` (8 pre-LN layers, 8 heads, d_model 256) → two heads:

- **policy**: query/key projections over squares give a 64 × 64 from→to score matrix (4096 logits). Promotions are
  always to a queen.
- **value**: mean-pooled tokens → 3 logits (win / draw / loss, White's view).

About 7.07M parameters, exported to ONNX with a dynamic batch axis (about 14 MB per level: weights are stored in fp16 and cast back to fp32 at load, so the compute and the speed are unchanged). The files are not stored in git: they live in `public/models/`, and Vite copies them into `dist/models/` at build time.

## The search

`search()` in `src/engine/mcts.ts` is AlphaZero-style MCTS without rollouts:

1. **Select** down the tree with `Q + c·P·√N / (1 + n)` (c = 1.5, untried moves start 0.2 below their parent).
2. **Expand and evaluate** a new position with one network call; the policy becomes the priors, the value
   (`P(win) − P(loss)` for the side to move) is backed up with alternating sign.
3. Leaves are collected 8 at a time using virtual loss and evaluated as one batch.
4. After the budget is spent the move is **sampled** from `visits^(1/T)`, so play stays varied.

The budget and temperature per level live in `src/engine/levels.ts`. They are deliberately small: the goal is
human-like play, not maximum strength. Repetition counts follow the line being searched, so a leaf deep in the tree
knows when it repeats a position.

## Design decisions

- **Imitation, not self-play.** The networks learn which move a human of a given rating would play, so mistakes are
  part of the style rather than injected noise.
- **Sampled moves.** Always taking the most-visited move would make the bot deterministic and unnaturally steady.
- **Pure, injectable engine code.** `mcts.ts`, `encoding.ts`, `repetitions.ts` and `eval.ts` do not import the
  browser-only modules, so they run under Vitest without a model.
- **Two engines, two jobs.** The bot (network + search) plays; Stockfish only judges the position for the bar.
