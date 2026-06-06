"""Re-train TWEC slices from the ALREADY-TRAINED compass at a given LR/epochs.

The compass (shared context frame) is fixed; this only re-runs the per-year word
(center) vectors. Anchoring them harder (fewer epochs / lower LR) keeps stable
words pinned to the shared frame -> lower drift noise floor. Reuses
models/embeddings_twec/_compass.npz, so no 30-min compass recompute.

    uv run python scripts/twec_tune_slices.py --epochs 1 --lr 0.0025 \
        --out models/embeddings_twec_tuned --device cuda
"""
import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import torch

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from config import (
    BATCH_SIZE, EMBEDDING_DIM, NUM_NEGATIVE_SAMPLES, SEED,
    SUBSAMPLING_THRESHOLD, TOKENS_DIR, VOCAB_DIR, WINDOW_SIZE,
)
from pipeline.vocab import load_vocab
from training.dataset import GPUSkipGramSampler
from training.train import _lr_at, set_seed
from training.word2vec import Word2VecSGNS

YEARS = [2018, 2021, 2024]
COMPASS_NPZ = Path("models/embeddings_twec/_compass.npz")
FLOOR = 1e-5


def load_freqs(y):
    with open(TOKENS_DIR / f"{y}_freqs.json") as f:
        return json.load(f)


def load_tokens(y, cap):
    arr = np.load(TOKENS_DIR / f"{y}.npy", mmap_mode="r")
    arr = arr[:cap] if cap else arr
    return np.ascontiguousarray(arr)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--epochs", type=int, required=True)
    ap.add_argument("--lr", type=float, required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--cap", type=int, default=None)
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    V = len(vocab)
    id_to_word = {str(i): w for w, i in vocab.items()}

    cz = np.load(COMPASS_NPZ)
    ctx = torch.from_numpy(cz["context"]).to(a.device)
    ctr = torch.from_numpy(cz["center"]).to(a.device)
    print(f"loaded compass {ctx.shape} | epochs={a.epochs} lr={a.lr} cap={a.cap} -> {out}", flush=True)

    for y in YEARS:
        set_seed(SEED)
        toks = load_tokens(y, a.cap)
        sampler = GPUSkipGramSampler(
            token_ids=toks, vocab_size=V, window_size=WINDOW_SIZE,
            num_negatives=NUM_NEGATIVE_SAMPLES, word_freqs=load_freqs(y),
            id_to_word=id_to_word, subsample_threshold=SUBSAMPLING_THRESHOLD,
            device=a.device, seed=SEED,
        )
        del toks
        model = Word2VecSGNS(V, EMBEDDING_DIM).to(a.device)
        model.context_embeddings.weight.data.copy_(ctx)
        model.context_embeddings.weight.requires_grad_(False)   # frozen compass
        model.center_embeddings.weight.data.copy_(ctr)          # warm start
        opt = torch.optim.Adam([model.center_embeddings.weight], lr=a.lr)
        tb = (len(sampler) // BATCH_SIZE) * a.epochs
        print(f"[slice {y}] {tb:,} batches (subsampled {len(sampler):,})", flush=True)
        t0 = time.time(); running = torch.zeros((), device=a.device)
        for step in range(1, tb + 1):
            lr = _lr_at(step, tb, a.lr, FLOOR, "linear", 0.0)
            for pg in opt.param_groups:
                pg["lr"] = lr
            c, cx, ng = sampler.sample_batch(BATCH_SIZE)
            loss = model(c, cx, ng)
            opt.zero_grad(); loss.backward(); opt.step()
            running += loss.detach()
            if step % 10000 == 0:
                print(f"  [{y}] {step:,}/{tb:,} loss {(running/10000).item():.4f} "
                      f"lr {lr:.5f} ({time.time()-t0:.0f}s)", flush=True)
                running.zero_()
        np.save(out / f"{y}.npy", model.center_embeddings.weight.detach().cpu().numpy())
        print(f"[slice {y}] saved -> {out / f'{y}.npy'}", flush=True)
        del sampler, model
        torch.cuda.empty_cache()
    print("DONE", flush=True)


if __name__ == "__main__":
    main()
