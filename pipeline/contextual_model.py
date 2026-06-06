"""Frozen transformer encoder for the contextual-drift pipeline.

Loads a frozen `bert-base-uncased` (or any `AutoModel`) with its *fast*
tokenizer and exposes `encode_windows`, which runs a bf16 `inference_mode`
forward over a batch of pre-tokenized word windows and returns the chosen
hidden-state layer together with the attention mask and a `word_ids` tensor
that maps every subword position back to its source word index.

Why a frozen encoder: it puts every year in one coordinate system directly, so
no Procrustes/TWEC alignment is needed downstream. Why the fast tokenizer's
`word_ids()`: it maps subwords -> words correctly for WordPiece/BPE/SP, unlike
the brittle `"##"`-stripping heuristic.

The hidden width is read from `model.config.hidden_size` -- never hardcode 768.
"""
from __future__ import annotations

import torch
from transformers import AutoModel, AutoTokenizer

from config import CONTEXTUAL_LAYER, CONTEXTUAL_MODEL


class ContextualEncoder:
    def __init__(
        self,
        model_name: str = CONTEXTUAL_MODEL,
        device: str = "cuda",
        layer: int = CONTEXTUAL_LAYER,
        dtype: torch.dtype = torch.bfloat16,
    ) -> None:
        self.model_name = model_name
        self.device = device
        self.layer = layer

        self.tokenizer = AutoTokenizer.from_pretrained(model_name, use_fast=True)
        if not self.tokenizer.is_fast:
            raise RuntimeError(
                f"{model_name} has no fast tokenizer; word_ids() alignment requires one."
            )

        self.model = AutoModel.from_pretrained(
            model_name,
            dtype=dtype,
            attn_implementation="sdpa",
        )
        self.model.eval().requires_grad_(False).to(device)

        self.hidden_dim: int = self.model.config.hidden_size
        # Truncate to the model's positional limit; 128-word windows rarely exceed it.
        self.max_subwords: int = min(
            getattr(self.model.config, "max_position_embeddings", 512), 512
        )

    @torch.inference_mode()
    def encode_windows(
        self, windows: list[list[str]]
    ) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        """Encode a batch of word windows.

        Args:
            windows: list of windows, each a list of lowercase word strings.

        Returns:
            hidden:     [B, L, H] hidden states of the configured layer (model dtype).
            attn_mask:  [B, L] attention mask (1 = real token).
            word_ids:   [B, L] long tensor; entry j is the source word index of
                        subword j, or -1 for special/padding tokens. On `device`.
        """
        enc = self.tokenizer(
            windows,
            is_split_into_words=True,
            padding=True,
            truncation=True,
            max_length=self.max_subwords,
            return_tensors="pt",
        )

        # word_ids must be read from the BatchEncoding before moving tensors.
        word_id_rows = [
            [-1 if w is None else w for w in enc.word_ids(i)]
            for i in range(len(windows))
        ]
        word_ids = torch.tensor(word_id_rows, dtype=torch.long, device=self.device)

        input_ids = enc["input_ids"].to(self.device)
        attn_mask = enc["attention_mask"].to(self.device)
        token_type = enc.get("token_type_ids")
        kwargs = {"input_ids": input_ids, "attention_mask": attn_mask}
        if token_type is not None:
            kwargs["token_type_ids"] = token_type.to(self.device)

        if self.layer == -1:
            out = self.model(**kwargs)
            hidden = out.last_hidden_state
        else:
            out = self.model(**kwargs, output_hidden_states=True)
            hidden = out.hidden_states[self.layer]

        return hidden, attn_mask, word_ids
