import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "xR Philosophy — Baseball Hopper" };

export default function XrPage() {
  return (
    <IframeEmbed
      base="/xr-app"
      initialSearch=""
      title="xR Philosophy"
    />
  );
}
