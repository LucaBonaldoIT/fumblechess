#!/usr/bin/env bash
# Regenerates dist/ from scratch: installs dependencies if missing, runs the checks, then a clean build.
# The models in public/models/ (git-ignored) are copied into dist/models/ by Vite.
#   ./build.sh            install if needed, typecheck, test, build
#   ./build.sh --fast     skip the typecheck and tests
set -euo pipefail
cd "$(dirname "$0")"

fast=0
[ "${1:-}" = "--fast" ] && fast=1

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies"
  npm ci
fi

if [ "$fast" -eq 0 ]; then
  echo "==> Typechecking"
  npm run --silent typecheck
  echo "==> Testing"
  npm run --silent test
fi

missing=()
for l in 1 2 3; do
  [ -f "public/models/level$l.onnx" ] || missing+=("public/models/level$l.onnx")
done
if [ "${#missing[@]}" -gt 0 ]; then
  echo "error: missing ${missing[*]} (not in git: restore them or train with ml/train_levels.sh)" >&2
  exit 1
fi

echo "==> Building"
rm -rf dist
npm run --silent build

echo "==> Done: $(du -sh dist | cut -f1) in dist/"
