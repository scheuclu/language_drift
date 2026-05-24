import json
import random

import numpy as np
import torch

from config import (
    BATCH_SIZE,
    EMBEDDING_DIM,
    EMBEDDINGS_DIR,
    LEARNING_RATE,
    NUM_EPOCHS,
    NUM_NEGATIVE_SAMPLES,
    SEED,
    SUBSAMPLING_THRESHOLD,
    TENSORBOARD_DIR,
    TOKENS_DIR,
    VOCAB_DIR,
    WINDOW_SIZE,
)
from pipeline.vocab import load_vocab
from training.dataset import GPUSkipGramSampler
from training.word2vec import Word2VecSGNS

try:
    from torch.utils.tensorboard import SummaryWriter
    _HAS_TB = True
except ImportError:
    _HAS_TB = False


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

    print("Building GPU sampler (subsampling + noise table)...")
    sampler = GPUSkipGramSampler(
        token_ids=token_ids,
        vocab_size=vocab_size,
        window_size=WINDOW_SIZE,
        num_negatives=NUM_NEGATIVE_SAMPLES,
        word_freqs=word_freqs,
        id_to_word=id_to_word,
        subsample_threshold=SUBSAMPLING_THRESHOLD,
        device=device,
        seed=SEED,
    )
    print(f"  {len(sampler):,} tokens after subsampling")
    del token_ids

    model = Word2VecSGNS(vocab_size, EMBEDDING_DIM).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LEARNING_RATE)

    steps_per_epoch = len(sampler) // BATCH_SIZE
    total_batches = steps_per_epoch * NUM_EPOCHS

    print(f"Training year {year}: {total_batches:,} batches, device={device}")

    writer = None
    if _HAS_TB:
        log_dir = TENSORBOARD_DIR / f"year_{year}"
        log_dir.mkdir(parents=True, exist_ok=True)
        writer = SummaryWriter(log_dir=str(log_dir))

    running_loss = torch.zeros((), device=device)
    for global_step in range(1, total_batches + 1):
        lr = LEARNING_RATE * (1 - (global_step - 1) / total_batches)
        lr = max(lr, 1e-4)
        for pg in optimizer.param_groups:
            pg["lr"] = lr

        center, context, negatives = sampler.sample_batch(BATCH_SIZE)

        loss = model(center, context, negatives)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        running_loss += loss.detach()

        if global_step % 10_000 == 0:
            avg_loss = (running_loss / 10_000).item()
            print(f"  Step {global_step:>8,} / {total_batches:,} | Loss {avg_loss:.4f} | LR {lr:.6f}")
            if writer is not None:
                writer.add_scalar("loss/train", avg_loss, global_step)
                writer.add_scalar("lr", lr, global_step)
            running_loss.zero_()

    if writer is not None:
        writer.close()

    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    embeddings = model.center_embeddings.weight.detach().cpu().numpy()
    out_path = EMBEDDINGS_DIR / f"{year}.npy"
    np.save(out_path, embeddings)
    print(f"Year {year}: saved embeddings {embeddings.shape} -> {out_path}")
