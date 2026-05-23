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
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
