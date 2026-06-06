import type { MetadataRoute } from "next";

// Installable PWA manifest. Next auto-links this at /manifest.webmanifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WordDrift",
    short_name: "WordDrift",
    description: "Watching English change, 2014–2025.",
    start_url: "/",
    display: "standalone",
    background_color: "#07080c",
    theme_color: "#07080c",
    icons: [
      { src: "/icon.svg", type: "image/svg+xml", sizes: "any" },
      { src: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { src: "/icon-512.png", type: "image/png", sizes: "512x512", purpose: "maskable" },
    ],
  };
}
