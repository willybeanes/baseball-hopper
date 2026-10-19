import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Old shared links on the vercel.app domain → custom domain.
      // /api is left alone so the cron and any external callers keep working.
      {
        source: "/:path((?!api/).*)",
        has: [{ type: "host", value: "baseball-hopper.vercel.app" }],
        destination: "https://baseballhopper.com/:path",
        permanent: true,
      },
      // /xr embeds the xR bot's page from GitHub Pages directly; old /xr-app links go there too.
      {
        source: "/xr-app",
        destination: "https://willybeanes.github.io/xr-philosophy/app.html",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
