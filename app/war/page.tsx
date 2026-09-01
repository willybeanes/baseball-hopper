export const metadata = { title: "WAR Breakdown — Baseball Hopper" };

export default function WarPage() {
  return (
    <iframe
      src="https://fg-war.vercel.app/"
      className="flex-1 w-full border-0"
      style={{ height: "calc(100vh - 3rem)" }}
      title="WAR Breakdown"
    />
  );
}
