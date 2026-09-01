export const metadata = { title: "Percentile Compare — Baseball Hopper" };

export default function ComparePage({
  searchParams,
}: {
  searchParams?: Record<string, string>;
}) {
  const base = "https://player-compare-rho.vercel.app/";
  const params = searchParams ? new URLSearchParams(searchParams).toString() : "";
  const src = params ? `${base}?${params}` : base;

  return (
    <iframe
      src={src}
      className="flex-1 w-full border-0"
      style={{ height: "calc(100vh - 3rem)" }}
      title="Percentile Compare"
    />
  );
}
