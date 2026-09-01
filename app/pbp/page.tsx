export const metadata = { title: "Play-by-Play — Baseball Hopper" };

export default function PbpPage() {
  return (
    <iframe
      src="https://mlb-pbp.vercel.app/"
      className="flex-1 w-full border-0"
      style={{ height: "calc(100vh - 3rem)" }}
      title="MLB Play-by-Play"
    />
  );
}
