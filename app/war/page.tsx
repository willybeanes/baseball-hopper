import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "WAR Breakdown — Baseball Hopper" };

export default function WarPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const qs = searchParams ? new URLSearchParams(searchParams).toString() : "";
  return (
    <IframeEmbed
      base="/war-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="WAR Breakdown"
    />
  );
}
