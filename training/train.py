import json
import math
import os
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


def _lr_at(step: int, total: int, peak: float, floor: float, schedule: str, warmup_frac: float) -> float:
    warmup_steps = max(1, int(total * warmup_frac))
    if step <= warmup_steps:
        return peak * step / warmup_steps
    progress = (step - warmup_steps) / max(1, total - warmup_steps)
    progress = min(max(progress, 0.0), 1.0)
    if schedule == "cosine":
        lr = floor + 0.5 * (peak - floor) * (1.0 + math.cos(math.pi * progress))
    elif schedule == "linear":
        lr = peak * (1.0 - progress)
    else:
        raise ValueError(f"Unknown LR_SCHEDULE: {schedule}")
    return max(lr, floor)


def train_year(year: int, device: str = "cuda") -> None:
    set_seed(SEED)

    schedule = os.environ.get("LR_SCHEDULE", "cosine")
    peak_lr = float(os.environ.get("LR_PEAK", LEARNING_RATE))
    floor_lr = float(os.environ.get("LR_FLOOR", 1e-5))
    warmup_frac = float(os.environ.get("LR_WARMUP_FRAC", 0.05))
    tb_tag = os.environ.get("TB_RUN_TAG", "")

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

    print(
        f"  LR schedule: {schedule} | peak={peak_lr:g} | floor={floor_lr:g} "
        f"| warmup_frac={warmup_frac:g} | total_batches={total_batches:,}",
        flush=True,
    )

    writer = None
    if _HAS_TB:
        run_name = f"year_{year}_{tb_tag}" if tb_tag else f"year_{year}"
        log_dir = TENSORBOARD_DIR / run_name
        log_dir.mkdir(parents=True, exist_ok=True)
        writer = SummaryWriter(log_dir=str(log_dir))

    tb_window = 1_000
    print_window = 10_000
    tb_running_loss = torch.zeros((), device=device)
    print_running_loss = torch.zeros((), device=device)
    for global_step in range(1, total_batches + 1):
        lr = _lr_at(global_step, total_batches, peak_lr, floor_lr, schedule, warmup_frac)
        for pg in optimizer.param_groups:
            pg["lr"] = lr

        center, context, negatives = sampler.sample_batch(BATCH_SIZE)

        loss = model(center, context, negatives)
        optimizer.zero_grad()
        loss.backward()
        optimizer.step()

        loss_detached = loss.detach()
        tb_running_loss += loss_detached
        print_running_loss += loss_detached

        if global_step % tb_window == 0:
            avg_loss = (tb_running_loss / tb_window).item()
            if writer is not None:
                writer.add_scalar("loss/train", avg_loss, global_step)
                writer.add_scalar("lr", lr, global_step)
            tb_running_loss.zero_()

        if global_step % print_window == 0:
            avg_loss = (print_running_loss / print_window).item()
            print(f"  Step {global_step:>8,} / {total_batches:,} | Loss {avg_loss:.4f} | LR {lr:.6f}", flush=True)
            print_running_loss.zero_()

    if writer is not None:
        writer.close()

    EMBEDDINGS_DIR.mkdir(parents=True, exist_ok=True)
    embeddings = model.center_embeddings.weight.detach().cpu().numpy()
    out_path = EMBEDDINGS_DIR / f"{year}.npy"
    np.save(out_path, embeddings)
    print(f"Year {year}: saved embeddings {embeddings.shape} -> {out_path}")
