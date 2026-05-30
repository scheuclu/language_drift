"""Full 12-year TWEC run at the validated config (SNR 5.1x in the prototype).

  1. compass: full SGNS on ALL years combined (capped per year), context frozen
     afterwards as the shared reference frame.
  2. slices: per year, freeze context := compass, warm-start word vectors from
     compass, train ONLY word vectors on that year's full 1B tokens, 3 epochs.

Output: models/embeddings_twec_full/{year}.npy (+ _compass.npz). These are
already in one coordinate system -> the Procrustes alignment stage is dropped.
Does NOT touch models/embeddings/ or models/aligned/.

RESUMABLE: skips the compass and any slice .npy already present, so an
interrupted run can simply be relaunched.

    uv run python scripts/twec_full.py            # full run (~10h)
    uv run python scripts/twec_full.py --smoke     # ~1 min code-path check
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
    SUBSAMPLING_THRESHOLD, TOKENS_DIR, VOCAB_DIR, WINDOW_SIZE, YEARS,
)
from pipeline.vocab import load_vocab
from training.dataset import GPUSkipGramSampler
from training.train import _lr_at, set_seed
from training.word2vec import Word2VecSGNS

SCHEDULE, PEAK, FLOOR = "linear", 0.0075, 1e-5  # the prototype's validated recipe


def load_freqs(y):
    with open(TOKENS_DIR / f"{y}_freqs.json") as f:
        return json.load(f)


def combined_freqs(years):
    out: dict[str, int] = {}
    for y in years:
        for w, c in load_freqs(y).items():
            out[w] = out.get(w, 0) + c
    return out


def load_tokens(y, cap):
    arr = np.load(TOKENS_DIR / f"{y}.npy", mmap_mode="r")
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
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("--device", default="cuda")
    a = ap.parse_args()

    if a.smoke:
        years = [2014, 2015]
        out = Path("models/embeddings_twec_full_smoke")
        compass_cap, slice_cap, compass_epochs, slice_epochs = 3_000_000, 3_000_000, 1, 1
    else:
        years = list(YEARS)
        out = Path("models/embeddings_twec_full")
        compass_cap, slice_cap, compass_epochs, slice_epochs = 300_000_000, None, 1, 3
    out.mkdir(parents=True, exist_ok=True)

    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    V = len(vocab)
    id_to_word = {str(i): w for w, i in vocab.items()}
    print(f"vocab {V:,} | years {years} -> {out}", flush=True)

    # ---- 1. compass (resumable) ----
    compass_path = out / "_compass.npz"
    if compass_path.exists():
        print("[compass] already present, loading", flush=True)
        cz = np.load(compass_path)
        compass_ctx = torch.from_numpy(cz["context"]).to(a.device)
        compass_ctr = torch.from_numpy(cz["center"]).to(a.device)
    else:
        set_seed(SEED)
        print(f"[compass] loading tokens (cap {compass_cap}/yr)...", flush=True)
        toks = np.concatenate([load_tokens(y, compass_cap) for y in years])
        print(f"[compass] combined {len(toks):,}", flush=True)
        sampler = build_sampler(toks, combined_freqs(years), V, id_to_word, a.device)
        del toks
        compass = Word2VecSGNS(V, EMBEDDING_DIM).to(a.device)
        tb = (len(sampler) // BATCH_SIZE) * compass_epochs
        print(f"[compass] subsampled {len(sampler):,} | {tb:,} batches", flush=True)
        run_training(compass, sampler, tb, compass.parameters(), "compass", a.device)
        compass_ctx = compass.context_embeddings.weight.detach().clone()
        compass_ctr = compass.center_embeddings.weight.detach().clone()
        np.savez(compass_path, context=compass_ctx.cpu().numpy(), center=compass_ctr.cpu().numpy())
        print("[compass] saved", flush=True)
        del sampler, compass
        torch.cuda.empty_cache()

    # ---- 2. slices (resumable per year) ----
    for y in years:
        ypath = out / f"{y}.npy"
        if ypath.exists():
            print(f"[slice {y}] already present, skip", flush=True)
            continue
        set_seed(SEED)
        toks = load_tokens(y, slice_cap)
        sampler = build_sampler(toks, load_freqs(y), V, id_to_word, a.device)
        del toks
        model = Word2VecSGNS(V, EMBEDDING_DIM).to(a.device)
        model.context_embeddings.weight.data.copy_(compass_ctx)
        model.context_embeddings.weight.requires_grad_(False)
        model.center_embeddings.weight.data.copy_(compass_ctr)
        tb = (len(sampler) // BATCH_SIZE) * slice_epochs
        print(f"[slice {y}] {tb:,} batches (subsampled {len(sampler):,})", flush=True)
        run_training(model, sampler, tb, [model.center_embeddings.weight], f"slice{y}", a.device)
        np.save(ypath, model.center_embeddings.weight.detach().cpu().numpy())
        print(f"[slice {y}] saved -> {ypath}", flush=True)
        del sampler, model
        torch.cuda.empty_cache()

    print("DONE", flush=True)


if __name__ == "__main__":
    main()
