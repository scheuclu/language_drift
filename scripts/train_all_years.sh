#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

mkdir -p models/training_logs
RUN_STAMP="$(date +%Y%m%d_%H%M%S)"
COMBINED_LOG="models/training_logs/all_years_${RUN_STAMP}.log"

YEARS=(2014 2015 2016 2017 2018 2019 2020 2021 2022 2023 2024 2025)

{
    echo "Training all years (${YEARS[*]}), schedule defaults from training/train.py"
    echo "Run stamp: $RUN_STAMP"
    echo "Combined log: $COMBINED_LOG"
    echo "Per-year logs: models/training_logs/{year}_${RUN_STAMP}.log"
    echo "Started: $(date -Iseconds)"
} | tee "$COMBINED_LOG"

for year in "${YEARS[@]}"; do
    year_log="models/training_logs/${year}_${RUN_STAMP}.log"
    {
        echo
        echo "=== year $year started: $(date -Iseconds) ==="
    } | tee -a "$COMBINED_LOG"

    PYTHONUNBUFFERED=1 uv run python scripts/run_training.py --year "$year" --device cuda 2>&1 \
        | tee -a "$year_log" "$COMBINED_LOG"

    {
        echo "=== year $year finished: $(date -Iseconds) ==="
    } | tee -a "$COMBINED_LOG"
done

echo "Finished: $(date -Iseconds)" | tee -a "$COMBINED_LOG"
