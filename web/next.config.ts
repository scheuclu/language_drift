import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Data is hosted on Vercel Blob (see lib/data-source.ts), not served from
  // /public — so no /data cache headers are needed here.
  allowedDevOrigins: ["dgx", "*.ts.net", "10.0.0.30"],
};

export default nextConfig;
