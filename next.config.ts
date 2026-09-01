import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      { source: "/ballot", destination: "https://allstar-ballot-2026.vercel.app/" },
      { source: "/ballot/:path*", destination: "https://allstar-ballot-2026.vercel.app/:path*" },
    ];
  },
};

export default nextConfig;
