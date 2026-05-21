import random

import numpy as np
import torch
from torch.utils.data import Dataset


class GPUSkipGramSampler:
    def __init__(
        self,
        token_ids: np.ndarray,
        vocab_size: int,
        window_size: int,
        num_negatives: int,
        word_freqs: dict[str, int],
        id_to_word: dict[str, str],
        subsample_threshold: float,
        device: str,
        seed: int,
    ):
        self.window_size = window_size
        self.num_negatives = num_negatives
        self.device = device

        freq_array = np.zeros(vocab_size, dtype=np.float64)
        for wid_str, word in id_to_word.items():
            wid = int(wid_str)
            if wid < vocab_size and word in word_freqs:
                freq_array[wid] = word_freqs[word]

        total = freq_array.sum()
        word_probs = freq_array / total if total > 0 else freq_array

        keep_prob = np.ones(vocab_size, dtype=np.float64)
        mask = word_probs > 0
        keep_prob[mask] = (
            np.sqrt(subsample_threshold / word_probs[mask]) + subsample_threshold / word_probs[mask]
        )
        keep_prob = np.minimum(keep_prob, 1.0)
        keep_prob[0] = 0.0

        rng = np.random.RandomState(seed)
        keep_mask = rng.random(len(token_ids)) < keep_prob[token_ids]
        subsampled = token_ids[keep_mask]

        self.tokens = torch.from_numpy(subsampled.astype(np.int64)).to(device)

        noise = np.power(freq_array, 0.75)
        noise[0] = 0.0
        noise_sum = noise.sum()
        noise_dist = noise / noise_sum if noise_sum > 0 else noise

        noise_table = torch.multinomial(
            torch.from_numpy(noise_dist).float(),
            num_samples=10_000_000,
            replacement=True,
        )
        self.noise_table = noise_table.to(device)

        self.generator = torch.Generator(device=device)
        self.generator.manual_seed(seed)

    def __len__(self) -> int:
        return int(self.tokens.shape[0])

    def sample_batch(
        self, batch_size: int
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        N = self.tokens.shape[0]
        W = self.window_size
        K = self.num_negatives

        center_pos = torch.randint(
            W, N - W, (batch_size,), device=self.device, generator=self.generator
        )
        offsets = torch.randint(
            1, W + 1, (batch_size,), device=self.device, generator=self.generator
        )
        signs = (
            torch.randint(
                0, 2, (batch_size,), device=self.device, generator=self.generator
            )
            * 2
            - 1
        )
        context_pos = center_pos + offsets * signs

        centers = self.tokens[center_pos]
        contexts = self.tokens[context_pos]

        neg_idx = torch.randint(
            0,
            self.noise_table.shape[0],
            (batch_size, K),
            device=self.device,
            generator=self.generator,
        )
        negatives = self.noise_table[neg_idx]

        return centers, contexts, negatives


class SkipGramDataset(Dataset):
    def __init__(
        self,
        token_ids: np.ndarray,
        vocab_size: int,
        window_size: int,
        num_negatives: int,
        word_freqs: dict[str, int],
        id_to_word: dict[int, str],
        subsample_threshold: float,
    ):
        self.window_size = window_size
        self.num_negatives = num_negatives
        self.vocab_size = vocab_size

        freq_array = np.zeros(vocab_size, dtype=np.float64)
        for word, wid in ((w, i) for w, i in id_to_word.items() if isinstance(i, str)):
            pass
        for wid_str, word in id_to_word.items():
            wid = int(wid_str)
            if wid < vocab_size and word in word_freqs:
                freq_array[wid] = word_freqs[word]

        total = freq_array.sum()
        word_probs = freq_array / total if total > 0 else freq_array

        keep_prob = np.ones(vocab_size, dtype=np.float64)
        mask = word_probs > 0
        keep_prob[mask] = (
            np.sqrt(subsample_threshold / word_probs[mask]) + subsample_threshold / word_probs[mask]
        )
        keep_prob = np.minimum(keep_prob, 1.0)
        keep_prob[0] = 0.0

        rng = np.random.RandomState(42)
        keep_mask = rng.random(len(token_ids)) < keep_prob[token_ids]
        self.tokens = token_ids[keep_mask].copy()

        noise = np.power(freq_array, 0.75)
        noise[0] = 0.0
        noise_sum = noise.sum()
        self.noise_dist = noise / noise_sum if noise_sum > 0 else noise

        self.noise_table = torch.multinomial(
            torch.from_numpy(self.noise_dist).float(),
            num_samples=10_000_000,
            replacement=True,
        ).numpy()

    def __len__(self) -> int:
        return len(self.tokens)

    def __getitem__(self, idx: int) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        center = self.tokens[idx]
        window = random.randint(1, self.window_size)

        start = max(0, idx - window)
        end = min(len(self.tokens), idx + window + 1)
        context_indices = list(range(start, idx)) + list(range(idx + 1, end))

        if not context_indices:
            ctx = center
        else:
            ctx = self.tokens[random.choice(context_indices)]

        neg_indices = np.random.randint(0, len(self.noise_table), size=self.num_negatives)
        negatives = self.noise_table[neg_indices]

        return (
            torch.tensor(center, dtype=torch.long),
            torch.tensor(ctx, dtype=torch.long),
            torch.tensor(negatives, dtype=torch.long),
        )
