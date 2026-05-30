// Base URL for the precomputed data. Hosted on Vercel Blob under a versioned
// path (bump the version segment on each data regen so caches stay correct).
// Override at build time with NEXT_PUBLIC_DATA_BASE.
export const DATA_BASE =
  process.env.NEXT_PUBLIC_DATA_BASE ??
  "https://bi6fzils7tgrf7hj.public.blob.vercel-storage.com/data/v4";
