// Curated drift stories told on the shared 2D space. Each story marks a small
// set of words and a "hero" word that migrates between clusters at snapYear —
// you watch it pull away from one neighborhood (away) and join another (toward).
// Every word/link below was validated against space.bin to actually move.

export type WordRole = "hero" | "toward" | "away" | "context";
export type StoryWord = { w: string; role: WordRole };
export type StoryChapter = { year: number; title: string; body: string };

// "migration": a hero word moves between clusters (watch position).
// "glow": a whole cluster brightens over time (watch intensity). In glow stories
// every word is tinted with `accent`; role "hero" words also get a label.
export type StoryMode = "migration" | "glow";

export type Story = {
  id: string;
  kicker: string;
  title: string;
  blurb: string;
  snapYear: number;
  words: StoryWord[]; // first entry is the hero (migration) / labeled exemplars (glow)
  chapters: StoryChapter[];
  mode?: StoryMode; // default "migration"
  accent?: string; // glow only: cluster color
};

export const STORIES: Story[] = [
  {
    id: "crypto",
    kicker: "2017",
    title: "Crypto left the keys.",
    blurb:
      "“Crypto” spent the early 2010s as a branch of mathematics. Then Bitcoin pulled it clean out of the security lab.",
    snapYear: 2017,
    words: [
      { w: "crypto", role: "hero" },
      { w: "encryption", role: "away" },
      { w: "cipher", role: "away" },
      { w: "bitcoin", role: "toward" },
      { w: "token", role: "toward" },
    ],
    chapters: [
      {
        year: 2014,
        title: "A branch of mathematics",
        body: "In 2014 “crypto” meant cryptography. It sits with encryption, ciphers, keys — the vocabulary of security researchers.",
      },
      {
        year: 2017,
        title: "The year it flipped",
        body: "Bitcoin's first mania yanks the word out of the math department. In a single year it lets go of encryption and snaps onto bitcoin and token.",
      },
      {
        year: 2022,
        title: "A market, not a method",
        body: "By 2022 “crypto” is coins and wallets and exchanges. The cryptographers had to start saying “cryptography” just to be understood.",
      },
    ],
  },
  {
    id: "distancing",
    kicker: "2020",
    title: "Distancing stopped being a stance.",
    blurb:
      "For most of the decade you distanced yourself from an idea. In one spring it became a number of feet.",
    snapYear: 2020,
    words: [
      { w: "distancing", role: "hero" },
      { w: "idea", role: "away" },
      { w: "pandemic", role: "toward" },
      { w: "quarantine", role: "toward" },
      { w: "lockdown", role: "toward" },
    ],
    chapters: [
      {
        year: 2014,
        title: "Something you did with ideas",
        body: "Through the 2010s you distanced yourself from a belief, a claim, a person. The word lives among abstractions — it's something minds do.",
      },
      {
        year: 2020,
        title: "Six feet, overnight",
        body: "In spring 2020 the word is dragged out of the head and into the street. It drops “idea” and fuses with pandemic, quarantine, lockdown.",
      },
      {
        year: 2025,
        title: "It never came back",
        body: "Most words drift and partly return. This one didn't — five years on, “distancing” is still measured in feet, not arguments.",
      },
    ],
  },
  {
    id: "ai",
    kicker: "2023",
    title: "AI found a new partner.",
    blurb:
      "“AI” was an academic field for a decade. Then a chatbot shipped and the word changed employers.",
    snapYear: 2023,
    words: [
      { w: "ai", role: "hero" },
      { w: "model", role: "context" },
      { w: "intelligence", role: "context" },
      { w: "gpt", role: "toward" },
      { w: "generative", role: "toward" },
    ],
    chapters: [
      {
        year: 2014,
        title: "A research discipline",
        body: "Across the 2010s “AI” keeps company with models, algorithms, intelligence — a field studied in labs and papers.",
      },
      {
        year: 2023,
        title: "Generative everything",
        body: "ChatGPT lands and “AI” snaps onto gpt and generative. The word stops naming a field and starts naming a product.",
      },
      {
        year: 2025,
        title: "The default meaning",
        body: "By 2025, say “AI” and people hear a chatbot. The older senses are still there — just no longer the first thing you reach for.",
      },
    ],
  },
  {
    id: "corona",
    kicker: "2020",
    title: "Corona was a beer.",
    blurb:
      "An ordinary, sunny word — a drink, a halo of light. A virus took its name and never gave it back.",
    snapYear: 2020,
    words: [
      { w: "corona", role: "hero" },
      { w: "coronavirus", role: "toward" },
      { w: "virus", role: "toward" },
      { w: "pandemic", role: "toward" },
    ],
    chapters: [
      {
        year: 2014,
        title: "A drink with a lime",
        body: "Until 2019 “corona” meant the beer, or the sun's halo. A sunny, unremarkable word sitting nowhere near disease.",
      },
      {
        year: 2020,
        title: "Renamed by a virus",
        body: "In 2020 the word collapses onto coronavirus, virus, pandemic — and stops smelling like a beer entirely.",
      },
      {
        year: 2025,
        title: "Still infected",
        body: "Years on, the word hasn't recovered its old life. The disease kept the name.",
      },
    ],
  },

  // ---- glow stories: a whole region brightens (watch intensity, not motion) ----
  {
    id: "gambling",
    mode: "glow",
    accent: "#ff5da2",
    kicker: "2021 →",
    title: "The casino floods in.",
    blurb:
      "One tight knot of the map — casino, slots, betting, jackpot — that the SEO spam machine set on fire. Drag forward and watch it ignite.",
    snapYear: 2021,
    words: [
      { w: "casino", role: "hero" },
      { w: "slots", role: "hero" },
      { w: "betting", role: "hero" },
      { w: "jackpot", role: "hero" },
      { w: "bonus", role: "hero" },
      { w: "casinos", role: "context" }, { w: "bet", role: "context" },
      { w: "bets", role: "context" }, { w: "slot", role: "context" },
      { w: "jackpots", role: "context" }, { w: "bonuses", role: "context" },
      { w: "spins", role: "context" }, { w: "wager", role: "context" },
      { w: "wagering", role: "context" }, { w: "gambling", role: "context" },
      { w: "poker", role: "context" }, { w: "roulette", role: "context" },
      { w: "payout", role: "context" }, { w: "payouts", role: "context" },
      { w: "bettors", role: "context" }, { w: "blackjack", role: "context" },
      { w: "baccarat", role: "context" },
    ],
    chapters: [
      {
        year: 2014,
        title: "A quiet corner",
        body: "casino, slots, betting, jackpot — real words, modestly used, sitting in one dense little pocket of the map.",
      },
      {
        year: 2021,
        title: "The machine finds it",
        body: "Affiliate spam and auto-spun “best online casino” pages start flooding Common Crawl. The corner begins to glow.",
      },
      {
        year: 2025,
        title: "On fire",
        body: "These words are roughly 12× more common than in 2014 — a whole patch of the web's vocabulary is now machine-spun gambling copy.",
      },
    ],
  },
  {
    id: "ai-slop",
    mode: "glow",
    accent: "#ffd45d",
    kicker: "2023 →",
    title: "The chatbot register lights up.",
    blurb:
      "delve, seamless, intricate, robust — ordinary words language models reach for. Flat for eight years, then the whole neighborhood ignites at once.",
    snapYear: 2023,
    words: [
      { w: "delve", role: "hero" },
      { w: "seamless", role: "hero" },
      { w: "intricate", role: "hero" },
      { w: "robust", role: "hero" },
      { w: "leverage", role: "hero" },
      { w: "holistic", role: "context" }, { w: "tapestry", role: "context" },
      { w: "underscores", role: "context" }, { w: "elevate", role: "context" },
      { w: "realm", role: "context" }, { w: "nuanced", role: "context" },
      { w: "meticulous", role: "context" }, { w: "showcasing", role: "context" },
      { w: "garner", role: "context" }, { w: "captivating", role: "context" },
      { w: "unwavering", role: "context" }, { w: "testament", role: "context" },
      { w: "multifaceted", role: "context" }, { w: "navigating", role: "context" },
      { w: "fostering", role: "context" }, { w: "crucial", role: "context" },
      { w: "pivotal", role: "context" },
    ],
    chapters: [
      {
        year: 2014,
        title: "Ordinary English",
        body: "These are normal words, evenly used. Nothing distinguishes this patch of the map from any other.",
      },
      {
        year: 2022,
        title: "Still nothing",
        body: "Eight years in, the neighborhood is exactly as bright as it was. No event has touched it.",
      },
      {
        year: 2025,
        title: "All at once",
        body: "After ChatGPT the whole cluster lights up together — the words the models over-reach for, now ~5× their pre-2022 rate.",
      },
    ],
  },
  {
    id: "coins",
    mode: "glow",
    accent: "#5dd5e8",
    kicker: "2021 →",
    title: "Money moves on-chain.",
    blurb:
      "bitcoin, crypto, wallet, token, defi — a niche technical pocket that two manias turned into a permanent bright patch.",
    snapYear: 2021,
    words: [
      { w: "bitcoin", role: "hero" },
      { w: "crypto", role: "hero" },
      { w: "wallet", role: "hero" },
      { w: "token", role: "hero" },
      { w: "defi", role: "hero" },
      { w: "tokens", role: "context" }, { w: "wallets", role: "context" },
      { w: "staking", role: "context" },
    ],
    chapters: [
      {
        year: 2014,
        title: "Niche and technical",
        body: "bitcoin, wallet, token — a small, faint pocket, the vocabulary of early adopters.",
      },
      {
        year: 2021,
        title: "Two manias",
        body: "The 2017 and 2021 booms pour writing into this corner — exchanges, coins, “to the moon.”",
      },
      {
        year: 2025,
        title: "A permanent patch",
        body: "It never went dark again — roughly 9× its 2014 brightness, a fixed feature of the map now.",
      },
    ],
  },
];

export const ROLE_COLOR: Record<WordRole, string> = {
  hero: "#ffd45d",
  toward: "#5dffd9",
  away: "#ff5da2",
  context: "#8890a0",
};
