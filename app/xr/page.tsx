import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "xR Philosophy — Baseball Hopper" };

export default function XrPage() {
  return (
    <IframeEmbed
      base="/xr-app/index.html"
      initialSearch=""
      title="xR Philosophy"
    />
  );
}
