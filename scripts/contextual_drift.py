"""Contextual word-drift pipeline entry point.

Stages (mirrors the TWEC entry point's structure):
  stream    re-stream FineWeb per year -> accumulate contextual centroids ->
            finalize that year (writes models/contextual/{year}*.npy). Resumable.
  finalize  re-derive {year}*.npy from existing partial accumulators (cheap way
            to re-tune centering / PCA-removal without re-streaming).
  all       stream (finalizing each year on completion) + drift.
  drift     compute cosine drift vs the anchor year from finalized centroids,
            writing drift_vs_{anchor}.parquet + drift_summary.parquet.

    uv run python scripts/contextual_drift.py --smoke              # ~2 min code-path + resume check
    uv run python scripts/contextual_drift.py --stage stream       # full run (background, ~1.7 days)
    uv run python scripts/contextual_drift.py --stage finalize     # re-finalize from partials
    uv run python scripts/contextual_drift.py --stage drift        # (re)compute drift artifacts
"""
import argparse
import hashlib
import json
import sys
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    ANCHOR_YEAR,
    CONTEXTUAL_DIR,
    CONTEXTUAL_LAYER,
    CONTEXTUAL_MIN_COUNT,
    CONTEXTUAL_MODEL,
    CONTEXTUAL_POOLING,
    CONTEXTUAL_MAX_LEN,
    CONTEXTUAL_STATE_DIR,
    CONTEXTUAL_TARGET_TOKENS_PER_YEAR,
    CONTEXTUAL_USE_STOPWORDS,
    MIN_WORD_LENGTH,
    VOCAB_DIR,
    YEARS,
)
from analysis.contextual_drift import run_drift
from pipeline.contextual_aggregate import ContextualAccumulator
from pipeline.contextual_finalize import finalize_year, load_partial
from pipeline.contextual_model import ContextualEncoder
from pipeline.contextual_stream import run_year
from pipeline.snapshot_registry import get_snapshots
from pipeline.vocab import load_vocab


def compute_config_hash(model_name: str) -> str:
    """Hash the knobs that affect accumulation; resume refuses on mismatch."""
    payload = json.dumps(
        {
            "model": model_name,
            "layer": CONTEXTUAL_LAYER,
            "pooling": CONTEXTUAL_POOLING,
            "max_len": CONTEXTUAL_MAX_LEN,
            "min_word_length": MIN_WORD_LENGTH,
            "use_stopwords": CONTEXTUAL_USE_STOPWORDS,
        },
        sort_keys=True,
    )
    return hashlib.sha256(payload.encode()).hexdigest()[:16]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--model", default=CONTEXTUAL_MODEL)
    ap.add_argument("--years", type=int, nargs="+", default=None)
    ap.add_argument("--stage", choices=["stream", "finalize", "drift", "all"], default="all")
    ap.add_argument("--target-tokens", type=int, default=None)
    a = ap.parse_args()

    if a.smoke:
        years = a.years or [2014, 2018]
        out_dir = Path("models/contextual_smoke")
        state_dir = Path("data/contextual_state_smoke")
        target_tokens = a.target_tokens or 600_000  # ~300k words/snapshot, fast code-path check

        def snapshots_for(y: int) -> list[str]:
            return get_snapshots(y)[:2]  # 2 snapshots/year (exercises checkpoint/resume)
    else:
        years = a.years or list(YEARS)
        out_dir = CONTEXTUAL_DIR
        state_dir = CONTEXTUAL_STATE_DIR
        target_tokens = a.target_tokens or CONTEXTUAL_TARGET_TOKENS_PER_YEAR

        def snapshots_for(y: int) -> list[str] | None:
            return None  # all registered snapshots

    out_dir.mkdir(parents=True, exist_ok=True)
    state_dir.mkdir(parents=True, exist_ok=True)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    config_hash = compute_config_hash(a.model)
    print(
        f"contextual-drift | model={a.model} stage={a.stage} years={years} "
        f"vocab={len(vocab):,} target={target_tokens:,}/yr -> {out_dir}",
        flush=True,
    )

    encoder = None
    if a.stage in ("stream", "all"):
        encoder = ContextualEncoder(model_name=a.model, device=a.device)
        print(f"  encoder hidden_dim={encoder.hidden_dim}", flush=True)

    for year in years if a.stage != "drift" else []:
        final_path = out_dir / f"{year}.npy"

        if a.stage == "finalize":
            s, sq, c = load_partial(state_dir, year)
            finalize_year(year, s, sq, c, out_dir)
            continue

        # stream / all
        if final_path.exists():
            print(f"[year {year}] already finalized ({final_path}), skip", flush=True)
            continue

        acc = ContextualAccumulator(vocab, encoder.hidden_dim, device=a.device)
        total_words, total_windows = run_year(
            year,
            encoder,
            acc,
            state_dir=state_dir,
            config_hash=config_hash,
            target_tokens=target_tokens,
            snapshots=snapshots_for(year),
        )
        s, sq, c = acc.to_numpy()
        finalize_year(year, s, sq, c, out_dir)

        # Year complete: drop the resume checkpoint, keep the partial npz so
        # `--stage finalize` can re-tune centering/PCA without re-streaming.
        ckpt = state_dir / f"{year}_checkpoint.json"
        if ckpt.exists():
            ckpt.unlink()
        print(f"[year {year}] done: {total_words:,} words, {total_windows:,} windows", flush=True)

        del acc
        if a.device == "cuda":
            torch.cuda.empty_cache()

    if a.stage in ("drift", "all"):
        run_drift(out_dir, vocab, base_year=ANCHOR_YEAR, min_count=CONTEXTUAL_MIN_COUNT, years=years)

    print("DONE", flush=True)


if __name__ == "__main__":
    main()
