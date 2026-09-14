import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "Percentile Compare — Baseball Hopper" };

export default async function ComparePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string>>;
}) {
  const params = await searchParams ?? {};
  const qs = new URLSearchParams(params).toString();
  return (
    <IframeEmbed
      base="/compare-app/index.html"
      initialSearch={qs ? `?${qs}` : ""}
      title="Percentile Compare"
    />
  );
}
