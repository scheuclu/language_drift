from datasets import load_dataset


def main():
    crawls_2013 = [
        "CC-MAIN-2013-20",
        "CC-MAIN-2013-48",
    ]

    samples = []
    sample_size = 1000

    for crawl in crawls_2013:
        ds = load_dataset(
            "HuggingFaceFW/fineweb",
            name=crawl,
            streaming=True,
            split="train",
        )
        filtered = ds.filter(lambda x: x["language_score"] >= 0.65)
        for row in filtered.take(sample_size // len(crawls_2013)):
            samples.append(row)

    print(f"Collected {len(samples)} samples")
    for s in samples[:5]:
        print(f"\n--- {s['url']} ({s['date']}) score={s['language_score']:.2f} ---")
        print(s["text"][:300])


if __name__ == "__main__":
    main()
