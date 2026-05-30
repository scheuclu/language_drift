#!/usr/bin/env bash
# Full web-data regeneration at the new MIN_FREQ_ANYWHERE=500 floor.
# Stages must run in order (pack consumes the others' output). See CLAUDE.md.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "@@STAGE web_data $(date +%T)"
uv run python -u scripts/precompute_web_data.py

echo "@@STAGE vectors $(date +%T)"
uv run python -u scripts/precompute_vectors.py

echo "@@STAGE arithmetic $(date +%T)"
uv run python -u scripts/precompute_arithmetic.py

echo "@@STAGE tsne $(date +%T)"
uv run python -u scripts/precompute_tsne.py

echo "@@STAGE pack $(date +%T)"
uv run python -u scripts/pack_web_data.py

echo "@@DONE all stages $(date +%T)"
