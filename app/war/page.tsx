import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "WAR Breakdown — Baseball Hopper" };

export default async function WarPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = await searchParams ?? {};
  const qs = new URLSearchParams(params).toString();
  return (
    <IframeEmbed
      base="/war-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="WAR Breakdown"
    />
  );
}
