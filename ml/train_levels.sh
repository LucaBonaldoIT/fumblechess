#!/bin/bash
# Train one model per difficulty level on its Elo bucket, then export each to ../public/models/.
#   STEPS=3000 ./train_levels.sh
set -e
cd "$(dirname "$0")"
mkdir -p checkpoints ../public/models
STEPS=${STEPS:-1500}
for i in 1 2 3; do
  echo "=== level $i ==="
  .venv/bin/python train.py --data "data/level$i.npz" --steps "$STEPS" --out "checkpoints/level$i.pt"
  .venv/bin/python export.py --ckpt "checkpoints/level$i.pt" --out "../public/models/level$i.onnx"
done
echo ALL DONE
