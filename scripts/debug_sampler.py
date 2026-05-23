"""Diagnostic: probe the new GPU sampler + first 100 training steps for year 2013."""
import json
import sys
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    BATCH_SIZE,
    EMBEDDING_DIM,
    LEARNING_RATE,
    NUM_NEGATIVE_SAMPLES,
    SEED,
    SUBSAMPLING_THRESHOLD,
    TOKENS_DIR,
    VOCAB_DIR,
    WINDOW_SIZE,
)
from pipeline.vocab import load_vocab
from training.dataset import GPUSkipGramSampler
from training.train import set_seed
from training.word2vec import Word2VecSGNS


def main():
    device = "cuda"
    set_seed(SEED)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    vocab_size = len(vocab)
    id_to_word = {str(v): k for k, v in vocab.items()}
    inv_vocab = {int(k): v for k, v in id_to_word.items()}

    with open(TOKENS_DIR / "2013_freqs.json") as f:
        word_freqs = json.load(f)

    token_ids = np.load(TOKENS_DIR / "2013.npy")
    print(f"raw tokens: {len(token_ids):,}, dtype={token_ids.dtype}")

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
    print(f"subsampled tokens on GPU: {len(sampler):,}, dtype={sampler.tokens.dtype}")
    print(f"noise table on GPU: {sampler.noise_table.shape}, dtype={sampler.noise_table.dtype}")

    centers, contexts, negatives = sampler.sample_batch(8)
    print("\n=== first batch (8 pairs) ===")
    print(f"centers shape={tuple(centers.shape)} dtype={centers.dtype}")
    print(f"contexts shape={tuple(contexts.shape)} dtype={contexts.dtype}")
    print(f"negatives shape={tuple(negatives.shape)} dtype={negatives.dtype}")
    print(f"centers min/max: {centers.min().item()}/{centers.max().item()}")
    print(f"contexts min/max: {contexts.min().item()}/{contexts.max().item()}")
    print(f"negatives min/max: {negatives.min().item()}/{negatives.max().item()}")
    print(f"vocab_size: {vocab_size}")

    centers_cpu = centers.cpu().tolist()
    contexts_cpu = contexts.cpu().tolist()
    negatives_cpu = negatives.cpu().tolist()
    for i in range(8):
        cw = inv_vocab.get(centers_cpu[i], "?")
        xw = inv_vocab.get(contexts_cpu[i], "?")
        nw = [inv_vocab.get(n, "?") for n in negatives_cpu[i]]
        print(f"  center={cw!r}  context={xw!r}  negs={nw}")

    print("\n=== correlation check: are centers/contexts statistically close in the token stream? ===")
    Ntest = 50_000
    centers_b, contexts_b, _ = sampler.sample_batch(Ntest)
    same_word = (centers_b == contexts_b).float().mean().item()
    print(f"fraction of pairs where center == context: {same_word:.4f}")
    print(f"  (high if windows accidentally include idx itself; should be ~0 for distinct positions)")

    for trial_lr in (0.025, 0.005, 0.001):
        print(f"\n=== first 500 training steps with LR={trial_lr} ===")
        set_seed(SEED)
        model = Word2VecSGNS(vocab_size, EMBEDDING_DIM).to(device)
        optimizer = torch.optim.Adam(model.parameters(), lr=trial_lr)

        for step in range(1, 501):
            center, context, neg = sampler.sample_batch(BATCH_SIZE)
            loss = model(center, context, neg)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            if step in (1, 5, 10, 50, 100, 200, 300, 400, 500):
                print(f"  step {step:4d}  loss {loss.item():.4f}")


if __name__ == "__main__":
    main()
