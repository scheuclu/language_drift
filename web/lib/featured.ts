export const FEATURED_WORDS = [
  "mask",
  "crypto",
  "lockdown",
  "woke",
  "zoom",
  "remote",
  "viral",
  "streaming",
  "isis",
  "snapchat",
  "trump",
  "bitcoin",
] as const;

export type FeaturedStory = {
  word: string;
  title: string;
  blurb: string;
  fromYear: number;
  toYear: number;
};

export const FEATURED_STORIES: FeaturedStory[] = [
  {
    word: "mask",
    title: "The COVID rewrite",
    blurb:
      "Before 2020, a mask was a disguise — gloves, cloak, hair. By 2021 it meant N95, mandate, and distancing.",
    fromYear: 2013,
    toYear: 2021,
  },
  {
    word: "crypto",
    title: "From cryptography to currency",
    blurb:
      "Mid-2010s 'crypto' lived next to keys, encryption, ciphers. By 2022 it was bitcoin, wallets, exchanges, NFTs.",
    fromYear: 2014,
    toYear: 2022,
  },
  {
    word: "lockdown",
    title: "A new everyday noun",
    blurb:
      "An emergency-protocol term in 2015 — schools, prisons, drills. In 2020 it became a household routine.",
    fromYear: 2015,
    toYear: 2021,
  },
  {
    word: "woke",
    title: "From verb to flag",
    blurb:
      "Past tense of 'wake' in 2013. By 2020 a political identifier that travels with mob, agenda, and outrage.",
    fromYear: 2013,
    toYear: 2023,
  },
];
