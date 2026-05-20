# Three-Epoch Retrain Plan

## Motivation

The single-epoch run (currently in progress, `NUM_EPOCHS=1`) produced a noise floor
that is too high to support unsupervised drift discovery.

Concrete evidence from the 2013→2016 alignment with the first 4 trained years:

- Median cosine drift of semantically stable **anchor words** (`house`, `year`, `time`,
  `book`, `road`, `man`, `woman`, ...) is **0.214**.
- 90th-percentile anchor drift: **0.314**.
- A clean Word2Vec would have anchor drift in the **0.05–0.10** range. We are
  2–4× above that.

Consequence: hand-picked culturally-shifted candidates (`isis` 1.016, `snapchat`
0.940, `woke` 0.734) show clear signal because their true drift dwarfs the noise.
But data-driven top-N discovery is dominated by **training variance**, not
linguistic shift — the top dict-filtered drifters
(`eliminated`, `assured`, `presenting`, `touched`, `impression`, …) are noise.

## Goal

Lower the noise floor enough that unsupervised top-N drift discovery surfaces
genuine semantic shifts (e.g., new tech, slang, political reframings) rather
than training variance.

## Change

Single config edit, no architectural change:

`config.py`

```python
NUM_EPOCHS = 1   # → 3
```

Everything else stays: `EMBEDDING_DIM=300`, `WINDOW_SIZE=5`,
`NUM_NEGATIVE_SAMPLES=5`, `BATCH_SIZE=4096`, `LEARNING_RATE=0.025` (decays linearly
to 1e-4 across `total_batches = len(loader) * NUM_EPOCHS`, so the LR schedule
auto-stretches over the new budget — no further tuning needed).

The dataloader changes from the 1-epoch run stay:
`num_workers=16`, `prefetch_factor=4`, `persistent_workers=True`. These actually
matter more for 3 epochs because workers are re-used across epochs without
respawn (the original motivation for `persistent_workers`).

The Adam (dense) swap also stays — SparseAdam hit `cudaErrorIllegalAddress` on
this Blackwell + CUDA 13 setup.

## Cost

| Item | Value |
|---|---|
| Single-year wall time | ~3 h (3× the 1-epoch 60–75 min, GPU at 93% so no headroom) |
| Total wall time | 13 years × ~3 h ≈ **39 hours** |
| Compared to 1-epoch run | ~3× longer |
| Disk / RAM impact | none — same artifacts, same shape `(119466, 300)` |

## Expected benefit

Anchor drift should drop to roughly **0.07–0.10** (estimate, based on standard
SGNS multi-epoch literature on corpora of this scale). Top-N drift discovery
should then surface real linguistic shifts; subtler 0.3–0.5 drift signals
(slang, broadened meanings) should become detectable above the new noise floor.

## When to run

**Only after** the current 1-epoch run finishes and we evaluate the trajectory
consistency analysis (see below). The 1-epoch run is fine for verifying the
pipeline end-to-end, building the alignment + drift artifacts, and confirming
the obvious large drifters. The 3-epoch retrain is a refinement, not a do-over.

Specifically, kick this off if:
- The trajectory-consistent top-N still surfaces noise (training-variance words
  with no plausible semantic story).
- Anchor drift remains > ~0.15 after using the trajectory metric.
- A second-pass alignment + drift run on richer signal is desired before
  building the Stage 4 Streamlit dashboard.

Do NOT kick this off if:
- 1-epoch results + trajectory filtering already produce a satisfying top-N.
- GPU time is needed for other workloads.

## Validation after retrain

Same anchor-word check as before:

```python
# Should be ~0.05-0.10 for a clean run
median_anchor_drift_2013_to_2025 < 0.15
```

If anchor drift dropped below 0.10 → retrain succeeded.
If still above 0.15 → consider further increase to `NUM_EPOCHS=5` (the
Mikolov / Gensim default).

## Execution

```bash
# 1. Edit config.py to NUM_EPOCHS=3 (commit on a branch, not main, until validated)
git checkout -b retrain-3epoch
# edit config.py
git commit -am "Bump NUM_EPOCHS to 3 to reduce drift noise floor"

# 2. Move existing 1-epoch embeddings aside (don't overwrite — useful for comparison)
mv models/embeddings models/embeddings_1epoch

# 3. Run training
PYTHONUNBUFFERED=1 uv run python scripts/run_training.py --all --device cuda 2>&1 \
    | tee models/embeddings_3epoch_run.log

# 4. Compare anchor drift between the two runs
# (script TBD — load both, align separately, compute anchor median drift)
```

## Open questions

- Does the LR floor `max(lr, 1e-4)` in `train.py:85` need adjusting for 3
  epochs? Probably not — by step `total_batches` the schedule has decayed to
  1e-4 anyway, the floor just clamps the last few steps. Leave as-is.
- Should we also try the SparseAdam path again with a smaller batch size as a
  separate experiment? Not for this plan; that's a different intervention.
