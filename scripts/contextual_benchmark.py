"""Throughput probe for the contextual-drift pipeline. RUN THIS FIRST.

Pulls a few thousand real word-windows from one 2018 FineWeb snapshot (writes
nothing to disk), warms up the GPU, then sweeps the forward-pass batch size and
prints windows/sec, words/sec, subwords/sec and peak GPU memory, plus an
hours-per-year and total-wall-clock table for the full 12 B-token run. Use the
result to set CONTEXTUAL_BATCH_SIZE in config.py and confirm the ETA before
launching the real run.

    uv run python scripts/contextual_benchmark.py
    uv run python scripts/contextual_benchmark.py --snapshot CC-MAIN-2018-30 --windows 3000
"""
import argparse
import sys
import time
from pathlib import Path

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    CONTEXTUAL_MAX_LEN,
    CONTEXTUAL_TARGET_TOKENS_PER_YEAR,
    LANGUAGE_SCORE_THRESHOLD,
    YEARS,
)
from pipeline.contextual_model import ContextualEncoder
from pipeline.snapshot_registry import get_snapshots


def collect_windows(snapshot: str, n_windows: int, max_len: int) -> list[list[str]]:
    """Stream a snapshot and slice raw text into non-overlapping word windows.

    Mirrors the windowing the real pipeline uses (lowercase + whitespace split,
    fixed-length non-overlapping windows); kept inline so the probe has no
    dependency on the not-yet-built streaming module.
    """
    from datasets import load_dataset

    ds = load_dataset("HuggingFaceFW/fineweb", name=snapshot, streaming=True, split="train")
    ds = ds.filter(lambda x: x["language_score"] >= LANGUAGE_SCORE_THRESHOLD)

    windows: list[list[str]] = []
    for row in ds:
        words = row["text"].lower().split()
        for i in range(0, len(words), max_len):
            win = words[i : i + max_len]
            if win:
                windows.append(win)
                if len(windows) >= n_windows:
                    return windows
    return windows


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--device", default="cuda")
    ap.add_argument("--snapshot", default=None, help="default: a 2018 snapshot")
    ap.add_argument("--windows", type=int, default=2000)
    ap.add_argument("--batch-sizes", type=int, nargs="+", default=[128, 256, 512])
    a = ap.parse_args()

    snapshot = a.snapshot or get_snapshots(2018)[6]  # CC-MAIN-2018-30, mid-year
    print(f"Loading encoder on {a.device}...", flush=True)
    enc = ContextualEncoder(device=a.device)
    print(f"  model={enc.model_name} hidden_dim={enc.hidden_dim} max_subwords={enc.max_subwords}", flush=True)

    print(f"Pulling {a.windows} windows from {snapshot} (max_len={CONTEXTUAL_MAX_LEN})...", flush=True)
    t0 = time.time()
    windows = collect_windows(snapshot, a.windows, CONTEXTUAL_MAX_LEN)
    avg_words = sum(len(w) for w in windows) / max(1, len(windows))
    print(f"  got {len(windows)} windows, avg {avg_words:.1f} words/window ({time.time()-t0:.0f}s)", flush=True)

    # Warm up (kernels, autotune, allocator).
    print("Warming up...", flush=True)
    for _ in range(3):
        enc.encode_windows(windows[:a.batch_sizes[0]])
    torch.cuda.synchronize()

    print(f"\n{'batch':>6} {'win/s':>9} {'words/s':>11} {'subwd/s':>11} {'peakGB':>8}", flush=True)
    print("-" * 50, flush=True)

    results = []
    for bs in a.batch_sizes:
        torch.cuda.reset_peak_memory_stats()
        torch.cuda.synchronize()
        t0 = time.time()
        total_windows = 0
        total_subwords = 0
        for i in range(0, len(windows), bs):
            batch = windows[i : i + bs]
            _, attn_mask, _ = enc.encode_windows(batch)
            total_windows += len(batch)
            total_subwords += int(attn_mask.sum().item())
        torch.cuda.synchronize()
        dt = time.time() - t0
        win_s = total_windows / dt
        words_s = win_s * avg_words
        subwd_s = total_subwords / dt
        peak_gb = torch.cuda.max_memory_allocated() / 1e9
        results.append((bs, words_s))
        print(f"{bs:>6} {win_s:>9.1f} {words_s:>11.0f} {subwd_s:>11.0f} {peak_gb:>8.2f}", flush=True)

    # ETA table from the best (highest words/sec) config.
    best_bs, best_words_s = max(results, key=lambda r: r[1])
    hrs_year = CONTEXTUAL_TARGET_TOKENS_PER_YEAR / best_words_s / 3600
    print(
        f"\nBest: batch={best_bs} @ {best_words_s:,.0f} words/s",
        flush=True,
    )
    print(
        f"At {CONTEXTUAL_TARGET_TOKENS_PER_YEAR/1e9:.0f}B words/year: "
        f"{hrs_year:.1f} h/year, {hrs_year*len(YEARS):.1f} h total "
        f"({hrs_year*len(YEARS)/24:.1f} days) over {len(YEARS)} years.",
        flush=True,
    )
    print(
        "Note: words/s drives ETA (corpus target is in words); subwd/s reflects raw GPU load.",
        flush=True,
    )


if __name__ == "__main__":
    main()
