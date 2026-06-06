# Language Drift

**[→ Live demo: language-drift.vercel.app](https://language-drift.vercel.app)**

Twelve Word2Vec models — one per year, 2014 through 2025, trained on a billion tokens of Common Crawl each, against a shared TWEC/compass so the same word has 12 directly-comparable positions. The result is a quantitative, interactive view of how English usage actually changed over the last decade.

`PyTorch · Word2Vec (SGNS) · TWEC/compass · UMAP · Next.js · Vercel Blob · D3 · Framer Motion`

![Language Drift — landing](docs/img/landing.png)

## What you can do with it

| | |
|---|---|
| ![explore](docs/img/explore.png) | **`/explore` — constellation view.** Pick a word; scroll to scrub through the years. Watch a word's nearest neighbors fly in and out as its meaning shifts. |
| ![space](docs/img/space.gif) | **`/space` — embedding cloud.** All 52,894 vocabulary words projected to 2D via UMAP. Features interactive semantic axes (e.g. `science` vs `music`) and movement heatmaps. |
| ![ternary](docs/img/ternary.png) | **`/ternary` — three-pole projection.** Pick three anchor words (e.g. `encryption`, `scam`, `money`) and watch a target sweep cryptography → scams → money. |
| (Distribution) | **`/llm` — the frequency fan.** Watch the distribution of every common English word "tear open" after 2022 as machine-generated text floods the web. |

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

The site lets you drive these comparisons yourself across all 52,894 eligible words.

## How the pipeline works

```
FineWeb (Common Crawl, 2014–2025)
   │
   ▼
1. Stream + tokenize ~1B tokens/year, language-filtered (score ≥ 0.65)
   │
   ▼
2. Build a single shared vocabulary across all 12 years
   (~200K tokens that appear in ≥11 years with freq ≥50)
   │
   ▼
3. Train with TWEC/compass: a shared context "compass" on all years combined,
   frozen, then each year's word vectors against it (300d, window 10, 15 neg)
   │
   ▼
4. (no alignment step — every year already shares one coordinate frame)
   │
   ▼
5. Compute drift (per-word cosine distance from 2018 + per-year frequencies)
   │
   ▼
6. Pack per-word data into single binaries, host on Vercel Blob (range-fetched)
```

Cross-year comparability is the whole game: independently-trained models each live in their own arbitrarily-rotated space, so raw cosines across years are noise. This project uses **TWEC/compass** — a shared context space trained on all years and frozen, then per-year word vectors trained against it — so the years are comparable *by construction*.

The web app is fully static and **serverless for its data too**: per-word vectors and neighbor lists are packed into single binaries (`vecs.bin`, `neighbors.bin`, `space.bin`) hosted on **Vercel Blob**, and the client HTTP-Range-fetches just the slice it needs.

## Tech stack

| Layer | Tools |
|---|---|
| Data | FineWeb / Common Crawl, HuggingFace `datasets`, Python 3.13, `uv` |
| Training | PyTorch (Skip-gram + Negative Sampling), CUDA, dense Adam |
| Analysis | NumPy, SciPy, scikit-learn, UMAP, pandas (parquet) |
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind CSS, Framer Motion, D3 |
| Deploy | Vercel (Git integration, auto-deploy on `main`) |

## Running it yourself

<details>
<summary><b>Full pipeline setup</b> (Python 3.13, GPU recommended, ~100 GB disk, 128 GB RAM)</summary>

### Setup

```bash
git clone https://github.com/scheuclu/language_drift.git
cd language_drift
uv sync
```

### Stage 1 — Data pipeline

```bash
uv run python scripts/run_data_pipeline.py --all              # all years
uv run python scripts/run_data_pipeline.py --build-vocab      # shared vocab
uv run python scripts/run_data_pipeline.py --encode --all     # encode to IDs
```

### Stage 2 — Train embeddings (GPU)

```bash
uv run python scripts/twec_full.py --device cuda    # TWEC/compass (current)
```

### Stage 3 — Drift

```bash
cp models/embeddings_twec_full/*.npy models/aligned/
uv run python scripts/run_analysis.py --drift
```

### Stage 4 — Web data → Vercel Blob

```bash
uv run python scripts/precompute_web_data.py   # manifest + neighbors
uv run python scripts/precompute_vectors.py    # vecs.bin
uv run python scripts/precompute_arithmetic.py # arith.bin
uv run python scripts/precompute_tsne.py       # space.bin (2D UMAP)
uv run python scripts/precompute_llm.py        # llm.json
uv run python scripts/pack_web_data.py         # pack to binaries
```

</details>

## Data source

[HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — 15 trillion tokens of cleaned English web text from Common Crawl, 2013–2025. Licensed ODC-BY.

## Author

Built by [Lukas Scheucher](https://github.com/scheuclu). MIT licensed.
