# Language Drift

## Goal

Measure how English language usage shifts over time by training word embeddings on yearly slices of web text and comparing them across years.

## Data

- **Source**: [HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — large-scale English web corpus derived from Common Crawl.
- **Approach**: Stream data per crawl year (2014–2025), filter to high-confidence English (`language_score >= 0.65`), target ~1B tokens per year. 2013 is excluded — too few CC-MAIN snapshots to produce a comparable yearly embedding.
- **Crawl configs**: One per Common Crawl snapshot, named `CC-MAIN-YYYY-WW`. Multiple snapshots per year (~9-10 typical).

## Pipeline

### Stage 1: Data Pipeline

**1A — Stream & Tokenize** (per year, parallelizable)
- Stream FineWeb via HuggingFace `datasets` with `streaming=True`
- Aggregate all CC-MAIN snapshots for each calendar year, drawing proportionally from each
- Tokenize: lowercase, remove URLs/HTML, split on whitespace, strip punctuation, filter (len >= 2, not numeric)
- Save tokenized text as gzip-compressed line-delimited files
- Save per-year word frequency counts as JSON
- Checkpoint progress for resume on failure

**1B — Build Shared Vocabulary** (depends on all of 1A)
- Load all 12 per-year frequency files
- Include words appearing in >= 11 of 12 years with freq >= 50
- Cap at 200K words, sorted by total frequency
- ID 0 = `<UNK>`

**1C — Encode to IDs** (per year, depends on 1B)
- Read tokenized text files, map words to vocab IDs
- Save as numpy int32 arrays (each ~4GB, loaded fully into RAM for training)

### Stage 2: PyTorch Word2Vec Training (per year, on DGX Spark GPU)

**Model:** Skip-gram with Negative Sampling (SGNS)
- `embedding_dim = 300`, `window_size = 10`, `num_negatives = 15`
- `batch_size = 32768`, `lr = 0.0075` (linear decay, floor 1e-5), 3 epochs
- Frequent word subsampling (threshold 1e-4)
- Noise distribution: unigram^(3/4) for negative sampling
- Two dense embedding tables + dense `Adam` optimizer
- Fixed seed (42) + deterministic CUDA for reproducibility

**TWEC / compass (current — `scripts/twec_full.py`):** first train a shared
"compass" (the context matrix) on all years combined, freeze it, then train
each year's word vectors against that frozen compass. Every year lands in one
coordinate frame directly — no Procrustes. This supersedes the independent
per-year training + alignment below (kept as legacy).

**Data loading:** Load the full token ID array into RAM (~4GB per year, 128GB available). Use a map-style `Dataset` with random-access indexing instead of `IterableDataset`. This enables proper shuffling and fast multi-worker `DataLoader` with no I/O bottleneck.

**Output:** Save `center_embeddings.weight` as numpy array per year (~1-3 hours per year).

### Stage 3: Drift & Frequency Analysis

**Semantic Drift** (shared space — no alignment)
With TWEC every year already shares one coordinate frame, so drift is measured
directly (no Procrustes step).
- Cosine distance from the 2018 vector, per word per year
- Total drift (summed over the 11 non-anchor years), max, mean

**Frequency Drift**
- Measure changes in relative frequency (tokens per billion) over time.
- Distribution shift: The "fan" of word frequencies widening significantly after ChatGPT (2023+).

**Output:** Parquet files in `models/drift/` and the per-word web shards.

### Stage 4: Web app + data hosting

The interactive site is a **Next.js app in `web/`**:
- **Landing**: Scrollytelling experience featuring "Drift Stories" (curated shifts like *crypto*, *distancing*, *ai-slop*).
- **`/explore`**: 3D Constellation view showing a word's nearest neighbors as they turn over year-by-year.
- **`/space`**: 2D UMAP "galaxy" of 50K+ words. Features interactive colour axes (semantic poles) and movement heatmaps.
- **`/llm`**: Ridgeline plot of the entire language's frequency distribution "tearing open" after 2022.
- **`/arith`**: Word vector arithmetic (e.g., *king - man + woman = queen* across time).
- **`/ternary`**: Triangle plot comparing a word's relative similarity to three anchors.
- **`/gallery`**: Rankings of the most drifted words by frequency tier.
- **`/w/[word]`**: Individual word dossier pages.

**Data hosting**: `scripts/precompute_*.py` emit per-word shards; `scripts/pack_web_data.py` packs them into binary blobs (`vecs.bin`, `neighbors.bin`, `space.bin`); everything is uploaded to **Vercel Blob** under `data/vN/` — NOT committed to git.

## Execution Order

```
1A (parallel per year) → 1B → 1C (parallel per year) → 2 TWEC (compass + per-year slices, GPU) → 3 drift → 4 precompute + pack + upload to Blob
```

## Project Structure

```
language_drift/
  config.py                      # Central constants (hyperparams, paths)
  main.py                        # Data loading script (streams FineWeb samples)
  app.py                         # Streamlit dashboard (dev utility)

  pipeline/                      # Stage 1: Data
    snapshot_registry.py         # Year -> CC-MAIN snapshot mapping
    tokenizer.py                 # Whitespace tokenization + normalization
    vocab.py                     # Shared vocabulary construction
    data_pipeline.py             # Stream, tokenize, save, encode

  training/                      # Stage 2: Training
    word2vec.py                  # PyTorch SGNS model
    dataset.py                   # Map-style Dataset for skip-gram pairs (in-RAM)
    train.py                     # Training loop (GPU, LR decay, save)

  analysis/                      # Stage 3: Drift
    alignment.py                 # Orthogonal Procrustes (legacy)
    drift.py                     # Cosine distance + frequency metrics

  scripts/                       # CLI entry points
    run_data_pipeline.py         # --year 2014 | --all | --build-vocab | --encode
    twec_full.py                 # TWEC/compass trainer (current)
    precompute_web_data.py       # emit per-word neighbors/vectors for web
    precompute_llm.py            # emit frequency distribution data for /llm
    precompute_tsne.py           # compute 2D UMAP for /space
    pack_web_data.py             # pack shards -> binary blobs (+ index)
    check_anchor_drift.py        # verify stability of known anchor words
    quality_check.py             # verify embedding quality (king/queen tests)

  data/                          # gitignored
    tokens/                      # tokenized text + numpy ID arrays per year
    vocab/                       # shared vocabulary

  models/                        # gitignored
    embeddings_twec_full/        # TWEC output (current shipped embeddings)
    aligned/                     # symlink/copy of current embeddings for export
    drift/                       # drift result parquets
    training_logs/               # loss/drift logs per run

  web/                           # Next.js app; data hosted on Vercel Blob
```

## Tech Stack

- **Python 3.13**, managed with **uv**
- **datasets** (Hugging Face) — streaming access to FineWeb
- **torch** — GPU-accelerated Word2Vec training
- **numpy / pandas / pyarrow** — data processing and storage
- **scipy / umap-learn** — SVD + 2D projections
- **Next.js / TypeScript / Tailwind CSS / Framer Motion** — interactive web app
- **Vercel Blob** — hosting for large binary vector data
- **streamlit** — `app.py` FineWeb sample browser (dev utility)

## Verification

1. After Stage 1: spot-check tokenized output, verify ~1B tokens/year, verify shared vocab ~150-200K words
2. After Stage 2: check loss convergence, verify nearest neighbors for known words (e.g., "king" near "queen")
3. After Stage 3: verify anchor words (the, is, and) have near-zero drift; check known semantic shifts (e.g., "tweet", "cloud", "streaming")
4. After Stage 4: browse dashboard, verify charts render
