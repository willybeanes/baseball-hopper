import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "All-Star Ballot — Baseball Hopper" };

export default function BallotPage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const qs = searchParams ? new URLSearchParams(searchParams).toString() : "";
  return (
    <IframeEmbed
      base="https://allstar-ballot-2026.vercel.app/"
      initialSearch={qs ? `?${qs}` : ""}
      title="2026 All-Star Ballot"
    />
  );
}
