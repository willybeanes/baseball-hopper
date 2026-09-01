"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { headshotUrl, resolveHeadshotId } from "@/lib/hitting-plus/headshot";

export default function Headshot({
  name,
  size,
  className,
}: {
  name: string;
  size: number;
  className?: string;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [id, setId] = useState<number | null>(null);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "300px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    resolveHeadshotId(name).then((resolved) => {
      if (!cancelled) setId(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [visible, name]);

  const initials = name.split(",")[0]?.trim()?.[0] ?? "?";

  return (
    <div
      ref={wrapRef}
      style={{ width: size, height: size, fontSize: Math.max(10, size * 0.38) }}
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--track)] font-bold text-[var(--dimmer)] ${className ?? ""}`}
      aria-hidden="true"
    >
      {id != null && !errored ? (
        <Image
          src={headshotUrl(id, Math.max(64, size * 2))}
          alt=""
          width={size}
          height={size}
          unoptimized
          onError={() => setErrored(true)}
          className="h-full w-full object-cover" style={{ objectPosition: "50% 10%" }}
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
