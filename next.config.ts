import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      // Static HTML tools — rewrite works cleanly (no /_next/ assets to break)
      { source: "/compare", destination: "https://player-compare-rho.vercel.app/" },
      { source: "/compare/:path*", destination: "https://player-compare-rho.vercel.app/:path*" },
      { source: "/pbp", destination: "https://mlb-pbp.vercel.app/" },
      { source: "/pbp/:path*", destination: "https://mlb-pbp.vercel.app/:path*" },
      { source: "/ballot", destination: "https://allstar-ballot-2026.vercel.app/" },
      { source: "/ballot/:path*", destination: "https://allstar-ballot-2026.vercel.app/:path*" },
      { source: "/scatter", destination: "https://willybeanes.github.io/fg-scatter/" },
      { source: "/scatter/:path*", destination: "https://willybeanes.github.io/fg-scatter/:path*" },
      // fg-war has serverless api/ routes — proxy both HTML and API
      { source: "/war", destination: "https://fg-war.vercel.app/" },
      { source: "/war/:path*", destination: "https://fg-war.vercel.app/:path*" },
    ];
  },
};

export default nextConfig;
