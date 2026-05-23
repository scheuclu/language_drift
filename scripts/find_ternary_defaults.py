"""Find target/anchor triples that fill the ternary triangle well.

Score = trajectory area in barycentric coords (a good triple has
visible motion + all three sims contribute).
"""
import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from config import ALIGNED_DIR, VOCAB_DIR, YEARS
from pipeline.vocab import load_vocab

SOFTMAX_T = 0.07
SQRT3_2 = math.sqrt(3) / 2
CORNERS = [(0.0, -1.0), (-SQRT3_2, 0.5), (SQRT3_2, 0.5)]


def bary(sims):
    m = max(sims)
    es = [math.exp((s - m) / SOFTMAX_T) for s in sims]
    total = sum(es)
    ws = [e / total for e in es]
    x = sum(w * c[0] for w, c in zip(ws, CORNERS))
    y = sum(w * c[1] for w, c in zip(ws, CORNERS))
    return x, y, ws


def trajectory(target, anchors, embeds, vocab):
    if target not in vocab:
        return None
    for a in anchors:
        if a not in vocab:
            return None
    tid = vocab[target]
    aids = [vocab[a] for a in anchors]
    pts = []
    sims_year = []
    for yi in range(len(YEARS)):
        tv = embeds[yi, tid]
        tn = np.linalg.norm(tv) + 1e-12
        sims = []
        for aid in aids:
            av = embeds[yi, aid]
            an = np.linalg.norm(av) + 1e-12
            sims.append(float(np.dot(tv, av) / (tn * an)))
        x, y, _ = bary(sims)
        pts.append((x, y))
        sims_year.append(sims)
    return pts, sims_year


def trajectory_score(pts):
    # bbox of trajectory in barycentric space
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    bbox_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    # total path length
    path_len = sum(
        math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1])
        for i in range(len(pts) - 1)
    )
    # spread = mean dist of points from centroid
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    spread = sum(math.hypot(p[0] - cx, p[1] - cy) for p in pts) / len(pts)
    return path_len, bbox_area, spread


def main():
    vocab = load_vocab(VOCAB_DIR / "vocab.json")
    embeds = np.stack(
        [np.load(ALIGNED_DIR / f"{year}.npy") for year in YEARS]
    ).astype(np.float32)
    print(f"loaded embeds: {embeds.shape}")

    candidates = [
        # (target, [anchor_a, anchor_b, anchor_c])
        ("mask", ["disguise", "virus", "protest"]),
        ("mask", ["disguise", "medical", "cloth"]),
        ("mask", ["costume", "surgical", "respirator"]),
        ("viral", ["disease", "internet", "popular"]),
        ("viral", ["infection", "video", "trend"]),
        ("crypto", ["currency", "scam", "technology"]),
        ("crypto", ["bitcoin", "fraud", "blockchain"]),
        ("crypto", ["money", "tech", "ponzi"]),
        ("remote", ["distant", "work", "control"]),
        ("cloud", ["sky", "storage", "weather"]),
        ("cloud", ["rain", "computing", "data"]),
        ("stream", ["river", "video", "data"]),
        ("woke", ["awake", "political", "aware"]),
        ("lockdown", ["prison", "pandemic", "freedom"]),
        ("zoom", ["camera", "meeting", "fast"]),
        ("bot", ["robot", "spam", "chat"]),
        ("trump", ["president", "businessman", "tower"]),
        ("biden", ["president", "democrat", "senator"]),
        ("mother", ["father", "career", "child"]),
        ("father", ["mother", "career", "son"]),
        ("feed", ["food", "news", "social"]),
        ("post", ["mail", "office", "social"]),
        ("tweet", ["bird", "message", "trump"]),
        ("vaccine", ["disease", "covid", "shot"]),
        ("woke", ["sleep", "aware", "leftist"]),
        ("gay", ["happy", "homosexual", "queer"]),
        ("queer", ["strange", "gay", "lgbt"]),
        ("normal", ["usual", "standard", "average"]),
        ("ai", ["intelligence", "computer", "human"]),
        ("chip", ["snack", "computer", "wood"]),
        ("nft", ["art", "crypto", "scam"]),
        ("metaverse", ["virtual", "facebook", "game"]),
        ("ghost", ["spirit", "abandoned", "story"]),
        ("twitter", ["bird", "social", "platform"]),
        ("queen", ["king", "royal", "drag"]),
    ]

    results = []
    for target, anchors in candidates:
        out = trajectory(target, anchors, embeds, vocab)
        if out is None:
            print(f"  skip {target}/{anchors}: oov")
            continue
        pts, sims_year = out
        path_len, bbox_area, spread = trajectory_score(pts)
        # avg sims across years, to flag triples where one anchor dominates
        avg_sims = [np.mean([sims_year[yi][i] for yi in range(len(YEARS))]) for i in range(3)]
        min_avg = min(avg_sims)
        results.append((target, anchors, path_len, bbox_area, spread, avg_sims, min_avg))

    # rank by composite: path length × bbox area × min_avg (penalize triples where one anchor is far weaker)
    results.sort(key=lambda r: -(r[2] * r[3] * max(r[6], 0.05)))

    print(f"\n{'target':12s} {'anchors':50s} {'pathlen':>8s} {'bbox':>8s} {'spread':>8s} {'min_avg':>8s}")
    print("-" * 110)
    for r in results[:25]:
        target, anchors, path_len, bbox_area, spread, avg_sims, min_avg = r
        anchor_str = ", ".join(anchors)
        print(
            f"{target:12s} {anchor_str:50s} {path_len:8.3f} {bbox_area:8.4f} {spread:8.3f} {min_avg:8.3f}",
        )

    # Print top result's full sim trajectory for inspection
    print("\n--- TOP RESULT YEAR-BY-YEAR ---")
    target, anchors, *_ = results[0]
    out = trajectory(target, anchors, embeds, vocab)
    pts, sims_year = out
    print(f"target={target}, anchors={anchors}")
    for yi, year in enumerate(YEARS):
        sims = sims_year[yi]
        print(f"  {year}: {anchors[0]}={sims[0]:.3f} {anchors[1]}={sims[1]:.3f} {anchors[2]}={sims[2]:.3f}")


if __name__ == "__main__":
    main()
