import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "Scatter Plot — Baseball Hopper" };

export default async function ScatterPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = await searchParams ?? {};
  const qs = new URLSearchParams(params).toString();
  return (
    <IframeEmbed
      base="/scatter-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="Scatter Plot"
    />
  );
}
