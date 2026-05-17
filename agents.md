# Language Drift

## Goal

Measure how English language usage shifts over time by training word embeddings on yearly slices of web text and comparing them across years.

## Data

- **Source**: [HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — large-scale English web corpus derived from Common Crawl.
- **Approach**: Stream data per crawl year (2013–2025), filter to high-confidence English (`language_score >= 0.65`), target ~1B tokens per year.
- **Crawl configs**: One per Common Crawl snapshot, named `CC-MAIN-YYYY-WW`. Multiple snapshots may exist per year (2 in 2013, ~9-10 in later years).

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
- Load all 13 per-year frequency files
- Include words appearing in >= 12 of 13 years with freq >= 50
- Cap at 200K words, sorted by total frequency
- ID 0 = `<UNK>`

**1C — Encode to IDs** (per year, depends on 1B)
- Read tokenized text files, map words to vocab IDs
- Save as memory-mapped numpy int32 arrays

### Stage 2: PyTorch Word2Vec Training (per year, on DGX Spark GPU)

**Model:** Skip-gram with Negative Sampling (SGNS)
- `embedding_dim = 300`, `window_size = 5`, `num_negatives = 5`
- `batch_size = 4096`, `lr = 0.025` (linear decay to 1e-4), 1 epoch
- Frequent word subsampling (threshold 1e-4)
- Noise distribution: unigram^(3/4) for negative sampling
- Sparse embeddings + `SparseAdam` optimizer
- Fixed seed (42) + deterministic CUDA for reproducibility

**Output:** Save `center_embeddings.weight` as numpy array per year (~1-3 hours per year).

### Stage 3: Alignment & Drift

**3A — Orthogonal Procrustes Alignment**
- Anchor alignment: align all years to 2013 as reference
- SVD of cross-covariance matrix: `U, _, Vt = svd(W_ref.T @ W_t)`, `R = Vt.T @ U.T`
- Verify alignment quality using stable anchor words (function words)

**3B — Drift Metrics**
- Cosine distance between consecutive years per word
- Cosine distance from base year (2013) per word
- Total drift, max single-year drift, mean drift
- Output as Parquet files

### Stage 4: Extend Streamlit Dashboard

- **Drift Leaderboard** — top drifting words, sortable/filterable
- **Word Timeline** — cosine distance from reference over time for a selected word
- **Year-Pair Explorer** — top drifting words between any two years

## Execution Order

```
1A (parallel per year) → 1B → 1C (parallel per year) → 2 (sequential, GPU) → 3A → 3B → 4
```

## Project Structure

```
language_drift/
  config.py                      # Central constants (hyperparams, paths)
  main.py                        # Data loading script (streams FineWeb samples)
  app.py                         # Streamlit dashboard

  pipeline/                      # Stage 1: Data
    snapshot_registry.py         # Year -> CC-MAIN snapshot mapping
    tokenizer.py                 # Whitespace tokenization + normalization
    vocab.py                     # Shared vocabulary construction
    data_pipeline.py             # Stream, tokenize, save, encode

  training/                      # Stage 2: Training
    word2vec.py                  # PyTorch SGNS model
    dataset.py                   # IterableDataset for skip-gram pairs
    train.py                     # Training loop (GPU, LR decay, save)

  analysis/                      # Stage 3: Alignment & Drift
    alignment.py                 # Orthogonal Procrustes alignment
    drift.py                     # Cosine distance drift metrics

  scripts/                       # CLI entry points
    run_data_pipeline.py         # --year 2013 | --all | --build-vocab | --encode
    run_training.py              # --year 2013 | --all | --device cuda
    run_analysis.py              # --align | --drift | --all

  data/                          # gitignored
    tokens/                      # tokenized text + numpy ID arrays per year
    vocab/                       # shared vocabulary

  models/                        # gitignored
    embeddings/                  # raw embeddings per year
    aligned/                     # aligned embeddings per year
    drift/                       # drift result parquets
```

## Tech Stack

- **Python 3.13**, managed with **uv**
- **datasets** (Hugging Face) — streaming access to FineWeb
- **torch** — GPU-accelerated Word2Vec training
- **numpy / pandas / pyarrow** — data processing and storage
- **scipy** — Procrustes alignment (SVD)
- **streamlit / plotly** — interactive visualization
- **tqdm** — progress bars

## Estimated Resources

- **Disk:** ~100 GB total (90 GB data, 6 GB models)
- **Training time:** ~1-3 hours per year on DGX Spark, ~13-39 hours total
- **GPU memory:** minimal (~480 MB for model), bottleneck is data loading

## Verification

1. After Stage 1: spot-check tokenized output, verify ~1B tokens/year, verify shared vocab ~150-200K words
2. After Stage 2: check loss convergence, verify nearest neighbors for known words (e.g., "king" near "queen")
3. After Stage 3: verify anchor words (the, is, and) have near-zero drift; check known semantic shifts (e.g., "tweet", "cloud", "streaming")
4. After Stage 4: browse dashboard, verify charts render
