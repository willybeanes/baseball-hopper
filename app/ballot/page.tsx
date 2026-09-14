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
      base="/ballot-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="2026 All-Star Ballot"
    />
  );
}
