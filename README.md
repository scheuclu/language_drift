# Language Drift

Measure how English language usage shifts over time by training word embeddings on yearly slices of web text (2013–2025) and tracking how word meanings change.

## How It Works

1. **Stream** ~1 billion tokens per year from [FineWeb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) (a cleaned English web corpus derived from Common Crawl)
2. **Tokenize** text (lowercase, strip URLs/HTML/emojis, filter short and numeric tokens)
3. **Build a shared vocabulary** across all years (~150–200K words that appear consistently)
4. **Train Word2Vec embeddings** (Skip-gram + Negative Sampling) independently per year using PyTorch on GPU
5. **Align** embedding spaces via Orthogonal Procrustes so vectors are comparable across years
6. **Measure drift** — cosine distance per word across years reveals semantic and cultural shifts

## Setup

Requires Python 3.13+ and [uv](https://docs.astral.sh/uv/).

```bash
git clone https://github.com/scheuclu/language_drift.git
cd language_drift
uv sync
```

## Usage

The pipeline has three stages. Each stage produces artifacts that the next stage consumes. All outputs go into `data/` and `models/` (gitignored).

### Stage 1: Data Pipeline

**1A — Stream & tokenize** (~hours per year, network-bound):

```bash
# Single year
uv run python scripts/run_data_pipeline.py --year 2013

# All years (2013–2025)
uv run python scripts/run_data_pipeline.py --all
```

Outputs per year:
- `data/tokens/{year}_tokenized.txt.gz` — tokenized text (~2–3 GB)
- `data/tokens/{year}_freqs.json` — word frequency counts
- `data/tokens/{year}_meta.json` — stats (token count, doc count)

Supports resume — if interrupted, re-run the same command and it picks up where it left off.

**1B — Build shared vocabulary** (requires all years from 1A):

```bash
uv run python scripts/run_data_pipeline.py --build-vocab
```

Output: `data/vocab/vocab.json` — words appearing in 12+ years with frequency >= 50, capped at 200K.

**1C — Encode to numpy arrays** (requires vocab from 1B):

```bash
# Single year
uv run python scripts/run_data_pipeline.py --encode --year 2013

# All years
uv run python scripts/run_data_pipeline.py --encode --all
```

Output per year: `data/tokens/{year}.npy` — int32 token ID array (~4 GB, loaded fully into RAM during training).

### Stage 2: Train Embeddings

```bash
# Single year
uv run python scripts/run_training.py --year 2013 --device cuda

# All years sequentially
uv run python scripts/run_training.py --all --device cuda

# CPU fallback (slower)
uv run python scripts/run_training.py --year 2013 --device cpu
```

Output per year: `models/embeddings/{year}.npy` — embedding matrix of shape `(vocab_size, 300)`.

Training parameters (configured in `config.py`):
| Parameter | Value |
|-----------|-------|
| Embedding dim | 300 |
| Window size | 5 |
| Negative samples | 5 |
| Batch size | 4096 |
| Learning rate | 0.025 (linear decay to 1e-4) |
| Epochs | 1 |
| Subsampling threshold | 1e-4 |

Estimated time: ~1–3 hours per year on a DGX Spark GPU.

### Stage 3: Alignment & Drift Analysis

```bash
# Run alignment only
uv run python scripts/run_analysis.py --align

# Run drift metrics only (requires alignment)
uv run python scripts/run_analysis.py --drift

# Run both
uv run python scripts/run_analysis.py --all
```

Outputs:
- `models/aligned/{year}.npy` — embeddings aligned to 2013 reference space
- `models/drift/drift_pairwise.parquet` — cosine distance per word between consecutive years
- `models/drift/drift_from_base.parquet` — cosine distance per word from 2013
- `models/drift/drift_summary.parquet` — per-word aggregate drift (total, mean, max)

### Browse Samples

```bash
uv run streamlit run app.py
```

Opens a dashboard at http://localhost:8501 to flip through raw FineWeb 2013 samples.

## Full Pipeline (Copy-Paste)

```bash
# Run everything end-to-end on a GPU machine
uv run python scripts/run_data_pipeline.py --all
uv run python scripts/run_data_pipeline.py --build-vocab
uv run python scripts/run_data_pipeline.py --encode --all
uv run python scripts/run_training.py --all --device cuda
uv run python scripts/run_analysis.py --all
```

## Project Structure

```
config.py                        # Hyperparameters and paths
app.py                           # Streamlit sample browser
main.py                          # Quick data loading script

pipeline/
  snapshot_registry.py           # Year -> CC-MAIN snapshot mapping
  tokenizer.py                   # Text normalization and tokenization
  vocab.py                       # Shared vocabulary construction
  data_pipeline.py               # Streaming, tokenization, encoding

training/
  word2vec.py                    # PyTorch Skip-gram model (SGNS)
  dataset.py                    # Map-style dataset (in-RAM)
  train.py                      # GPU training loop

analysis/
  alignment.py                  # Orthogonal Procrustes alignment
  drift.py                      # Cosine drift metrics

scripts/
  run_data_pipeline.py           # CLI for Stage 1
  run_training.py                # CLI for Stage 2
  run_analysis.py                # CLI for Stage 3
```

## Data Source

[HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — 15T tokens of cleaned English web text from Common Crawl (2013–2025). Licensed under ODC-BY.

## Estimated Resources

- **Disk:** ~100 GB (90 GB tokenized data + ID arrays, 6 GB models)
- **RAM:** 128 GB recommended (loads ~4 GB token array per year into memory)
- **Training time:** ~1–3 hours per year on GPU, ~13–39 hours total
- **Data streaming:** several hours per year (network-dependent)
