# Changelog

All notable changes are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Changed

- The network also sees the last 6 moves (from and to squares), 34 input features per square instead of 22.
- Retrained all three levels on about 1M positions each (four monthly Lichess dumps, previously 80,000) for about 30
  minutes each: held-out agreement with the human move is now 44.9% / 42.4% / 43.2% (was 37.5% / 37.7% / 34.0%).
- Rated against Stockfish (UCI_Elo scale): Beginner 840 ± 196 (was 698 ± 220), Club 1074 ± 138, Master 1312 ± 121.
- Master now imitates 2400+ players (was 2800+, too rare to train on), without bullet games.

## [1.0.0]

### Added

- Playable chess in the browser against an AI trained to imitate human play, blunders included.
- Three difficulty levels, each a transformer (about 7M parameters) trained on Lichess games from one Elo band
  (800-1200, 1600-2400, 2800+). The level is locked while a game is in progress.
- Small neural Monte-Carlo tree search (PUCT, policy and value from the network, batched with virtual loss);
  the move is sampled from visit counts so play stays varied.
- Live "AI thoughts" panel: candidate moves with their share of the search, expected score and arrows on the board.
- Stockfish evaluation bar (WebAssembly), also while browsing the move history.
- Board encoding with en passant, repetition history and move counters, identical in Python and TypeScript
  (checked by a golden-vector test).
- Choose your side (White, Black or Random), clickable move history with keyboard navigation, game-over card over
  the board, Copy PGN, captured pieces and material balance, light and dark themes, sound effects
  (Web Audio), responsive layout modelled on mobile chess apps.
- Educational About section explaining the network, the training and the search, with credits.
- `ml/`: pipeline to fetch Lichess data, train and export the models, and `rate.py` to estimate a bot's Elo against
  Stockfish (Beginner: about 698 ± 220 on Stockfish's UCI_Elo scale).
- SEO: canonical URL, Open Graph and Twitter cards with a generated 1200x630 social image, JSON-LD
  (`WebSite`, `WebApplication`, `Person`), `robots.txt`, `sitemap.xml`, web manifest, app icons and the About text
  in the static HTML. Live at https://fumblechess.lucabonaldo.dev.
- Models exported with fp16 weights (about 14 MB per level instead of 28 MB), cast back to fp32 at load. They are kept
  out of git in `public/models/` and copied into `dist/models/` by the build; `./build.sh` fails if one is missing.
- Vitest suite (encoder parity with Python, search, eval bar, repetitions) and GitHub Actions CI.
