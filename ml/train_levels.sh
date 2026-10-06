#!/bin/bash
# Train one model per difficulty level on its Elo bucket, then export each to ../public/models/.
#   STEPS=5000 ./train_levels.sh        (default 3500 steps of 512 positions, about 30 minutes per level on an M4 Pro)
set -e
cd "$(dirname "$0")"
mkdir -p checkpoints ../public/models
STEPS=${STEPS:-3500}
for i in ${LEVELS:-1 2 3}; do
  echo "=== level $i ==="
  .venv/bin/python train.py --data data/level"$i"-*.npz --steps "$STEPS" --batch 512 --lr 6e-4 --out "checkpoints/level$i.pt"
  .venv/bin/python export.py --ckpt "checkpoints/level$i.pt" --out "../public/models/level$i.onnx"
done
echo ALL DONE
