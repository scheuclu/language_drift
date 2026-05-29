import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["dgx", "*.ts.net", "10.0.0.30"],
  async headers() {
    return [
      {
        source: "/data/:path*",
        headers: [
          {
            key: "Cache-Control",
            // Data files mutate at fixed paths (retrains, format changes), so they
            // must NOT be immutable — revalidate every load (cheap 304s via ETag).
            value: "public, max-age=0, must-revalidate",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
