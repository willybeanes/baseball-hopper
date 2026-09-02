import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "xR Philosophy — Baseball Hopper" };

export default function XrPage() {
  return (
    <IframeEmbed
      base="https://willybeanes.github.io/xr-philosophy/"
      initialSearch=""
      title="xR Philosophy"
    />
  );
}
