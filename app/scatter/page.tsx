import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "Scatter Plot — Baseball Hopper" };

export default function ScatterPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const qs = searchParams ? new URLSearchParams(searchParams).toString() : "";
  return (
    <IframeEmbed
      base="/scatter-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="Scatter Plot"
    />
  );
}
