import streamlit as st
from datasets import load_dataset

CRAWLS_2013 = ["CC-MAIN-2013-20", "CC-MAIN-2013-48"]
SAMPLE_SIZE = 200


@st.cache_data(show_spinner="Loading samples from HuggingFace...")
def load_samples():
    samples = []
    per_crawl = SAMPLE_SIZE // len(CRAWLS_2013)
    for crawl in CRAWLS_2013:
        ds = load_dataset(
            "HuggingFaceFW/fineweb",
            name=crawl,
            streaming=True,
            split="train",
        )
        filtered = ds.filter(lambda x: x["language_score"] >= 0.65)
        for row in filtered.take(per_crawl):
            samples.append(row)
    return samples


st.set_page_config(page_title="FineWeb 2013 Browser", layout="wide")
st.title("FineWeb 2013 Sample Browser")

samples = load_samples()

idx = st.number_input(
    "Sample index",
    min_value=0,
    max_value=len(samples) - 1,
    value=0,
    step=1,
)

col_prev, col_next, _ = st.columns([1, 1, 8])
with col_prev:
    if st.button("← Prev") and idx > 0:
        st.query_params["idx"] = idx - 1
        st.rerun()
with col_next:
    if st.button("Next →") and idx < len(samples) - 1:
        st.query_params["idx"] = idx + 1
        st.rerun()

sample = samples[idx]

st.markdown(f"**Sample {idx + 1} of {len(samples)}**")

meta_cols = st.columns(4)
meta_cols[0].metric("Language Score", f"{sample['language_score']:.2f}")
meta_cols[1].metric("Token Count", sample["token_count"])
meta_cols[2].metric("Crawl", sample["dump"])
meta_cols[3].metric("Date", sample["date"][:10])

st.markdown(f"**URL:** {sample['url']}")

st.divider()
st.markdown(sample["text"])
