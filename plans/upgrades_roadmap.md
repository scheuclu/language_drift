# WordDrift Upgrade Roadmap & GitHub Issues Plan

This document outlines a plan to upgrade **WordDrift** from static Word2Vec word embeddings to advanced contextual models (BERT), sentence embeddings, and cross-lingual vector spaces.

---

## 📋 Architectural Overview

To support these advanced features, we need to transition from a purely static, precomputed assets site to a hybrid architecture:
1. **Interactive Frontend:** The current Next.js application.
2. **NLP Server API:** A lightweight Python microservice (FastAPI + Hugging Face `transformers` or `sentence-transformers`) that embeds text on the fly.
3. **Local Vector Database:** Integrations with LanceDB/Chroma for quick nearest-neighbor lookups during runtime.

---

## 🛠️ GitHub Issue Drafts

### Issue 1: Context Drift Visualizer (BERT)
* **Type:** Feature Enhancement
* **Estimated Effort:** Medium
* **Target Milestone:** v2.0-Contextual

#### Title:
`feat: Implement Target Word Context Drift Visualizer using BERT`

#### Body:
```markdown
### Description
Word2Vec produces static vectors where "bank" (savings) and "bank" (river) share the same representation. This issue aims to build a feature where a user can enter a target word and two distinct sentences to visualize how the target word's embedding "drifts" in space based on semantic context.

### Implementation Checklist
- [ ] **Python API Endpoint:**
  - Create a FastAPI endpoint `/api/context-drift` that accepts:
    - `word` (string)
    - `context_a` (string containing `word`)
    - `context_b` (string containing `word`)
  - Load a lightweight transformer model (e.g., `bert-base-uncased` or `distilbert-base-uncased`).
  - Extract the token representation for the target word from the final layer in both contexts.
  - Return the raw dimensions (projected via PCA/t-SNE to 2D) and the cosine similarity between the two contextual states.
- [ ] **Next.js Frontend:**
  - Build a clean interface at `/context-drift` with form inputs.
  - Render a visual 2D vector comparison graph (using SVG or Framer Motion) showing the displacement/drift between the two contexts.
  - Display the cosine similarity score with dynamic color-coding (closer = bright gold, further = faded cyan).
```

---

### Issue 2: Cross-Lingual Semantic Bridge Explorer
* **Type:** Feature Enhancement
* **Estimated Effort:** Medium
* **Target Milestone:** v2.0-Contextual

#### Title:
`feat: Add Cross-Lingual Semantic Alignment & Drift Visualizer`

#### Body:
```markdown
### Description
Enable users to map how semantic concepts align or drift across languages (e.g. comparing "apple", "manzana", "apfel" in a shared multilingual vector space).

### Implementation Checklist
- [ ] **Model Selection & Precomputation:**
  - Use a multilingual sentence/word model (e.g. `sentence-transformers/LaBSE` or `multilingual-e5-small`) to generate aligned vectors for a shared lexicon (~1,000 common concepts in English, Spanish, French, German).
  - Project the joint vectors to a shared 2D coordinate space using UMAP.
- [ ] **Frontend Interface:**
  - Create a `/multilingual` route that shows a dual-galaxy or overlay view of languages.
  - Highlighting a word in English automatically draws connection lines to its translation equivalents in other languages, showing the distance/drift (e.g., "compromise" in English might sit differently from "compromiso" in Spanish due to cultural variations).
```

---

### Issue 3: Sentence Semantic Space & Search Visualizer
* **Type:** Core Feature Upgrade
* **Estimated Effort:** High
* **Target Milestone:** v2.5-SentenceSpace

#### Title:
`feat: Add Sentence Space Visualizer with Live Semantic Search`

#### Body:
```markdown
### Description
Upgrade the landing page concept from static individual words to a 2D sentence coordinate space, letting users search/type full sentences and see them plot in real-time next to existing topic clusters.

### Implementation Checklist
- [ ] **Precompute Sentence Corpus:**
  - Embed a dataset of 5,000–10,000 sentences (e.g., from news headlines, quotes, or commonsense questions) using `sentence-transformers/all-MiniLM-L6-v2`.
  - Project them to 2D coordinates using UMAP and write them to a lightweight binary vector sheet.
- [ ] **FastAPI Search Engine:**
  - Create a `/api/embed-query` endpoint to encode a user's typed sentence on-the-fly.
  - Perform cosine similarity against the precomputed sentence coordinates.
- [ ] **Frontend t-SNE Canvas:**
  - Render the sentence space.
  - When the user searches a phrase, plot a glowing beacon indicating where their phrase landed, showing the nearest sentence matches with connections.
```

---

### Issue 4: Vector Storage Infrastructure (LanceDB)
* **Type:** Technical Debt / Performance
* **Estimated Effort:** Low
* **Target Milestone:** Infrastructure Upgrade

#### Title:
`refactor: Integrate LanceDB for Fast Nearest-Neighbor Vector Storage`

#### Body:
```markdown
### Description
Replace in-memory array search loops with a local, embedded vector database (LanceDB) to enable sub-millisecond querying as our sentence and contextual databases grow.

### Implementation Checklist
- [ ] **Database Setup:**
  - Install and initialize `lancedb` in the Python pipeline.
  - Load precomputed vectors (multilingual and sentence bases) directly into local LanceDB tables.
- [ ] **Query Refactor:**
  - Rewrite query endpoints to execute vector search directly using LanceDB indices instead of raw matrix dot products.
```
