# Contributing

Thanks for helping! Useful contributions include bug fixes, UI polish, tests, and improvements to
the training pipeline in `ml/`.

## Setup

```sh
git clone https://github.com/LucaBonaldoIT/fumblechess.git
cd fumblechess
npm install
npm run dev        # http://localhost:5173
```

Node 20+ is required (`.nvmrc` pins 22). The trained models (`level{1,2,3}.onnx`, about 43 MB in total) are not in
the repository: the app needs them in `public/models/`, and you can train them yourself with Python, as you would to
retrain or rate them: see [ml/README.md](ml/README.md).

## Before opening a pull request

```sh
npm run typecheck     # TypeScript
npm test              # unit tests (encoder parity with Python, search, eval bar, repetitions)
npm run format        # Prettier
npm run build         # production build must succeed
```

### Changing the board encoding

The network is trained on the Python encoding (`ml/encode.py`) and runs on the TypeScript one
(`src/engine/encoding.ts`), so they must match exactly. If you change either:

1. Change both.
2. Regenerate the reference vectors: `cd ml && .venv/bin/python export_encoding_fixture.py`.
3. `npm test` must pass. Existing models are then incompatible: re-run `ml/fetch_levels.sh` and
   `ml/train_levels.sh`.

### Social image and icons

`npm run brand` re-renders `public/og-image.png` (from `scripts/brand/og.html`) and the app icons with headless
Chrome (set `CHROME_PATH` if it is not in a standard location). Refresh `scripts/brand/app-screenshot.png` first if
the UI changed.

### Changing search settings

`src/engine/levels.ts` (the app) and `ml/bot.py` (the offline copy used by `ml/rate.py`) must stay in
sync.

## Commits and pull requests

- Small, focused PRs. Describe _what_ and _why_.
- Use present-tense, imperative commit messages ("Add repetition flags to the encoding").
- UI changes: include a screenshot (desktop and a ~390 px mobile width).

## Reporting bugs

Open an issue with steps to reproduce, the browser and device, and the PGN if it is about a game
(the **Copy PGN** button gives you one).
