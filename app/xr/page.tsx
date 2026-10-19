import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "xR Philosophy — Baseball Hopper" };

// The xR bot in willybeanes/xr-philosophy regenerates this page. Load it straight from
// GitHub Pages: proxying it through this site sent ~4 MB through Vercel on every view.
const XR_APP = "https://willybeanes.github.io/xr-philosophy/app.html";

export default function XrPage() {
  return (
    <IframeEmbed
      base={XR_APP}
      initialSearch=""
      title="xR Philosophy"
    />
  );
}
