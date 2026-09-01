export const metadata = { title: "Scatter Plot — Baseball Hopper" };

export default function ScatterPage() {
  return (
    <iframe
      src="https://fg-scatter.vercel.app/"
      className="flex-1 w-full border-0"
      style={{ height: "calc(100vh - 3rem)" }}
      title="Scatter Plot"
    />
  );
}
