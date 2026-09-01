"use client";

import { useMemo, useRef, useState } from "react";

interface GameLog {
  dates: string[];
  "Decision+": (number | null)[];
  "Timing+": (number | null)[];
  "Contact+": (number | null)[];
  "Power+": (number | null)[];
  "Hitting+": (number | null)[];
  "wOBA+": (number | null)[];
}

type MetricKey = "Hitting+" | "Decision+" | "Timing+" | "Contact+" | "Power+" | "wOBA+";

const METRICS: { key: MetricKey; color: string }[] = [
  { key: "Hitting+",  color: "#c0392c" },
  { key: "wOBA+",     color: "#1a1a1a" },
  { key: "Decision+", color: "#7fa0cb" },
  { key: "Timing+",   color: "#c9922f" },
  { key: "Contact+",  color: "#4a9e6b" },
  { key: "Power+",    color: "#9b6dbd" },
];

const W = 500, H = 160;
const ML = 36, MR = 12, MT = 10, MB = 28;
const CW = W - ML - MR, CH = H - MT - MB;
const Y_MIN = 60, Y_MAX = 160;

function yToSvg(v: number) {
  return MT + CH - ((v - Y_MIN) / (Y_MAX - Y_MIN)) * CH;
}

function buildPath(xs: number[], ys: (number | null)[]): string {
  let d = "";
  let pen = false;
  for (let i = 0; i < xs.length; i++) {
    const y = ys[i];
    if (y == null) { pen = false; continue; }
    const sy = yToSvg(y);
    if (!pen) { d += `M${xs[i]},${sy}`; pen = true; }
    else       { d += `L${xs[i]},${sy}`; }
  }
  return d;
}

export default function RollingChart({
  gamelog,
  loading = false,
}: {
  gamelog: Record<string, unknown> | null;
  loading?: boolean;
}) {
  const log = useMemo<GameLog | null>(() => {
    if (!gamelog || !("dates" in gamelog)) return null;
    return gamelog as unknown as GameLog;
  }, [gamelog]);
  const [active, setActive] = useState<Set<MetricKey>>(
    new Set(["Hitting+", "wOBA+"])
  );
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  function toggleMetric(k: MetricKey) {
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(k)) { if (next.size > 1) next.delete(k); }
      else next.add(k);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="mt-6">
        <SectionHeader />
        <div className="mt-4 flex h-[200px] items-center justify-center rounded-[10px] border border-[var(--rule)] bg-[var(--track)]">
          <span className="text-sm text-[var(--dimmer)]">Loading…</span>
        </div>
      </div>
    );
  }

  if (!log || log.dates.length < 5) {
    return (
      <div className="mt-6">
        <SectionHeader />
        <div className="mt-4 flex h-[120px] items-center justify-center rounded-[10px] border border-[var(--rule)] bg-[var(--track)]">
          <span className="text-sm text-[var(--dimmer)]">Not enough data for a rolling chart.</span>
        </div>
      </div>
    );
  }

  const n = log.dates.length;
  const xs = log.dates.map((_, i) => ML + (i / (n - 1)) * CW);

  // Month tick positions
  const monthTicks: { x: number; label: string }[] = [];
  let lastMonth = "";
  for (let i = 0; i < n; i++) {
    const m = log.dates[i].slice(0, 7); // "2026-04"
    if (m !== lastMonth) {
      lastMonth = m;
      const [, mo] = m.split("-");
      const label = new Date(`${m}-15`).toLocaleString("en-US", { month: "short" });
      monthTicks.push({ x: xs[i], label });
    }
  }

  // Y-axis gridlines at 80, 100, 120, 140
  const gridLines = [80, 100, 120, 140];

  const hover = hoverIdx != null ? hoverIdx : null;

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const relX = px - ML;
    const frac = relX / CW;
    const idx = Math.round(frac * (n - 1));
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)));
  }

  return (
    <div className="mt-6">
      <SectionHeader />

      {/* Toggle buttons */}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {METRICS.map(({ key, color }) => (
          <button
            key={key}
            onClick={() => toggleMetric(key)}
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-opacity"
            style={{
              background: active.has(key) ? color + "22" : "var(--track)",
              color: active.has(key) ? color : "var(--dimmer)",
              border: `1.5px solid ${active.has(key) ? color : "var(--rule)"}`,
            }}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: active.has(key) ? color : "var(--rule)" }}
            />
            {key}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div className="relative mt-3 overflow-hidden rounded-[10px] border border-[var(--rule)] bg-[var(--track)]">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          style={{ display: "block", overflow: "visible" }}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHoverIdx(null)}
        >
          {/* Grid */}
          {gridLines.map((v) => (
            <g key={v}>
              <line
                x1={ML} y1={yToSvg(v)} x2={ML + CW} y2={yToSvg(v)}
                stroke={v === 100 ? "var(--dimmer)" : "var(--rule)"}
                strokeWidth={v === 100 ? 1 : 0.75}
                strokeDasharray={v === 100 ? "none" : "3 3"}
              />
              <text
                x={ML - 5} y={yToSvg(v) + 4}
                textAnchor="end" fontSize={8}
                fill="var(--dimmer)"
                style={{ fontFamily: "inherit" }}
              >{v}</text>
            </g>
          ))}

          {/* Month ticks */}
          {monthTicks.map(({ x, label }) => (
            <g key={label + x}>
              <line x1={x} y1={MT + CH} x2={x} y2={MT + CH + 4}
                stroke="var(--rule)" strokeWidth={1} />
              <text x={x} y={MT + CH + 14} textAnchor="middle"
                fontSize={8} fill="var(--dimmer)"
                style={{ fontFamily: "inherit" }}
              >{label}</text>
            </g>
          ))}

          {/* Series lines */}
          {METRICS.filter(({ key }) => active.has(key)).map(({ key, color }) => (
            <path
              key={key}
              d={buildPath(xs, log[key])}
              fill="none"
              stroke={color}
              strokeWidth={key === "Hitting+" ? 2 : 1.5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.9}
            />
          ))}

          {/* Hover line + dots */}
          {hover != null && (
            <>
              <line
                x1={xs[hover]} y1={MT} x2={xs[hover]} y2={MT + CH}
                stroke="var(--dimmer)" strokeWidth={1} strokeDasharray="3 3"
              />
              {METRICS.filter(({ key }) => active.has(key)).map(({ key, color }) => {
                const v = log[key][hover];
                if (v == null) return null;
                return (
                  <circle key={key} cx={xs[hover]} cy={yToSvg(v)}
                    r={3} fill={color} stroke="var(--panel)" strokeWidth={1.5} />
                );
              })}
            </>
          )}
        </svg>

        {/* Tooltip */}
        {hover != null && (
          <div
            className="pointer-events-none absolute top-2 rounded-[8px] border border-[var(--rule)] bg-[var(--panel)] px-2.5 py-2 shadow-sm"
            style={{
              left: xs[hover] / W > 0.6
                ? `calc(${(xs[hover] / W) * 100}% - 120px)`
                : `calc(${(xs[hover] / W) * 100}% + 8px)`,
            }}
          >
            <div className="mb-1 text-[10px] text-[var(--dimmer)]">{log.dates[hover]}</div>
            {METRICS.filter(({ key }) => active.has(key)).map(({ key, color }) => {
              const v = log[key][hover];
              return (
                <div key={key} className="flex items-center gap-2 text-[11px]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[var(--dim)]">{key}</span>
                  <span className="ml-auto font-bold tabular-nums" style={{ color }}>
                    {v != null ? v.toFixed(1) : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        {/* 30-day label */}
        <div className="absolute bottom-1 right-2 text-[9px] text-[var(--dimmer)]">30-day rolling</div>
        <div className="absolute bottom-1 left-2 text-[9px] text-[var(--dimmer)]">wOBA+ = wOBA / lg avg × 100, no park adj</div>
      </div>
    </div>
  );
}

function SectionHeader() {
  return (
    <h2 className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--dim)]">
      Rolling grades
    </h2>
  );
}
