import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Static HTML tools — rewrite works cleanly (no /_next/ assets to break)
      { source: "/compare", destination: "https://player-compare-rho.vercel.app/" },
      { source: "/compare/:path*", destination: "https://player-compare-rho.vercel.app/:path*" },
      { source: "/ballot", destination: "https://allstar-ballot-2026.vercel.app/" },
      { source: "/ballot/:path*", destination: "https://allstar-ballot-2026.vercel.app/:path*" },
    ];
  },
};

export default nextConfig;
