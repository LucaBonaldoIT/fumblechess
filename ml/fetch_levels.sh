#!/bin/bash
# Fetch the three Elo-band datasets (positions + previous moves + human moves + results) from the Lichess open
# database, about 1M positions per level. Each level streams four monthly dumps in parallel:
# data/level{N}-{month}.npz, all of which train_levels.sh passes to train.py.
set -e
cd "$(dirname "$0")"
mkdir -p data
MONTHS=${MONTHS:-"2024-01 2024-02 2024-03 2024-04"}
fetch() { # level, then fetch_lichess.py options
  level=$1
  shift
  for m in $MONTHS; do
    .venv/bin/python fetch_lichess.py --month "$m" "$@" --out "data/level$level-$m.npz" > "data/level$level-$m.log" 2>&1 &
  done
  wait
  tail -n 2 data/level"$level"-*.log
}
fetch 1 --min-elo 800 --max-elo 1200 --games 25000
fetch 2 --min-elo 1600 --max-elo 2400 --games 25000
# 2400+ vs 2400+ games are rare: sample more positions per game and stream more of each dump
fetch 3 --min-elo 2400 --max-elo 4000 --games 10000 --per-game 25 --max-mb 3000
echo FETCH DONE
