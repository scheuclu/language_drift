# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Trains per-year Word2Vec (SGNS) embeddings on FineWeb (Common Crawl) slices from 2014–2025 into a single shared coordinate space (TWEC/compass), and measures cosine drift to quantify how English usage shifts over time. The interactive site lives in `web/` (Next.js) and reads its data from Vercel Blob.

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
Stage 2  train — TWEC/compass  ─► models/embeddings_twec_full/{year}.npy (V × 300)
  (scripts/twec_full.py)          shared frozen-context frame, no alignment;
                       │          copied into models/aligned/ for the export
                       ▼
Stage 3  precompute + pack     ─► web/public/data/{manifest.json, vecs.bin,
  (precompute_*.py +               neighbors.bin + index, arith.bin, space*}
   pack_web_data.py)        │     (gitignored — a local build intermediate)
                       ▼ (uploaded, NOT committed to git)
Stage 4  Vercel Blob           ─► data/v4/* — the client range-fetches one
                                  word's slice at runtime
```

Key cross-cutting facts:
- **All hyperparameters and paths live in `config.py`.** Don't hardcode them in modules — import. `YEARS = range(2014, 2026)`, `ANCHOR_YEAR=2018`, `EMBEDDING_DIM=300`, `BATCH_SIZE=32768`, `WINDOW_SIZE=10`, `NUM_NEGATIVE_SAMPLES=15`, `NUM_EPOCHS=3`, `LEARNING_RATE=0.0075`, `MAX_VOCAB_SIZE=200_000`, `MIN_WORD_FREQ=50`, `MIN_YEARS_FOR_VOCAB=11`, `SEED=42`.
- **Vocab is shared across all years** — every year's embedding matrix has the same row order keyed by `vocab.json`. This is what makes alignment and drift comparison possible. Never re-build vocab per year or re-order rows.
- **A year is composed of multiple `CC-MAIN-YYYY-WW` snapshots** registered in `pipeline/snapshot_registry.py`. `TARGET_TOKENS_PER_YEAR` (1B) is split evenly across the year's snapshots, and each snapshot is filtered to `language_score >= LANGUAGE_SCORE_THRESHOLD` (0.65).
- **Stage 1A is resumable** via `data/tokens/{year}_checkpoint.json` (per-snapshot completion). If you change the tokenizer or filter, you must delete the checkpoint and `_tokenized.txt.gz` for that year — partial re-runs will mix incompatible token streams.
- **Stage 2 loads the full `{year}.npy` token array into RAM** (~4 GB/year, 128 GB host assumed); `GPUSkipGramSampler` then moves the subsampled token stream onto the GPU and draws batches directly in the train loop via `sample_batch` (no `DataLoader`). The map-style `SkipGramDataset` in `training/dataset.py` is legacy/unused.
- **SGNS implementation detail (`training/word2vec.py`):** two dense embedding tables (`center_embeddings`, `context_embeddings`) trained with dense `torch.optim.Adam`; only `center_embeddings.weight` is saved as the final per-year embedding. In TWEC, `context_embeddings` is frozen to the shared compass and only `center_embeddings` is trained per year.
- **Subsampling and the negative-sampling noise table are built inside `GPUSkipGramSampler.__init__`** (`training/dataset.py`) from `word_freqs`. The noise distribution is unigram^0.75 with `<UNK>` (id 0) zeroed out.
- **Determinism:** `set_seed(SEED)` is called at the top of `train_year` and sets `torch.backends.cudnn.deterministic = True`. Preserve this when editing the training loop.
- **Shared space comes from TWEC/compass, not Procrustes.** `scripts/twec_full.py` trains one shared context "compass" on all years combined, freezes it, then trains each year's word vectors against that frozen compass — so every year lands in one coordinate system *directly*, with no post-hoc alignment. Its output (`models/embeddings_twec_full/`) is copied into `models/aligned/` for the web export. `ANCHOR_YEAR` (2018) is still the drift *reference* (drift = cosine distance from 2018, summed over the other 11 years); 2013 is excluded from `YEARS`. The legacy path — independent per-year training (`run_training.py`) + orthogonal Procrustes (`run_analysis.py --align`, `analysis/alignment.py`) — remains in the repo but is **superseded** by TWEC. TWEC validated ~30% lower drift noise floor (0.14→0.10) and SNR 4.4→5.3× vs Procrustes, with equal-or-better intrinsic benchmarks.
- **Web data is hosted on Vercel Blob, NOT git.** `precompute_*.py` emit per-word shards under `web/public/data/` (gitignored build intermediate); `scripts/pack_web_data.py` packs `vecs/` → `vecs.bin` (fixed 14400-byte stride in `space_index` row order) and `w/` → `neighbors.bin` + offset index. These plus `manifest.json`/`arith.bin`/`space.*` are uploaded to the **`language-drift-data` Blob store** under `data/vN/`; the client range-fetches one word's slice (`web/lib/data-source.ts`). To update after a retrain: re-pack, upload to a new `data/vN`, bump `NEXT_PUBLIC_DATA_BASE` / the `data-source.ts` default. Never commit `web/public/data`.

## Nav-hidden web routes

The live nav is just **story · space · arith**. Hidden routes still build and resolve by direct URL, just aren't linked (`web/components/Nav.tsx`):
- **`/llm`** — hidden in prod (not good enough yet). An improved version is in progress on the **`feature/llm-drama`** branch; re-add the nav link when it ships.
- **`/gallery`, `/ternary`, `/explore`** — candidates for full removal. `/gallery` still routes into the removed `/explore` constellation view; `/explore` survives only as a deep-link target from `/llm`. Unless one earns its place back, delete the route folders (`web/app/{gallery,ternary,explore}`) and any now-unused components/lib (`Constellation`, `Triangle`, `SearchBar`, `featured.ts`, etc.).

## Things that look off but aren't

- `pipeline/vocab.py` writes `"<UNK>"` at id 0 and starts real words at id 1. The training code expects id 0 to be `<UNK>` and explicitly zeros it out in subsampling/noise distributions — don't shift the ids.
- `training/dataset.py` lines 23–25 contain a dead loop (`for word, wid in ...: pass`). It's a no-op left in place; the real population happens in the next loop.
- `scripts/*.py` add the repo root to `sys.path` before importing — this is how `from config import ...` works without an installed package. Keep that prelude when adding new entry-point scripts.

## When editing

- Change to `config.py` → assume it affects every stage; check whether existing artifacts on disk are still valid before re-running downstream stages.
- Change to `pipeline/tokenizer.py` or the filter in `stream_and_tokenize` → all `_tokenized.txt.gz` and downstream artifacts become stale; document this if you ship the change.
- Change to vocab construction → embeddings from previous runs are no longer row-comparable; alignment and drift artifacts must be regenerated.
- `agents.md` and `README.md` describe the same pipeline at different audiences; keep them roughly in sync when behavior changes.
