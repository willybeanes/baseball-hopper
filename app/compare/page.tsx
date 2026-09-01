import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "Percentile Compare — Baseball Hopper" };

export default function ComparePage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const qs = searchParams ? new URLSearchParams(searchParams).toString() : "";
  return (
    <IframeEmbed
      base="https://player-compare-rho.vercel.app/"
      initialSearch={qs ? `?${qs}` : ""}
      title="Percentile Compare"
    />
  );
}
