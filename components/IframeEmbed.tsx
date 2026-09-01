"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

export default function IframeEmbed({
  base,
  initialSearch,
  title,
}: {
  base: string;
  initialSearch: string;
  title: string;
}) {
  const router = useRouter();
  const src = initialSearch ? `${base}${initialSearch}` : base;

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.data?.type !== "bh:urlSync") return;
      const search: string = e.data.search ?? "";
      const next = search ? `${window.location.pathname}${search}` : window.location.pathname;
      window.history.replaceState(null, "", next);
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  return (
    <iframe
      src={src}
      className="flex-1 w-full border-0"
      style={{ height: "calc(100vh - 3rem)" }}
      title={title}
    />
  );
}
