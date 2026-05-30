// Curated drift stories told on the shared 2D space. Each story marks a small
// set of words and a "hero" word that migrates between clusters at snapYear —
// you watch it pull away from one neighborhood (away) and join another (toward).
// Every word/link below was validated against space.bin to actually move.

export type WordRole = "hero" | "toward" | "away" | "context";
export type StoryWord = { w: string; role: WordRole };
export type StoryChapter = { year: number; title: string; body: string };

export type Story = {
  id: string;
  kicker: string;
  title: string;
  blurb: string;
  snapYear: number;
  words: StoryWord[]; // first entry is the hero
  chapters: StoryChapter[];
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
];

export const ROLE_COLOR: Record<WordRole, string> = {
  hero: "#ffd45d",
  toward: "#5dffd9",
  away: "#ff5da2",
  context: "#8890a0",
};
