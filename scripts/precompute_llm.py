"""Precompute the /llm page data — the *unbiased* version.

The story isn't "here are 25 words we know LLMs overuse." It's: rank EVERY word
in the corpus by how much more common it got after ChatGPT, choosing none of
them, and watch the machine register rise to the top of the list on its own.

Method (all from the raw per-year token frequencies, no embeddings, no curation):
  - candidate = clean lowercase word [3..20 chars] with max yearly count >= MIN_FREQ
  - baseline  = pooled per-million over 2018-2021 (pre-ChatGPT)
  - recent    = pooled per-million over 2023-2025 (post-ChatGPT)
  - lift      = log2((recent + K) / (baseline + K))   (K smooths rare words)
  - rank ALL candidates by lift -> risers (top) and fallers (bottom)

We also flag whether each riser was *already ordinary English* before ChatGPT
(baseline >= COMMON_PM per-million) vs brand-new coinage (chatgpt, nft, casino
brands). The eerie part of the LLM story is the first group: ordinary words that
were always available suddenly getting over-selected.

Two composite trajectories (normalized to each word's own 2018-21 level) let the
page date the shift without cherry-picking:
  - "top risers"  = mean trajectory of the top RISER_COMPOSITE_N risers
  - "typical"     = median trajectory across ALL candidates (the flat control)

Output: web/public/data/llm.json  (upload to Blob alongside the rest).
"""
import json
import math
import re
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
YEARS = list(range(2014, 2026))
BASE_YEARS = [2018, 2019, 2020, 2021]   # pre-ChatGPT
RECENT_YEARS = [2023, 2024, 2025]       # post-ChatGPT
CHATGPT_X = 2022.92                      # ChatGPT launched 2022-11-30

MIN_FREQ = 500          # max-yearly-count floor (the dropped-from-3k filter)
K = 1.0                 # per-million smoothing
COMMON_PM = 1.0         # baseline >= this => "already ordinary English"
COINAGE_PM = 0.1        # baseline <  this => "new coinage"
N_RISERS = 320          # how many risers to ship for the board
N_FALLERS = 120
RISER_COMPOSITE_N = 60  # register composite = mean of this many top register words
WORD_RE = re.compile(r"^[a-z]{3,20}$")

# Ridgeline: the distribution of every established word's frequency change,
# year by year, relative to the EARLIEST years. Shows the whole distribution
# fanning open over time (stable -> spreading) rather than any single word.
RIDGE_BASE_YEARS = [2014, 2015]
RIDGE_MIN_BASE_PM = 0.5           # only words already established in 2014-15
RIDGE_EPS = 0.05                  # per-million smoothing for the log ratio
RIDGE_LO, RIDGE_HI, RIDGE_NBINS = -2.5, 4.5, 64

# Labeled news/event words — used ONLY for the "spike vs step" example callout,
# never for the ranking or the headline claim.
EVENT_EXAMPLES = ["covid", "omicron", "lockdown", "quarantine", "ukraine"]

# Two categories surged even harder than the linguistic register — online
# gambling/casino SEO, and adult-spam. The web filling with that is a *different*
# story, so the register composite sets them aside. The ranking board still shows
# everything (these are tagged, not removed) — honesty lives in the full ranking.
GAMBLING = {
    "casino", "casinos", "gambling", "gamble", "gambler", "gamblers", "betting",
    "bet", "bets", "bettor", "bettors", "wager", "wagers", "wagering", "spins",
    "slot", "slots", "jackpot", "jackpots", "payout", "payouts", "paylines",
    "reels", "baccarat", "roulette", "blackjack", "poker", "lottery", "lotteries",
    "bonus", "bonuses", "bankroll", "winnings", "sportsbook", "sportsbooks",
    "bookmaker", "bookmakers", "igaming", "gaming", "gamstop", "megaways",
    "multipliers", "plinko", "rng", "rtp", "pokies", "togel", "gacor", "punters",
    "withdrawals", "deposit", "deposits", "staking", "skrill", "curacao",
    "mostbet", "leovegas", "bitstarz", "betwinner", "melbet", "sbobet", "betmgm",
    "aviator", "netent", "crushers", "bonanza", "toto",
}
ADULT = {
    "onlyfans", "omegle", "porn", "porno", "xxx", "nude", "nudes", "milf", "bbw",
    "sluts", "slut", "pussy", "tits", "cock", "horny", "swingers", "escort",
    "escorts", "hentai", "nsfw", "webcam", "camgirl", "fuck", "fucked", "fucking",
    "viagra", "prostitutes", "fag",
}
# Already-common words that surged for product/platform reasons unrelated to the
# linguistic register (crypto hype, app growth, supplement spam). Kept out of the
# register composite; still shown (tagged) in the ranking board.
TECH_PRODUCT = {
    "crypto", "cryptocurrencies", "cryptocurrency", "blockchain", "defi", "web3",
    "metaverse", "tiktok", "instagram", "gummies", "gummy", "vape", "vaping",
    "cbd", "kratom", "esg", "darknet", "iptv", "pickleball", "valorant",
    "cybersecurity", "scalability", "sustainability",
}


# Detokenization fragments / template cruft that pass the regex but aren't words.
JUNK = {
    "replydelete", "newer", "quot", "fml", "dhu", "lso", "ene", "dic", "ntn",
    "nsk", "abr", "youll", "couldnt", "ment", "uncategorized", "pingback",
    "permalink", "trackback", "nbsp", "amp", "wasnt", "didnt", "doesnt", "isnt",
    "hasnt", "arent", "thats", "whats", "dont", "cant", "ive", "youve", "theyre",
}


def category(word, base):
    if word in GAMBLING:
        return "gambling"
    if word in ADULT:
        return "adult"
    if word in TECH_PRODUCT:
        return "tech"
    if base < COINAGE_PM:
        return "coinage"
    if base >= COMMON_PM:
        return "register"
    return "other"


def main() -> None:
    print("loading per-year freqs...")
    freqs, tot = {}, {}
    for y in YEARS:
        d = json.load(open(ROOT / f"data/tokens/{y}_freqs.json"))
        freqs[y] = d
        tot[y] = sum(d.values())
        print(f"  {y}: {len(d):,} types, {tot[y]:,} tokens")

    yi = {y: i for i, y in enumerate(YEARS)}

    def pm_series(w):
        return [freqs[y].get(w, 0) / tot[y] * 1e6 for y in YEARS]

    # candidate set: clean words present somewhere with enough mass
    cand = set()
    for y in YEARS:
        for w, c in freqs[y].items():
            if c >= MIN_FREQ and WORD_RE.match(w) and w not in JUNK:
                cand.add(w)
    cand = sorted(cand)
    print(f"candidates (max yearly >= {MIN_FREQ}, clean): {len(cand):,}")

    base_den = sum(tot[y] for y in BASE_YEARS)
    rec_den = sum(tot[y] for y in RECENT_YEARS)

    rows = []
    for w in cand:
        base = sum(freqs[y].get(w, 0) for y in BASE_YEARS) / base_den * 1e6
        rec = sum(freqs[y].get(w, 0) for y in RECENT_YEARS) / rec_den * 1e6
        lift = math.log2((rec + K) / (base + K))
        rows.append((w, base, rec, lift))

    rows.sort(key=lambda r: -r[3])
    n = len(rows)

    def pack(w, base, rec, lift, rank):
        pm = pm_series(w)
        return {
            "w": w,
            "pm": [round(v, 2) for v in pm],
            "base": round(base, 2),
            "rec": round(rec, 2),
            "x": round(2 ** lift, 2),       # frequency multiple, post vs pre
            "rank": rank,
            "common": base >= COMMON_PM,    # was already ordinary English
            "cat": category(w, base),       # register | coinage | gambling | adult | other
        }

    risers = [pack(w, b, r, l, i + 1) for i, (w, b, r, l) in enumerate(rows[:N_RISERS])]
    fall_sorted = rows[::-1]  # most negative lift first
    fallers = [
        pack(w, b, r, l, n - i)
        for i, (w, b, r, l) in enumerate(fall_sorted[:N_FALLERS])
    ]

    # ---- composites (normalized to each word's own 2018-21 mean) ----
    base_idx = [yi[y] for y in BASE_YEARS]

    def norm_traj(words):
        acc = [0.0] * len(YEARS)
        m = 0
        for w in words:
            s = pm_series(w)
            b = sum(s[i] for i in base_idx) / len(base_idx)
            if b <= 0:
                continue
            for i in range(len(YEARS)):
                acc[i] += s[i] / b
            m += 1
        return [round(a / m, 3) for a in acc] if m else [0.0] * len(YEARS)

    def median_traj(words):
        cols = [[] for _ in YEARS]
        for w in words:
            s = pm_series(w)
            b = sum(s[i] for i in base_idx) / len(base_idx)
            if b <= 0:
                continue
            for i in range(len(YEARS)):
                cols[i].append(s[i] / b)
        out = []
        for c in cols:
            c.sort()
            out.append(round(c[len(c) // 2], 3) if c else 0.0)
        return out

    # register composite = the top RISER_COMPOSITE_N *register* words (ordinary
    # English, not gambling/adult/coinage), selected purely by lift.
    register_words = [w for (w, b, _, _) in rows if category(w, b) == "register"]
    register_top = register_words[:RISER_COMPOSITE_N]
    composite_register = norm_traj(register_top)
    composite_median = median_traj([r[0] for r in rows])
    # for honesty: how hard gambling-SEO surged (the web's other flood)
    gambling_words = [w for (w, b, _, _) in rows if category(w, b) == "gambling"][:60]
    composite_gambling = norm_traj(gambling_words)

    # event examples (whatever the data is; for the spike-vs-step callout)
    events = []
    for w in EVENT_EXAMPLES:
        if any(freqs[y].get(w, 0) for y in YEARS):
            s = pm_series(w)
            events.append({"w": w, "pm": [round(v, 2) for v in s]})

    # ---- ridgeline: distribution of per-word change vs 2014-15, per year ----
    ridge_base_idx = [yi[y] for y in RIDGE_BASE_YEARS]
    pm_mat = np.array([pm_series(w) for (w, *_ ) in rows], dtype=np.float64)  # (n,12)
    ridge_base = pm_mat[:, ridge_base_idx].mean(axis=1)                       # (n,)
    est = ridge_base >= RIDGE_MIN_BASE_PM
    lift_mat = np.log2((pm_mat[est] + RIDGE_EPS) / (ridge_base[est, None] + RIDGE_EPS))
    bins = np.linspace(RIDGE_LO, RIDGE_HI, RIDGE_NBINS + 1)
    centers = [round(0.5 * (bins[i] + bins[i + 1]), 3) for i in range(RIDGE_NBINS)]
    ridge_rows, spread = [], []
    for j in range(len(YEARS)):
        col = lift_mat[:, j]
        h, _ = np.histogram(col, bins=bins, density=True)
        ridge_rows.append([round(float(v), 4) for v in h])
        spread.append(round(float(np.mean(np.abs(col) > 1.0)), 4))  # share moved >2x either way
    ridge = {
        "base_years": RIDGE_BASE_YEARS,
        "n_words": int(est.sum()),
        "bins": centers,
        "rows": ridge_rows,     # one density row per YEARS entry
        "spread": spread,       # share of words >2x off their 2014-15 rate, per year
    }

    # ---- headline stats ----
    top100 = rows[:100]
    cats100 = [category(w, b) for (w, b, _, _) in top100]
    register_top100 = sum(1 for c in cats100 if c == "register")
    coinage_top100 = sum(1 for c in cats100 if c == "coinage")
    gambling_top100 = sum(1 for c in cats100 if c in ("gambling", "adult"))
    reg_lifts = sorted(2 ** l for (w, b, _, l) in top100 if category(w, b) == "register")
    med_reg_lift = reg_lifts[len(reg_lifts) // 2] if reg_lifts else 0.0
    # where the register composite sat before ChatGPT (flatness proof)
    pre_chatgpt = round(sum(composite_register[i] for i in base_idx) / len(base_idx), 2)

    out = {
        "years": YEARS,
        "chatgpt_x": CHATGPT_X,
        "n_ranked": n,
        "min_freq": MIN_FREQ,
        "common_pm": COMMON_PM,
        "risers": risers,
        "fallers": fallers,
        "ridge": ridge,
        "register_words": register_top,
        "composite_register": composite_register,
        "composite_register_n": len(register_top),
        "composite_median": composite_median,
        "composite_gambling": composite_gambling,
        "events": events,
        "stats": {
            "register_top100": register_top100,
            "coinage_top100": coinage_top100,
            "gambling_top100": gambling_top100,
            "med_reg_lift": round(med_reg_lift, 2),
            "register_pre_chatgpt": pre_chatgpt,
            "register_2025": round(composite_register[-1], 1),
            "median_2025": round(composite_median[-1], 2),
            "gambling_2025": round(composite_gambling[-1], 1),
            "ridge_spread_2025": round(spread[-1] * 100, 1),
            "ridge_n": int(est.sum()),
        },
    }

    p = ROOT / "web/public/data/llm.json"
    json.dump(out, open(p, "w"), separators=(",", ":"))
    print(f"\nwrote {p} ({p.stat().st_size:,} bytes)")
    print(f"  ranked {n:,} words; top riser {risers[0]['w']} x{risers[0]['x']}")
    print(f"  of top-100 risers: {register_top100} register, {coinage_top100} coinage, "
          f"{gambling_top100} gambling/adult")
    print(f"  median lift of a top-100 register word: x{med_reg_lift:.2f}")
    print(f"  composite_register 2014->2025: {composite_register[0]} -> {composite_register[-1]} "
          f"(pre-ChatGPT avg {pre_chatgpt})")
    print(f"  composite_median  2014->2025: {composite_median[0]} -> {composite_median[-1]}")
    print(f"  composite_gambling 2025: {composite_gambling[-1]}")
    print(f"  ridge: {ridge['n_words']:,} words; spread(>2x) "
          f"{spread[0]*100:.1f}% -> {spread[-1]*100:.1f}%")
    print(f"  register composite words: {', '.join(register_top[:30])} ...")
    print(f"  top-20 risers (all cats): {', '.join(r['w'] for r in risers[:20])}")


if __name__ == "__main__":
    main()
