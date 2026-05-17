import numpy as np


def align_embeddings(
    reference: np.ndarray,
    target: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    ref_norms = np.linalg.norm(reference, axis=1, keepdims=True)
    tgt_norms = np.linalg.norm(target, axis=1, keepdims=True)

    ref_norms[ref_norms == 0] = 1.0
    tgt_norms[tgt_norms == 0] = 1.0

    ref_normed = reference / ref_norms
    tgt_normed = target / tgt_norms

    M = ref_normed.T @ tgt_normed
    U, _, Vt = np.linalg.svd(M)
    R = Vt.T @ U.T

    aligned = target @ R
    return aligned, R


def align_all_years(
    embeddings: dict[int, np.ndarray],
    reference_year: int,
) -> dict[int, np.ndarray]:
    ref = embeddings[reference_year]
    aligned = {reference_year: ref.copy()}

    for year, emb in sorted(embeddings.items()):
        if year == reference_year:
            continue
        aligned_emb, _ = align_embeddings(ref, emb)
        aligned[year] = aligned_emb

    return aligned
