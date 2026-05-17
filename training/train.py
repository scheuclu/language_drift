import json
import random

import numpy as np
import torch
from torch.utils.data import DataLoader

from config import (
    BATCH_SIZE,
    EMBEDDING_DIM,
    EMBEDDINGS_DIR,
    LEARNING_RATE,
    NUM_EPOCHS,
    NUM_NEGATIVE_SAMPLES,
    SEED,
    SUBSAMPLING_THRESHOLD,
    TOKENS_DIR,
    VOCAB_DIR,
    WINDOW_SIZE,
)
from pipeline.vocab import load_vocab
from training.dataset import SkipGramDataset
from training.word2vec import Word2VecSGNS


def set_seed(seed: int) -> None:
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)
        torch.backends.cudnn.deterministic = True
        torch.backends.cudnn.benchmark = False


def train_year(year: int, device: str = "cuda") -> None:
    set_seed(SEED)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    vocab_size = len(vocab)
    id_to_word = {str(v): k for k, v in vocab.items()}

    freq_path = TOKENS_DIR / f"{year}_freqs.json"
    with open(freq_path) as f:
        word_freqs = json.load(f)

    token_ids_path = TOKENS_DIR / f"{year}.npy"
    print(f"Loading token IDs for {year}...")
    token_ids = np.load(token_ids_path)
    print(f"  {len(token_ids):,} tokens loaded into RAM")

    print("Building dataset (subsampling + noise table)...")
    dataset = SkipGramDataset(
        token_ids=token_ids,
        vocab_size=vocab_size,
        window_size=WINDOW_SIZE,
        num_negatives=NUM_NEGATIVE_SAMPLES,
        word_freqs=word_freqs,
        id_to_word=id_to_word,
        subsample_threshold=SUBSAMPLING_THRESHOLD,
    )
    print(f"  {len(dataset):,} tokens after subsampling")

    loader = DataLoader(
        dataset,
        batch_size=BATCH_SIZE,
        shuffle=True,
        num_workers=4,
        pin_memory=True,
        drop_last=True,
    )

    model = Word2VecSGNS(vocab_size, EMBEDDING_DIM).to(device)
    optimizer = torch.optim.SparseAdam(model.parameters(), lr=LEARNING_RATE)

    total_batches = len(loader) * NUM_EPOCHS

    print(f"Training year {year}: {total_batches:,} batches, device={device}")

    global_step = 0
    for epoch in range(NUM_EPOCHS):
        running_loss = 0.0
        for batch_idx, (center, context, negatives) in enumerate(loader):
            lr = LEARNING_RATE * (1 - global_step / total_batches)
            lr = max(lr, 1e-4)
            for pg in optimizer.param_groups:
                pg["lr"] = lr

            center = center.to(device)
            context = context.to(device)
            negatives = negatives.to(device)

            loss = model(center, context, negatives)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()

            running_loss += loss.item()
            global_step += 1

            if global_step % 10_000 == 0:
                avg_loss = running_loss / 10_000
                print(f"  Step {global_step:>8,} / {total_batches:,} | Loss {avg_loss:.4f} | LR {lr:.6f}")
                running_loss = 0.0

    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    embeddings = model.center_embeddings.weight.detach().cpu().numpy()
    out_path = EMBEDDINGS_DIR / f"{year}.npy"
    np.save(out_path, embeddings)
    print(f"Year {year}: saved embeddings {embeddings.shape} -> {out_path}")
