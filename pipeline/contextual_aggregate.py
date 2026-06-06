"""On-the-fly contextual centroid accumulator.

Never stores per-token vectors. Holds three preallocated GPU tensors keyed by
the shared vocab id -- `sum[V,H]`, `sumsq[V,H]`, `count[V]` -- and folds each
forward-pass batch in with vectorized `index_add_`. Accumulation is fp32 even
though the forward runs bf16.

Pooling: **first-subword** (v1). For each word we take the hidden state of its
first WordPiece. Words that are stopwords / OOV (not in the shared vocab) /
shorter than MIN_WORD_LENGTH / all-digits are ignored (never accumulated, and
never folded into <UNK>=0).
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

import numpy as np
import torch

from config import CONTEXTUAL_USE_STOPWORDS, CONTEXTUAL_STOPWORDS, MIN_WORD_LENGTH


class ContextualAccumulator:
    def __init__(
        self,
        vocab: dict[str, int],
        hidden_dim: int,
        device: str = "cuda",
        use_stopwords: bool = CONTEXTUAL_USE_STOPWORDS,
    ) -> None:
        self.vocab = vocab
        self.V = len(vocab)
        self.H = hidden_dim
        self.device = device
        self.use_stopwords = use_stopwords
        self.stopwords = CONTEXTUAL_STOPWORDS if use_stopwords else frozenset()

        self.sum = torch.zeros((self.V, self.H), dtype=torch.float32, device=device)
        self.sumsq = torch.zeros((self.V, self.H), dtype=torch.float32, device=device)
        self.count = torch.zeros((self.V,), dtype=torch.float32, device=device)

        # Cache of word -> target id (or -1 if filtered), to avoid re-filtering
        # the same string every batch.
        self._target_cache: dict[str, int] = {}

    def _word_target(self, word: str) -> int:
        cached = self._target_cache.get(word, -2)
        if cached != -2:
            return cached
        if (
            len(word) < MIN_WORD_LENGTH
            or word.isdigit()
            or (self.use_stopwords and word in self.stopwords)
        ):
            tid = -1
        else:
            tid = self.vocab.get(word, -1)  # OOV -> -1 (never folded into <UNK>=0)
        self._target_cache[word] = tid
        return tid

    @torch.inference_mode()
    def add_batch(
        self,
        hidden: torch.Tensor,  # [B, L, H], model dtype
        word_ids: torch.Tensor,  # [B, L] long, -1 for special/pad
        windows: list[list[str]],  # the B source word-windows
    ) -> int:
        """Fold one forward-pass batch into the accumulators. Returns #observations added."""
        B, L = word_ids.shape

        # First subword of each word = position where word_ids changes (and is real).
        shifted = torch.full_like(word_ids, -2)
        shifted[:, 1:] = word_ids[:, :-1]
        is_first = (word_ids != shifted) & (word_ids >= 0)

        # Per-word target ids, padded to the batch's longest window.
        w_max = max(len(w) for w in windows)
        word_targets = torch.full((B, w_max), -1, dtype=torch.long, device=self.device)
        for b, win in enumerate(windows):
            row = [self._word_target(w) for w in win]
            if row:
                word_targets[b, : len(row)] = torch.tensor(row, device=self.device)

        # Gather each subword position's word target, keep only first subwords.
        wid_clamped = word_ids.clamp(min=0)
        gathered = torch.gather(word_targets, 1, wid_clamped)  # [B, L]
        target = torch.where(is_first, gathered, torch.full_like(gathered, -1))

        flat_target = target.reshape(-1)
        valid = flat_target >= 0
        if not bool(valid.any()):
            return 0

        idx = flat_target[valid]
        h = hidden.reshape(-1, self.H).float()[valid]  # fp32 accumulation

        self.sum.index_add_(0, idx, h)
        self.sumsq.index_add_(0, idx, h * h)
        self.count += torch.bincount(idx, minlength=self.V).float()
        return int(idx.shape[0])

    def to_numpy(self) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
        return (
            self.sum.cpu().numpy(),
            self.sumsq.cpu().numpy(),
            self.count.cpu().numpy(),
        )

    def save_state(self, path: Path) -> None:
        """Atomic npz write of sum/sumsq/count (resumable partial state)."""
        path = Path(path)
        path.parent.mkdir(parents=True, exist_ok=True)
        s, sq, c = self.to_numpy()
        fd, tmp = tempfile.mkstemp(dir=path.parent, suffix=".tmp.npz")
        os.close(fd)
        np.savez(tmp, sum=s, sumsq=sq, count=c)
        # np.savez appends .npz to a path without the suffix; mkstemp already has it.
        os.replace(tmp, path)

    def load_state(self, path: Path) -> None:
        z = np.load(path)
        self.sum = torch.from_numpy(z["sum"]).to(self.device)
        self.sumsq = torch.from_numpy(z["sumsq"]).to(self.device)
        self.count = torch.from_numpy(z["count"]).to(self.device)
