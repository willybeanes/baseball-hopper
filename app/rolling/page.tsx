import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "Rolling Metric Chart — Baseball Hopper" };

export default function RollingPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const qs = searchParams ? new URLSearchParams(searchParams).toString() : "";
  return (
    <IframeEmbed
      base="https://fg-rolling.vercel.app/"
      initialSearch={qs ? `?${qs}` : ""}
      title="Rolling Metric Chart"
    />
  );
}
