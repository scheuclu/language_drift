import torch
import torch.nn as nn
import torch.nn.functional as F


class Word2VecSGNS(nn.Module):
    def __init__(self, vocab_size: int, embedding_dim: int):
        super().__init__()
        self.center_embeddings = nn.Embedding(vocab_size, embedding_dim, sparse=True)
        self.context_embeddings = nn.Embedding(vocab_size, embedding_dim, sparse=True)

        init_range = 0.5 / embedding_dim
        self.center_embeddings.weight.data.uniform_(-init_range, init_range)
        self.context_embeddings.weight.data.zero_()

    def forward(
        self,
        center: torch.Tensor,
        context: torch.Tensor,
        negatives: torch.Tensor,
    ) -> torch.Tensor:
        center_emb = self.center_embeddings(center)
        context_emb = self.context_embeddings(context)
        neg_emb = self.context_embeddings(negatives)

        pos_score = (center_emb * context_emb).sum(dim=1)
        neg_score = torch.bmm(neg_emb, center_emb.unsqueeze(2)).squeeze(2)

        pos_loss = -F.logsigmoid(pos_score).mean()
        neg_loss = -F.logsigmoid(-neg_score).mean()
        return pos_loss + neg_loss
