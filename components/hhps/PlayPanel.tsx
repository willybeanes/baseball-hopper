"use client";

import { useEffect, useRef, useState } from "react";
import type { EventPoint } from "@/lib/hhps";
import { resolvePlay, savantVideoUrl } from "@/lib/hhpsVideo";
import type { PlayInfo } from "@/lib/hhpsVideo";
import { eventColor, eventLabel } from "@/lib/hhpsEvents";

export interface PlayItem {
  ev: EventPoint;
  dist?: number; // inches from the clicked cube's center
}

const kindLabel = (ev: EventPoint) => { const l = eventLabel(ev); return l.charAt(0).toUpperCase() + l.slice(1); };
const kindColor = (ev: EventPoint) => eventColor(ev);

function PlayRow({ item }: { item: PlayItem }) {
  const { ev } = item;
  const hasIds = ev[7] != null && ev[8] != null && ev[9] != null;
  const [info, setInfo] = useState<PlayInfo | null | "loading">(hasIds ? "loading" : null);

  useEffect(() => {
    let cancelled = false;
    if (!hasIds) return;
    resolvePlay(ev).then((r) => { if (!cancelled) setInfo(r); });
    return () => { cancelled = true; };
  }, [ev, hasIds]);

  const url = info && info !== "loading" && info.playId ? savantVideoUrl(info.playId) : null;

  return (
    <div className="rounded-lg border border-[var(--rule)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: kindColor(ev) }}>{kindLabel(ev)}</span>
        {item.dist !== undefined && (
          <span className="text-[11px] text-[var(--dimmer)]">{item.dist.toFixed(1)}″ from the cube center</span>
        )}
      </div>

      {!hasIds && (
        <p className="mt-1 text-xs text-[var(--dim)]">No video link for this play yet (its game id is not in the data).</p>
      )}
      {hasIds && info === "loading" && <p className="mt-1 text-xs text-[var(--dim)]">Looking up the play…</p>}
      {hasIds && info === null && (
        <p className="mt-1 text-xs text-[var(--dim)]">Could not find this play in the MLB game feed.</p>
      )}
      {info && info !== "loading" && (
        <div className="mt-1 space-y-1">
          <p className="text-xs text-[var(--text)]">
            {info.batter} vs {info.pitcher} · {info.inning}
            {info.date ? ` · ${info.date}` : ""}
          </p>
          <p className="text-xs text-[var(--dim)]">
            {[info.pitchSpeed != null ? `${info.pitchSpeed.toFixed(1)} mph` : "", info.pitchType ?? "", info.pitchResult].filter(Boolean).join(" · ")}
          </p>
          {info.result && <p className="text-xs text-[var(--dimmer)]">{info.result}</p>}
          {url ? (
            <div className="pt-1">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block px-2.5 py-1 rounded-md text-xs font-medium border border-[var(--accent)] bg-[var(--accent)] text-white hover:opacity-90"
              >
                Watch video on Baseball Savant ↗
              </a>
            </div>
          ) : (
            <p className="text-xs text-[var(--dim)]">No video is listed for this pitch.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function PlayPanel({
  title, subtitle, items, onClose,
}: { title: string; subtitle?: string; items: PlayItem[]; onClose: () => void }) {
  const ref = useRef<HTMLElement | null>(null);
  useEffect(() => {
    ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [title, items]);

  return (
    <section ref={ref} className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-4 py-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-sm">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--dim)] mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onClose}
          className="shrink-0 px-2 py-0.5 rounded border border-[var(--panel-border)] text-xs text-[var(--dim)] hover:text-[var(--text)]"
          aria-label="Close"
        >
          Close
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-[var(--dim)]">No matching plays near this spot for the current split.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it, i) => (
            <PlayRow key={`${it.ev[7] ?? "x"}-${it.ev[8] ?? i}-${it.ev[9] ?? i}-${it.ev[0]}-${it.ev[1]}`} item={it} />
          ))}
        </div>
      )}
    </section>
  );
}
