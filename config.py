from pathlib import Path

YEARS = list(range(2014, 2026))

TARGET_TOKENS_PER_YEAR = 1_000_000_000
LANGUAGE_SCORE_THRESHOLD = 0.65

EMBEDDING_DIM = 300
WINDOW_SIZE = 10
NUM_NEGATIVE_SAMPLES = 15
MIN_WORD_FREQ = 50
MAX_VOCAB_SIZE = 200_000
LEARNING_RATE = 0.0075
BATCH_SIZE = 32768
NUM_EPOCHS = 3
SUBSAMPLING_THRESHOLD = 1e-4
SEED = 42
MIN_WORD_LENGTH = 3

MIN_YEARS_FOR_VOCAB = 11
ANCHOR_YEAR = 2018

DATA_DIR = Path("data")
TOKENS_DIR = DATA_DIR / "tokens"
VOCAB_DIR = DATA_DIR / "vocab"
MODELS_DIR = Path("models")
EMBEDDINGS_DIR = MODELS_DIR / "embeddings"
ALIGNED_DIR = MODELS_DIR / "aligned"
DRIFT_DIR = MODELS_DIR / "drift"
TENSORBOARD_DIR = Path("runs")

# --- Contextual drift pipeline ---
# Upgrade from static Word2Vec/TWEC drift to *contextual* drift: run the
# historical corpus through a frozen transformer encoder and aggregate per-word
# contextual centroids per year. A frozen shared encoder puts every year in one
# coordinate system, so no Procrustes/TWEC compass is needed.
CONTEXTUAL_MODEL = "bert-base-uncased"  # fast WordPiece tokenizer, lowercase, SDPA
CONTEXTUAL_LAYER = -1  # which hidden state to pool (-1 = last_hidden_state)
CONTEXTUAL_POOLING = "first"  # "first" subword | "mean" over subwords (mean deferred)
CONTEXTUAL_MAX_LEN = 128  # non-overlapping window length (words, pre-tokenization)
CONTEXTUAL_BATCH_SIZE = 128  # windows per forward; benchmark optimum on GB10 (~80k words/s)
CONTEXTUAL_TARGET_TOKENS_PER_YEAR = TARGET_TOKENS_PER_YEAR  # 1B (full coverage)
CONTEXTUAL_MIN_COUNT = 50  # min observations for a trusted (word, year) centroid
CONTEXTUAL_CENTERING = True  # per-year mean-centering (BERT anisotropy fix)
CONTEXTUAL_PCA_REMOVE_K = 0  # all-but-top-k PCA component removal; 0 = off
CONTEXTUAL_USE_STOPWORDS = True  # skip function words when accumulating
CONTEXTUAL_DIR = MODELS_DIR / "contextual"
CONTEXTUAL_STATE_DIR = DATA_DIR / "contextual_state"

# Small English function-word list. These are extremely high frequency, carry
# little drift signal, and would dominate the accumulator; we skip them when
# building the target-id tensor (gated by CONTEXTUAL_USE_STOPWORDS).
CONTEXTUAL_STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when",
    "of", "to", "in", "on", "at", "by", "for", "with", "about", "into",
    "from", "up", "down", "out", "off", "over", "under", "as", "is", "am",
    "are", "was", "were", "be", "been", "being", "have", "has", "had",
    "do", "does", "did", "doing", "will", "would", "shall", "should",
    "can", "could", "may", "might", "must", "not", "no", "nor", "so",
    "than", "too", "very", "just", "this", "that", "these", "those",
    "i", "you", "he", "she", "it", "we", "they", "me", "him", "her",
    "us", "them", "my", "your", "his", "its", "our", "their", "mine",
    "yours", "hers", "ours", "theirs", "who", "whom", "whose", "which",
    "what", "where", "why", "how", "all", "any", "both", "each", "few",
    "more", "most", "other", "some", "such", "only", "own", "same",
    "here", "there", "again", "once", "also", "now", "ever", "never",
})
