export type Manifest = {
  years: number[];
  base_year: number;
  n_words: number;
  words: ManifestWord[];
};

export type ManifestWord = {
  w: string;
  f0: number;
  fm: number;
  d: number;
};

export type Neighbor = [string, number];

export type WordData = {
  w: string;
  y: number[];
  f: number[];
  d: number[];
  td: number;
  n: Neighbor[][];
};

export type DriftGallery = {
  top: ManifestWord[];
};
