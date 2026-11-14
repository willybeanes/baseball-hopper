"use client";

import { useState } from "react";

/** Hotlinked headshot (publication or Bluesky); falls back to initials if missing or the image fails. */
export default function VoterAvatar({ src, name }: { src: string | null; name: string }) {
  const [failed, setFailed] = useState(false);
  const words = name.trim().split(/\s+/);
  const initials = (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
  const box =
    "h-16 w-16 shrink-0 overflow-hidden rounded-full border border-[var(--panel-border)] bg-[var(--panel)] sm:h-[72px] sm:w-[72px]";
  if (!src || failed) {
    return (
      <div className={`${box} flex items-center justify-center text-[18px] font-semibold text-[var(--dim)]`} aria-hidden>
        {initials}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- hotlinked third-party image, not worth the optimizer
    <img
      src={src}
      alt={`${name} headshot`}
      className={`${box} object-cover`}
      loading="eager"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
