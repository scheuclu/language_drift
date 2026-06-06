import type { MetadataRoute } from "next";

// Live, linked routes only. (/w, /w/[word], /compare are added once their
// feature branches merge.)
export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://worddrift.xyz";
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/space`, lastModified, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/arith`, lastModified, changeFrequency: "monthly", priority: 0.7 },
  ];
}
