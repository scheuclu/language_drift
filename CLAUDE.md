# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trains per-year Word2Vec (SGNS) embeddings on FineWeb (Common Crawl) slices from 2013–2025, aligns them, and measures cosine drift to quantify how English usage shifts over time.

## Environment

Python 3.13 managed with `uv`. All commands run via `uv run ...`. There is no test suite, linter, or formatter configured — don't invent one.

```bash
uv sync                              # install deps
uv run python scripts/run_data_pipeline.py [--year Y | --all | --build-vocab | --encode]
uv run python scripts/run_training.py     [--year Y | --all] [--device cuda|cpu]
uv run python scripts/run_analysis.py     [--align | --drift | --all]
uv run streamlit run app.py          # FineWeb sample browser
```

## Pipeline architecture

The pipeline has hard ordering dependencies — each stage consumes artifacts the previous stage writes to `data/` or `models/` (both gitignored). Changing a stage's output format will break every downstream stage.

```
1A stream+tokenize (per year)  ─► data/tokens/{year}_tokenized.txt.gz
                                  data/tokens/{year}_freqs.json
                                  data/tokens/{year}_meta.json
                       │
                       ▼ (needs ALL years' freqs)
1B build-vocab                 ─► data/vocab/vocab.json   (id 0 = <UNK>)
                       │
                       ▼ (needs vocab + per-year tokenized text)
1C encode                      ─► data/tokens/{year}.npy  (int32, ~4 GB/year)
                       │
                       ▼ (loads npy fully into RAM)
Stage 2  train (GPU)           ─► models/embeddings/{year}.npy  (V × 300)
                       │
                       ▼
Stage 3a align (Procrustes)    ─► models/aligned/{year}.npy
Stage 3b drift                 ─► models/drift/*.parquet
```

Key cross-cutting facts:
- **All hyperparameters and paths live in `config.py`.** Don't hardcode them in modules — import. `YEARS = range(2013, 2026)`, `EMBEDDING_DIM=300`, `BATCH_SIZE=4096`, `WINDOW_SIZE=5`, `NUM_NEGATIVE_SAMPLES=5`, `MAX_VOCAB_SIZE=200_000`, `MIN_WORD_FREQ=50`, `MIN_YEARS_FOR_VOCAB=12`, `SEED=42`.
- **Vocab is shared across all years** — every year's embedding matrix has the same row order keyed by `vocab.json`. This is what makes alignment and drift comparison possible. Never re-build vocab per year or re-order rows.
- **A year is composed of multiple `CC-MAIN-YYYY-WW` snapshots** registered in `pipeline/snapshot_registry.py`. `TARGET_TOKENS_PER_YEAR` (1B) is split evenly across the year's snapshots, and each snapshot is filtered to `language_score >= LANGUAGE_SCORE_THRESHOLD` (0.65).
- **Stage 1A is resumable** via `data/tokens/{year}_checkpoint.json` (per-snapshot completion). If you change the tokenizer or filter, you must delete the checkpoint and `_tokenized.txt.gz` for that year — partial re-runs will mix incompatible token streams.
- **Stage 2 loads the full `{year}.npy` token array into RAM** (~4 GB/year, 128 GB host assumed). The `SkipGramDataset` is map-style (not iterable) — keep it that way; iterable datasets break shuffling and the multi-worker `DataLoader`.
- **SGNS implementation detail (`training/word2vec.py`):** sparse embeddings + `SparseAdam`. Two separate embedding tables (`center_embeddings`, `context_embeddings`); only `center_embeddings.weight` is saved as the final per-year embedding.
- **Subsampling and negative-sampling noise table are built inside `SkipGramDataset.__init__`** from `word_freqs`. The noise distribution is unigram^0.75 with `<UNK>` (id 0) zeroed out.
- **Determinism:** `set_seed(SEED)` is called at the top of `train_year` and sets `torch.backends.cudnn.deterministic = True`. Preserve this when editing the training loop.
- **Alignment is anchored to 2013** (the reference year). All other years are rotated into 2013's space via orthogonal Procrustes on L2-normalized embeddings (`analysis/alignment.py`).

## Things that look off but aren't

- `pipeline/vocab.py` writes `"<UNK>"` at id 0 and starts real words at id 1. The training code expects id 0 to be `<UNK>` and explicitly zeros it out in subsampling/noise distributions — don't shift the ids.
- `training/dataset.py` lines 23–25 contain a dead loop (`for word, wid in ...: pass`). It's a no-op left in place; the real population happens in the next loop.
- `scripts/*.py` add the repo root to `sys.path` before importing — this is how `from config import ...` works without an installed package. Keep that prelude when adding new entry-point scripts.

## When editing

- Change to `config.py` → assume it affects every stage; check whether existing artifacts on disk are still valid before re-running downstream stages.
- Change to `pipeline/tokenizer.py` or the filter in `stream_and_tokenize` → all `_tokenized.txt.gz` and downstream artifacts become stale; document this if you ship the change.
- Change to vocab construction → embeddings from previous runs are no longer row-comparable; alignment and drift artifacts must be regenerated.
- `agents.md` and `README.md` describe the same pipeline at different audiences; keep them roughly in sync when behavior changes.
