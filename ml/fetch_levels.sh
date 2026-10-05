#!/bin/bash
# Fetch the three Elo-band datasets (positions + human moves + results) from the Lichess open database.
set -e
cd "$(dirname "$0")"
mkdir -p data
.venv/bin/python fetch_lichess.py --min-elo 800  --max-elo 1200 --out data/level1.npz
.venv/bin/python fetch_lichess.py --min-elo 1600 --max-elo 2400 --out data/level2.npz
# 2800+ vs 2800+ games are rare: include bullet and stream more of the dump
.venv/bin/python fetch_lichess.py --min-elo 2800 --max-elo 4000 --speeds bullet,blitz,rapid,classical --max-mb 3000 --out data/level3.npz
echo FETCH DONE
