import IframeEmbed from "@/components/IframeEmbed";

export const metadata = { title: "The Dingy — Baseball Hopper" };

export default function DingyPage() {
  return (
    <IframeEmbed
      base="https://the-dingy.vercel.app/"
      initialSearch=""
      title="The Dingy"
    />
  );
}
