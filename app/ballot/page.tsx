import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "All-Star Ballot — Baseball Hopper" };

export default async function BallotPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = await searchParams ?? {};
  const qs = new URLSearchParams(params).toString();
  return (
    <IframeEmbed
      base="/ballot-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="2026 All-Star Ballot"
    />
  );
}
