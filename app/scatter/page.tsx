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
      base="https://fg-scatter.vercel.app/"
      initialSearch={qs ? `?${qs}` : ""}
      title="Scatter Plot"
    />
  );
}
