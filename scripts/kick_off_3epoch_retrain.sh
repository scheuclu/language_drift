#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p models
LOG=models/embeddings_3epoch_run.log

echo "Starting 3-epoch retrain across all years"
echo "Log: $LOG"
echo "Started: $(date -Iseconds)"

PYTHONUNBUFFERED=1 uv run python scripts/run_training.py --all --device cuda 2>&1 \
    | tee "$LOG"

echo "Finished: $(date -Iseconds)"
