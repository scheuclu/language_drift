"""Prototype: TWEC / compass-aligned diachronic embeddings on a 3-year subset.

Method (Di Carlo et al. 2019, "Temporal Word Embeddings with a Compass"),
mapped onto this repo's SGNS:
  1. Train a 'compass' = a full SGNS on ALL prototype years combined. Its
     CONTEXT matrix (syn1neg / context_embeddings) becomes the shared reference.
  2. For each year, freeze context := compass context, warm-start the word
     (center) vectors from the compass, and train ONLY the center vectors on
     that year's tokens.
Because every year is trained against the SAME frozen context space, the
resulting per-year word vectors live in one coordinate system -> NO Procrustes,
much lower drift noise floor.

Outputs models/embeddings_twec/{year}.npy (+ _compass.npz). Does NOT touch the
existing models/embeddings/ or models/aligned/.

    uv run python scripts/twec_prototype.py            # real prototype (~2-3h)
    uv run python scripts/twec_prototype.py --smoke     # ~2 min code-path check
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
    BATCH_SIZE,
    EMBEDDING_DIM,
    NUM_NEGATIVE_SAMPLES,
    SEED,
    SUBSAMPLING_THRESHOLD,
    TOKENS_DIR,
    VOCAB_DIR,
    WINDOW_SIZE,
)
from pipeline.vocab import load_vocab
from training.dataset import GPUSkipGramSampler
from training.train import _lr_at, set_seed
from training.word2vec import Word2VecSGNS

SCHEDULE, PEAK, FLOOR = "linear", 0.0075, 1e-5  # the schedule that won the eval


def load_freqs(year):
    with open(TOKENS_DIR / f"{year}_freqs.json") as f:
        return json.load(f)


def combined_freqs(years):
    out: dict[str, int] = {}
    for y in years:
        for w, c in load_freqs(y).items():
            out[w] = out.get(w, 0) + c
    return out


def load_tokens(year, cap=None):
    arr = np.load(TOKENS_DIR / f"{year}.npy", mmap_mode="r")
    arr = arr[:cap] if cap else arr
    return np.ascontiguousarray(arr)


def build_sampler(tokens, freqs, V, id_to_word, device):
    return GPUSkipGramSampler(
        token_ids=tokens, vocab_size=V, window_size=WINDOW_SIZE,
        num_negatives=NUM_NEGATIVE_SAMPLES, word_freqs=freqs, id_to_word=id_to_word,
        subsample_threshold=SUBSAMPLING_THRESHOLD, device=device, seed=SEED,
    )


def run_training(model, sampler, total_batches, params, tag, device):
    opt = torch.optim.Adam(params, lr=PEAK)
    t0 = time.time()
    running = torch.zeros((), device=device)
    for step in range(1, total_batches + 1):
        lr = _lr_at(step, total_batches, PEAK, FLOOR, SCHEDULE, 0.0)
        for pg in opt.param_groups:
            pg["lr"] = lr
        c, ctx, neg = sampler.sample_batch(BATCH_SIZE)
        loss = model(c, ctx, neg)
        opt.zero_grad()
        loss.backward()
        opt.step()
        running += loss.detach()
        if step % 10000 == 0:
            print(f"  [{tag}] {step:,}/{total_batches:,} loss {(running/10000).item():.4f} "
                  f"lr {lr:.5f} ({time.time()-t0:.0f}s)", flush=True)
            running.zero_()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true", help="tiny fast code-path check")
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()

    if a.smoke:
        years = [2018, 2021]
        out = Path("models/embeddings_twec_smoke")
        compass_cap, slice_cap = 5_000_000, 5_000_000
        compass_epochs, slice_epochs = 1, 1
    else:
        years = [2018, 2021, 2024]
        out = Path("models/embeddings_twec")
        compass_cap, slice_cap = 600_000_000, None  # compass capped; slices full 1B
        compass_epochs, slice_epochs = 1, 3
    out.mkdir(parents=True, exist_ok=True)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    V = len(vocab)
    id_to_word = {str(i): w for w, i in vocab.items()}
    print(f"vocab {V:,} | years {years} | compass_cap {compass_cap} ep {compass_epochs} "
          f"| slice_cap {slice_cap} ep {slice_epochs} -> {out}", flush=True)

    # ---- 1. compass: full SGNS on all years combined ----
    set_seed(SEED)
    print("[compass] loading + concatenating tokens...", flush=True)
    toks = np.concatenate([load_tokens(y, compass_cap) for y in years])
    print(f"[compass] combined tokens {len(toks):,}", flush=True)
    sampler = build_sampler(toks, combined_freqs(years), V, id_to_word, a.device)
    del toks
    print(f"[compass] subsampled {len(sampler):,}", flush=True)
    compass = Word2VecSGNS(V, EMBEDDING_DIM).to(a.device)
    tb = (len(sampler) // BATCH_SIZE) * compass_epochs
    print(f"[compass] {tb:,} batches", flush=True)
    run_training(compass, sampler, tb, compass.parameters(), "compass", a.device)
    compass_ctx = compass.context_embeddings.weight.detach().clone()
    compass_ctr = compass.center_embeddings.weight.detach().clone()
    np.savez(out / "_compass.npz",
             context=compass_ctx.cpu().numpy(), center=compass_ctr.cpu().numpy())
    print("[compass] saved", flush=True)
    del sampler, compass
    torch.cuda.empty_cache()

    # ---- 2. slices: freeze context = compass, train only center per year ----
    for y in years:
        set_seed(SEED)
        toks = load_tokens(y, slice_cap)
        sampler = build_sampler(toks, load_freqs(y), V, id_to_word, a.device)
        del toks
        model = Word2VecSGNS(V, EMBEDDING_DIM).to(a.device)
        model.context_embeddings.weight.data.copy_(compass_ctx)
        model.context_embeddings.weight.requires_grad_(False)   # FROZEN compass
        model.center_embeddings.weight.data.copy_(compass_ctr)  # warm start
        tb = (len(sampler) // BATCH_SIZE) * slice_epochs
        print(f"[slice {y}] {tb:,} batches (subsampled {len(sampler):,})", flush=True)
        run_training(model, sampler, tb, [model.center_embeddings.weight], f"slice{y}", a.device)
        emb = model.center_embeddings.weight.detach().cpu().numpy()
        np.save(out / f"{y}.npy", emb)
        print(f"[slice {y}] saved -> {out / f'{y}.npy'}", flush=True)
        del sampler, model
        torch.cuda.empty_cache()

    print("DONE", flush=True)


if __name__ == "__main__":
    main()
