# Language Drift

**[→ Live demo: language-drift.vercel.app](https://language-drift.vercel.app)**

Twelve Word2Vec models — one per year, 2014 through 2025, trained on a billion tokens of Common Crawl each, against a shared TWEC/compass so the same word has 12 directly-comparable positions. The result is a quantitative, interactive view of how English usage actually changed over the last decade.

`PyTorch · Word2Vec (SGNS) · TWEC/compass · UMAP · Next.js · Vercel Blob · D3 · Framer Motion`

![Language Drift — landing](docs/img/landing.png)

## What you can do with it

| | |
|---|---|
| ![explore](docs/img/explore.png) | **`/explore` — constellation view.** Pick a word; scroll to scrub through the years. Watch a word's nearest neighbors fly in and out as its meaning shifts. Click any neighbor to dive into it. |
| ![ternary](docs/img/ternary.png) | **`/ternary` — three-pole projection.** Pick three anchor words (e.g. `encryption`, `scam`, `money`) and a target (`crypto`). Each year's barycentric position is the target's cosine similarity to each anchor, projected into the triangle. Watch `crypto` sweep cryptography → scams → money. |
| ![space](docs/img/space.gif) | **`/space` — embedding cloud.** All 19,595 vocabulary words projected to 2D via UMAP, jointly across all years. Hit play and the cloud breathes between 2014 and 2025 as each word interpolates along its 12-year path. Drag to pan, scroll to zoom, click any point to pin. |

## Findings

The TWEC/compass frame gives a low noise floor — stable words total only ~0.5–1.0 of cosine drift across the whole decade (≈0.07/year) — against which real neologisms shift ~8× harder. A few examples, total cosine distance from 2018 summed over the other 11 years:

| Word | Total drift | What changed |
|---|---|---|
| `distancing` | **8.66** | Emotional "distance yourself from an idea" → COVID "social distancing." A one-way flip that never reverts. |
| `nft` | **8.64** | Barely in the corpus pre-2020 → art, crypto, staking, scam. |
| `lockdown` | **8.04** | A prison/security protocol → the pandemic everyday. |
| `pandemic` | **6.30** | Textbook disease term → the lived 2020–21 era. |
| `crypto` | **4.95** | Cryptography → currency (and, around 2017–19, scams). |
| `zoom` | **3.79** | A camera verb → the video-call noun. |
| `mask` | **2.92** | A cosmetic face-mask (skin, facial) → PPE (wearing, protective), then both at once. |
| `father` | 0.84 | Anchor word — barely moves. |
| `music` | 0.53 | Anchor word — sits at the noise floor. |

The site lets you drive these comparisons yourself across all 19,595 eligible words.

## How the pipeline works

```
FineWeb (Common Crawl, 2014–2025)
   │
   ▼
1. Stream + tokenize ~1B tokens/year, language-filtered (score ≥ 0.65)
   │
   ▼
2. Build a single shared vocabulary across all 12 years
   (~120K tokens that appear in ≥11 years with freq ≥50)
   │
   ▼
3. Train with TWEC/compass: a shared context "compass" on all years combined,
   frozen, then each year's word vectors against it (300d, window 10, 15 neg)
   │
   ▼
4. (no alignment step — every year already shares one coordinate frame)
   │
   ▼
5. Compute drift (per-word cosine distance from 2018, per year)
   │
   ▼
6. Pack per-word data into single binaries, host on Vercel Blob (range-fetched)
```

Cross-year comparability is the whole game: independently-trained models each live in their own arbitrarily-rotated space, so raw cosines across years are noise. The classic fix is post-hoc orthogonal **Procrustes** alignment to a reference year. This project instead uses **TWEC/compass** — a shared context space trained on all years and frozen, then per-year word vectors trained against it — so the years are comparable *by construction*, with no rotation step. Measured against Procrustes on this corpus: ~30% lower drift noise floor, ~20% better signal-to-noise, equal-or-better intrinsic benchmarks (the Procrustes path stays in the repo as a baseline).

The web app is fully static (every page prerenders) and **serverless for its data too**: per-word vectors and neighbor lists are packed into single binaries (`vecs.bin`, `neighbors.bin`) hosted on **Vercel Blob**, and the client HTTP-Range-fetches just the slice it needs — so client-side cosine math (the `/ternary` view) runs with no backend, and the ~400 MB of data never touches the git repo.

## Tech stack

| Layer | Tools |
|---|---|
| Data | FineWeb / Common Crawl, HuggingFace `datasets`, Python 3.13, `uv` |
| Training | PyTorch (Skip-gram + Negative Sampling), CUDA, dense Adam |
| Analysis | NumPy, SciPy, scikit-learn, UMAP, pandas (parquet) |
| Frontend | Next.js 16 (App Router), TypeScript, Tailwind v4, Framer Motion, D3 (zoom + quadtree) |
| Deploy | Vercel (Git integration, auto-deploy on `main`) |

## Running it yourself

Most readers won't need to — the deployed site is the demo. But if you want to retrain on a different corpus, or iterate on the architecture, the pipeline is fully reproducible from scratch.

<details>
<summary><b>Full pipeline setup</b> (Python 3.13, GPU recommended, ~100 GB disk, 128 GB RAM)</summary>

### Setup

```bash
git clone https://github.com/scheuclu/language_drift.git
cd language_drift
uv sync
```

### Stage 1 — Data pipeline

Stream and tokenize (resumable):

```bash
uv run python scripts/run_data_pipeline.py --all              # all years
uv run python scripts/run_data_pipeline.py --year 2014        # one year
```

Outputs per year: `data/tokens/{year}_tokenized.txt.gz`, `data/tokens/{year}_freqs.json`.

Build shared vocab (requires all years):

```bash
uv run python scripts/run_data_pipeline.py --build-vocab
```

Encode tokenized text to int32 arrays:

```bash
uv run python scripts/run_data_pipeline.py --encode --all
```

### Stage 2 — Train embeddings (GPU)

```bash
uv run python scripts/twec_full.py --device cuda    # TWEC/compass (current, resumable)
# legacy independent per-year baseline:
# uv run python scripts/run_training.py --all --device cuda
```

Outputs `models/embeddings_twec_full/{year}.npy` — a shared coordinate frame, so
no separate alignment step. ~1 hr for the compass + ~25 min/year.

Hyperparameters live in `config.py`:

| | |
|---|---|
| Embedding dim | 300 |
| Window | 10 |
| Negative samples | 15 |
| Batch size | 32,768 |
| Learning rate | 0.0075 (linear decay, floor 1e-5) |
| Epochs | 3 |

### Stage 3 — Drift (no alignment)

TWEC years already share one frame. Copy the TWEC output into `models/aligned/`
(the export reads from there), then compute drift:

```bash
cp models/embeddings_twec_full/*.npy models/aligned/
uv run python scripts/run_analysis.py --drift
```

(Legacy: `run_analysis.py --align` runs the Procrustes baseline on `models/embeddings/`.)

### Stage 4 — Web data → Vercel Blob

Emit the per-word shards, pack them, and upload to Blob (the data is **not**
committed to git):

```bash
uv run python scripts/precompute_web_data.py   # manifest + per-word JSONs
uv run python scripts/precompute_vectors.py    # per-word vectors (.bin)
uv run python scripts/precompute_arithmetic.py # arith.bin for /arith
uv run python scripts/precompute_tsne.py       # joint 2D UMAP for /space
uv run python scripts/pack_web_data.py         # pack -> vecs.bin + neighbors.bin (+index)
# then upload web/public/data/{packed/*, manifest.json, arith.bin, space*} to the
# Blob store under data/vN/ (`vercel blob put ...`) and bump the version in
# web/lib/data-source.ts. The code push is tiny; Vercel auto-deploys.
```

### Project structure

```
config.py                          # hyperparameters + paths (single source of truth)
pipeline/
  snapshot_registry.py             # year → CC-MAIN snapshot mapping
  tokenizer.py                     # text normalization
  vocab.py                         # shared vocabulary construction
  data_pipeline.py                 # streaming, tokenization, encoding
training/
  word2vec.py                      # PyTorch SGNS model
  dataset.py                       # map-style in-RAM dataset
  train.py                         # GPU training loop
analysis/
  alignment.py                     # orthogonal Procrustes (legacy baseline)
  drift.py                         # cosine drift metrics
scripts/
  run_data_pipeline.py             # Stage 1 CLI
  twec_full.py                     # Stage 2 — TWEC/compass trainer (current)
  run_training.py, run_analysis.py # legacy independent-train + Procrustes
  precompute_*.py                  # emit web data shards
  pack_web_data.py                 # pack shards -> vecs.bin + neighbors.bin (+index)
web/                               # Next.js app (data on Vercel Blob) — see web/README.md
```

</details>

## Data source

[HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — 15 trillion tokens of cleaned English web text from Common Crawl, 2013–2025. Licensed ODC-BY.

## Author

Built by [Lukas Scheucher](https://github.com/scheuclu). MIT licensed.
