# Language Drift

## Goal

Measure how English language usage shifts over time by training word embeddings on yearly slices of web text and comparing them across years.

## Data

- **Source**: [HuggingFaceFW/fineweb](https://huggingface.co/datasets/HuggingFaceFW/fineweb) — large-scale English web corpus derived from Common Crawl.
- **Approach**: Stream data per crawl year (2013–2025), filter to high-confidence English (`language_score >= 0.65`), and sample a consistent number of documents per year.
- **Crawl configs**: One per Common Crawl snapshot, named `CC-MAIN-YYYY-WW`. Multiple snapshots may exist per year.

## Method

1. **Sample** a fixed-size corpus per year from FineWeb.
2. **Train embeddings** (e.g. Word2Vec, FastText) independently for each year.
3. **Align** embedding spaces across years (e.g. Procrustes alignment) so vectors are comparable.
4. **Measure drift** — for each word, track how its embedding moves over time. Words with large shifts indicate semantic or cultural change.
5. **Visualize** drift patterns in the Streamlit dashboard.

## Project Structure

- `main.py` — data loading script (streams FineWeb samples)
- `app.py` — Streamlit dashboard for browsing samples
- `pyproject.toml` / `uv.lock` — dependency management via uv

## Tech Stack

- **Python 3.13**, managed with **uv**
- **datasets** (Hugging Face) — streaming access to FineWeb
- **streamlit** — interactive visualization
