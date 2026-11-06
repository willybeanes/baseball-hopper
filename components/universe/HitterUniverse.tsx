"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SearchBox from "@/components/hitting-plus/SearchBox";
import { formatName, ordinal } from "@/lib/hitting-plus/metrics";
import type { Player } from "@/lib/hitting-plus/types";

interface Coord {
  key: string;
  label: string;
  unit: string;
  digits: number;
  low: string;
  high: string;
  /** swing, shape and stance count toward closeness. grade is shown for reference and never counts. */
  group: Group;
  mean: number;
  sd: number;
  steady: number | null;
}

type Group = "swing" | "shape" | "stance" | "grade";
type Bats = "L" | "R" | "S";
type RawRow = [number, string, number, number | null, number[], (number | null)[], (number | null)[], Bats | null];

interface UniverseJson {
  generated: string;
  map_kept: number;
  /** Frames each season's average launch sits from the three-season average. Taken out before comparing hitters. */
  launch_shift: Record<string, number>;
  coords: Coord[];
  rows: RawRow[];
}

interface Row {
  i: number;
  mlbam: number;
  name: string;
  season: number;
  hitting: number | null;
  xyz: number[];
  raw: (number | null)[];
  pct: (number | null)[];
  z: (number | null)[];
  bats: Bats | null;
}

const SEASONS = [2026, 2025, 2024];
const SEASON_COLOR: Record<number, string> = { 2026: "#3f6495", 2025: "#7f9abd", 2024: "#b9c5d4" };
const NEIGHBORS = 10;
const SIDES = [
  { key: "all", label: "Both" },
  { key: "L", label: "Lefties" },
  { key: "R", label: "Righties" },
] as const;
type Side = (typeof SIDES)[number]["key"];
const BATS_LABEL: Record<Bats, string> = { L: "Bats left", R: "Bats right", S: "Switch hitter" };
// Switch hitters bat from both sides, so they stay in either view.
const onSide = (r: Row, side: Side) => side === "all" || r.bats === side || r.bats === "S";
// Below this, a coordinate moves too much from one season to the next to lean on by itself.
const NOISY_BELOW = 0.4;
const GROUPS: { key: Group; label: string; note?: string }[] = [
  { key: "swing", label: "How he swings" },
  { key: "shape", label: "Shape of the swing" },
  { key: "stance", label: "Stance" },
  { key: "grade", label: "Results", note: "Shown for reference. These do not count toward closeness." },
];

const HOME_EYE = { x: 1, y: 1, z: 0.8 };
// How far the camera sits from a hitter it has flown to, in map widths.
const FLY_EYE = { x: 0.45, y: 0.45, z: 0.3 };

const shortYear = (s: number) => `'${String(s).slice(2)}`;

/** Gap between two hitters across the checked coordinates, each in standard deviations. A coordinate blank for either hitter is left out and the rest scaled up. */
function distance(a: Row, b: Row, active: boolean[]): number {
  let sum = 0;
  let used = 0;
  let on = 0;
  for (let k = 0; k < active.length; k++) {
    if (!active[k]) continue;
    on++;
    const x = a.z[k];
    const y = b.z[k];
    if (x == null || y == null) continue;
    sum += (x - y) ** 2;
    used++;
  }
  return used ? Math.sqrt((sum * on) / used) : Infinity;
}

function readout(coord: Coord, value: number | null, pct: number | null) {
  if (pct == null) return <span className="text-[var(--dim)]">No reading</span>;
  const shown = value == null ? null : `${value.toFixed(coord.digits)}${coord.unit === "°" ? "°" : coord.unit ? ` ${coord.unit}` : ""}`;
  return (
    <>
      {shown && <span className="text-[var(--dim)]">{shown} · </span>}
      {ordinal(pct)}
    </>
  );
}

const CENTER_DOT = "h-[9px] w-[9px] rounded-full bg-[var(--accent)]";
const OTHER_DOT = "h-[9px] w-[9px] rounded-full border-2 border-[var(--text)] bg-[var(--panel)]";

function AddressRow({
  coord,
  value,
  pct,
  other,
  active,
  onToggle,
}: {
  coord: Coord;
  value: number | null;
  pct: number | null;
  other?: { value: number | null; pct: number | null };
  /** Undefined for a reference row, which has no checkbox. */
  active?: boolean;
  onToggle?: () => void;
}) {
  return (
    <div className={`py-2 ${active === false ? "opacity-50" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        {onToggle ? (
          <label className="flex min-w-0 cursor-pointer items-center gap-2 text-[13px] font-medium text-[var(--text)]">
            <input type="checkbox" checked={active} onChange={onToggle} className="accent-[var(--accent)]" />
            {coord.label}
          </label>
        ) : (
          <span className="min-w-0 text-[13px] font-medium text-[var(--text)]">{coord.label}</span>
        )}
        <div className="shrink-0 text-right text-[13px] tabular-nums text-[var(--text)]">
          <div className="flex items-center justify-end gap-1.5">
            {other && <span className={CENTER_DOT} aria-hidden />}
            <span>{readout(coord, value, pct)}</span>
          </div>
          {other && (
            <div className="flex items-center justify-end gap-1.5">
              <span className={OTHER_DOT} aria-hidden />
              <span>{readout(coord, other.value, other.pct)}</span>
            </div>
          )}
        </div>
      </div>
      <div className="relative mt-1.5 h-[11px]" aria-hidden>
        <span className="absolute inset-x-0 top-[4px] h-[2px] bg-[var(--neutral-bar)]" />
        <span className="absolute left-1/2 top-0 h-[10px] w-px bg-[var(--dimmer)]" />
        {other?.pct != null && <span className={`absolute top-[1px] -translate-x-1/2 ${OTHER_DOT}`} style={{ left: `${other.pct}%` }} />}
        {pct != null && <span className={`absolute top-[1px] -translate-x-1/2 ${CENTER_DOT}`} style={{ left: `${pct}%` }} />}
      </div>
      <div className="mt-0.5 flex justify-between text-[11px] text-[var(--dim)]">
        <span>{coord.low}</span>
        <span>{coord.high}</span>
      </div>
    </div>
  );
}

export default function HitterUniverse() {
  const [data, setData] = useState<{ coords: Coord[]; rows: Row[]; mapKept: number } | "error" | null>(null);
  const [seasons, setSeasons] = useState<number[]>(SEASONS);
  const [side, setSide] = useState<Side>("all");
  const [selected, setSelected] = useState<number | null>(null);
  const [compare, setCompare] = useState<number | null>(null);
  const [active, setActive] = useState<boolean[]>([]);
  const [plotReady, setPlotReady] = useState(false);
  const plotEl = useRef<HTMLDivElement>(null);
  const addressEl = useRef<HTMLDivElement>(null);
  const plotly = useRef<typeof import("plotly.js-dist-min") | null>(null);

  useEffect(() => {
    fetch("/data/hitter-universe.json")
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<UniverseJson>;
      })
      .then((j) => {
        const rows = j.rows.map(([mlbam, name, season, hitting, xyz, raw, pct, bats], i): Row => ({
          i,
          mlbam,
          name,
          season,
          hitting,
          xyz,
          raw,
          pct,
          bats,
          z: raw.map((v, k) => {
            if (v == null) return null;
            const shift = j.coords[k].key === "launch" ? j.launch_shift[season] : 0;
            return (v - shift - j.coords[k].mean) / j.coords[k].sd;
          }),
        }));
        setData({ coords: j.coords, rows, mapKept: j.map_kept });
        setActive(j.coords.map((c) => c.group !== "grade"));
        const params = new URLSearchParams(window.location.search);
        const wantedSide = params.get("bats");
        if (wantedSide === "L" || wantedSide === "R") setSide(wantedSide);
        const wanted = rows.filter((r) => r.mlbam === Number(params.get("player")));
        const pick = wanted.find((r) => r.season === Number(params.get("season"))) ?? wanted.at(-1);
        if (pick) setSelected(pick.i);
      })
      .catch(() => setData("error"));
  }, []);

  const loaded = data && data !== "error" ? data : null;
  const rows = useMemo(() => loaded?.rows ?? [], [loaded]);
  const coords = useMemo(() => loaded?.coords ?? [], [loaded]);
  const center = selected != null ? rows[selected] : null;
  const other = compare != null ? rows[compare] : null;

  // SearchBox reads only these fields, and lists each hitter once, under his latest season.
  const searchPlayers = useMemo(() => {
    const latest = new Map<number, Row>();
    for (const r of rows) latest.set(r.mlbam, r);
    return [...latest.values()].map((r) => ({ player_name: r.name, "Hitting+": r.hitting })) as unknown as Player[];
  }, [rows]);

  const select = useCallback((i: number) => {
    setSelected(i);
    setCompare(null);
  }, []);

  useEffect(() => {
    if (!center) return;
    const url = new URL(window.location.href);
    url.searchParams.set("player", String(center.mlbam));
    url.searchParams.set("season", String(center.season));
    window.history.replaceState(null, "", url);
  }, [center]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (side === "all") url.searchParams.delete("bats");
    else url.searchParams.set("bats", side);
    window.history.replaceState(null, "", url);
  }, [side]);

  const nearby = useMemo(() => {
    if (!center) return { list: [], own: [], typical: 0 };
    const scored = rows
      .filter((r) => r.i !== center.i)
      .map((r) => ({ r, d: distance(center, r, active) }))
      .sort((a, b) => a.d - b.d);
    const visible = scored.filter((x) => x.r.mlbam !== center.mlbam && seasons.includes(x.r.season) && onSide(x.r, side));
    return {
      list: visible.slice(0, NEIGHBORS),
      own: scored.filter((x) => x.r.mlbam === center.mlbam),
      typical: visible[Math.floor(visible.length / 2)]?.d ?? 0,
    };
  }, [center, rows, active, seasons, side]);

  const search = useCallback(
    (name: string) => {
      const his = rows.filter((r) => r.name === name);
      const pick = his.filter((r) => seasons.includes(r.season)).at(-1) ?? his.at(-1);
      if (pick) select(pick.i);
    },
    [rows, seasons, select],
  );

  const toggleSeason = (s: number) =>
    setSeasons((cur) => (cur.includes(s) ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : [...cur, s]));

  // Plotly is ~1 MB, so it only loads with this page.
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    import("plotly.js-dist-min").then((m) => {
      if (cancelled) return;
      plotly.current = m;
      setPlotReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [loaded]);

  const listIds = nearby.list.map((x) => x.r.i).join(",");

  // Fixed so the map holds still when seasons are toggled.
  const ranges = useMemo(() => {
    return [0, 1, 2].map((a) => {
      const v = rows.map((r) => r.xyz[a]);
      return v.length ? [Math.min(...v) - 2, Math.max(...v) + 2] : [0, 1];
    });
  }, [rows]);

  useEffect(() => {
    const el = plotEl.current;
    if (!plotReady || !el || !plotly.current) return;
    const Plotly = plotly.current as unknown as {
      react: (el: HTMLElement, traces: unknown[], layout: unknown, config: unknown) => Promise<void>;
    };
    const xyz = (list: Row[]) => ({ x: list.map((r) => r.xyz[0]), y: list.map((r) => r.xyz[1]), z: list.map((r) => r.xyz[2]) });
    const label = (r: Row) => `${formatName(r.name)} ${r.season}`;
    const dots = [...seasons].sort().map((s) => {
      const list = rows.filter((r) => r.season === s && onSide(r, side));
      return {
        type: "scatter3d",
        mode: "markers",
        name: String(s),
        ...xyz(list),
        customdata: list.map((r) => r.i),
        text: list.map(label),
        hovertemplate: "%{text}<extra></extra>",
        marker: { size: 3.5, color: SEASON_COLOR[s], opacity: 0.85, line: { width: 0 } },
      };
    });
    const highlight: unknown[] = [];
    if (center) {
      const near = nearby.list.map((x) => x.r);
      const line = { x: [] as (number | null)[], y: [] as (number | null)[], z: [] as (number | null)[] };
      for (const r of near) {
        line.x.push(center.xyz[0], r.xyz[0], null);
        line.y.push(center.xyz[1], r.xyz[1], null);
        line.z.push(center.xyz[2], r.xyz[2], null);
      }
      highlight.push(
        { type: "scatter3d", mode: "lines", ...line, hoverinfo: "skip", line: { color: "#c0392c", width: 2 }, opacity: 0.45 },
        {
          type: "scatter3d",
          mode: "markers",
          ...xyz(near),
          customdata: near.map((r) => r.i),
          text: near.map(label),
          hovertemplate: "%{text}<extra></extra>",
          marker: { size: 5.5, color: "#1c1a17", line: { width: 0 } },
        },
        {
          type: "scatter3d",
          mode: "markers+text",
          ...xyz([center]),
          customdata: [center.i],
          text: [label(center)],
          textposition: "top center",
          textfont: { size: 13, color: "#1c1a17" },
          hovertemplate: "%{text}<extra></extra>",
          marker: { size: 9, color: "#c0392c", line: { width: 0 } },
        },
      );
      // The hitter being compared: a ring with his name, like his marker in the table below.
      if (other) {
        highlight.push(
          {
            type: "scatter3d",
            mode: "lines",
            x: [center.xyz[0], other.xyz[0]],
            y: [center.xyz[1], other.xyz[1]],
            z: [center.xyz[2], other.xyz[2]],
            hoverinfo: "skip",
            line: { color: "#c0392c", width: 5 },
          },
          {
            type: "scatter3d",
            mode: "markers+text",
            ...xyz([other]),
            customdata: [other.i],
            text: [label(other)],
            textposition: "top center",
            textfont: { size: 13, color: "#1c1a17" },
            hovertemplate: "%{text}<extra></extra>",
            marker: { size: 9, color: "#ffffff", line: { width: 3, color: "#1c1a17" } },
          },
        );
      }
    }
    // Whatever view the viewer or a fly-to left, so redrawing never moves the camera.
    const camera = (el as unknown as { layout?: { scene?: { camera?: unknown } } }).layout?.scene?.camera ?? { eye: HOME_EYE };
    const axis = (a: number) => ({ visible: false, showspikes: false, range: ranges[a], autorange: false });
    Plotly.react(
      el,
      [...dots, ...highlight],
      {
        margin: { l: 0, r: 0, t: 0, b: 0 },
        paper_bgcolor: "rgba(0,0,0,0)",
        showlegend: false,
        // Keeps the viewer's camera when dots or highlights change.
        uirevision: "universe",
        scene: { xaxis: axis(0), yaxis: axis(1), zaxis: axis(2), aspectmode: "cube", bgcolor: "rgba(0,0,0,0)", camera },
        hoverlabel: { bgcolor: "#ffffff", bordercolor: "#cfcdc9", font: { color: "#1c1a17", size: 13 } },
      },
      { responsive: true, displayModeBar: false },
    ).then(() => {
      const clickable = el as unknown as {
        removeAllListeners?: (name: string) => void;
        on?: (name: string, cb: (e: { points: { customdata?: number }[] }) => void) => void;
      };
      clickable.removeAllListeners?.("plotly_click");
      clickable.on?.("plotly_click", (e) => {
        const i = e.points[0]?.customdata;
        if (i != null) select(i);
      });
    });
    // The list ids stand in for nearby.list, which is rebuilt on every change of its inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plotReady, rows, seasons, side, center, other, listIds, select, ranges]);

  // Flies to a newly centered hitter, once. Dragging afterwards stays with the viewer.
  const flownTo = useRef<number | null>(null);
  useEffect(() => {
    const el = plotEl.current;
    if (!plotReady || !el || !plotly.current || !center || flownTo.current === center.i) return;
    flownTo.current = center.i;
    const c = { x: 0, y: 0, z: 0 };
    (["x", "y", "z"] as const).forEach((k, a) => {
      c[k] = (center.xyz[a] - (ranges[a][0] + ranges[a][1]) / 2) / (ranges[a][1] - ranges[a][0]);
    });
    const eye = { x: c.x + FLY_EYE.x, y: c.y + FLY_EYE.y, z: c.z + FLY_EYE.z };
    (plotly.current as unknown as { relayout: (el: HTMLElement, u: unknown) => Promise<void> }).relayout(el, { "scene.camera": { center: c, eye, up: { x: 0, y: 0, z: 1 } } });
  }, [plotReady, center, ranges]);

  if (data === "error") return <p className="text-[13px] text-[var(--dim)]">The universe did not load. Try refreshing the page.</p>;

  const onCount = active.filter(Boolean).length;
  const counted = coords.filter((c) => c.group !== "grade").length;
  const noisy = coords.filter((c) => c.steady != null && c.steady < NOISY_BELOW).map((c) => c.label);

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-[var(--panel-shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <SearchBox players={searchPlayers} placeholder="Search a hitter" onSelect={search} />
          <div className="flex gap-1.5" role="group" aria-label="Seasons shown">
            {SEASONS.map((s) => {
              const on = seasons.includes(s);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSeason(s)}
                  className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] font-medium tabular-nums ${
                    on ? "border-[var(--dimmer)] text-[var(--text)]" : "border-[var(--panel-border)] text-[var(--dim)] line-through"
                  }`}
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: on ? SEASON_COLOR[s] : "var(--neutral-bar)" }} />
                  {s}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Batting side shown">
            {SIDES.map(({ key, label }) => (
              <button
                key={key}
                type="button"
                aria-pressed={side === key}
                onClick={() => {
                  setSide(key);
                  setCompare(null);
                }}
                className={`rounded-lg border px-3 py-2 text-[13px] font-medium ${
                  side === key ? "border-[var(--dimmer)] text-[var(--text)]" : "border-[var(--panel-border)] text-[var(--dim)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div ref={plotEl} className="mt-2 h-[420px] w-full sm:h-[620px]" role="img" aria-label="3D map of hitter-seasons. Dots that sit close together tend to have similar addresses." />
        {loaded && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--dim)]">
            Drag to turn the map, scroll or pinch to zoom, click a dot to center on that hitter. {counted} coordinates cannot fit in three dimensions, so the map is a guide: about {Math.round(loaded.mapKept * 100)}% of a hitter&apos;s true 10 closest hitters sit next to him here. The lines and the list use the full address. The map&apos;s directions have no meaning of their own.
          </p>
        )}
      </section>

      <aside className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-5 shadow-[var(--panel-shadow)]">
        {!center ? (
          <>
            <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">Find a hitter</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[var(--dim)]">
              {loaded ? `Search a name or click a dot. ${rows.length.toLocaleString()} hitter-seasons are in the universe.` : "Loading the universe."}
            </p>
          </>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">
                  <Link href={`/player/${center.mlbam}`} className="hover:underline">{formatName(center.name)}</Link> {center.season}
                </h2>
                <p className="mt-0.5 text-[11px] text-[var(--dim)]">Hitting+ {center.hitting ?? "n/a"}{center.bats ? ` · ${BATS_LABEL[center.bats]}` : ""}</p>
              </div>
              {nearby.own.length > 0 && (
                <div className="flex shrink-0 gap-1">
                  {rows
                    .filter((r) => r.mlbam === center.mlbam)
                    .map((r) => (
                      <button
                        key={r.season}
                        type="button"
                        aria-pressed={r.i === center.i}
                        onClick={() => select(r.i)}
                        className={`rounded-md border px-2 py-1 text-[11px] font-medium tabular-nums ${
                          r.i === center.i ? "border-[var(--accent)] bg-[var(--accent)] text-white" : "border-[var(--panel-border)] text-[var(--text)]"
                        }`}
                      >
                        {r.season}
                      </button>
                    ))}
                </div>
              )}
            </div>

            <h3 className="mt-5 text-[13px] font-semibold text-[var(--text)]">Closest hitters</h3>
            <ol className="mt-1 divide-y divide-[var(--rule)]">
              {nearby.list.map(({ r, d }) => (
                <li key={r.i}>
                  <button
                    type="button"
                    aria-pressed={compare === r.i}
                    onClick={() => {
                      const turningOn = compare !== r.i;
                      setCompare(turningOn ? r.i : null);
                      const top = addressEl.current?.getBoundingClientRect().top ?? 0;
                      if (turningOn && top > window.innerHeight - 140) addressEl.current?.scrollIntoView({ behavior: "smooth", block: "center" });
                    }}
                    className={`flex w-full items-baseline justify-between gap-3 py-1.5 text-left text-[13px] ${compare === r.i ? "font-semibold" : ""} text-[var(--text)] hover:underline`}
                  >
                    <span className="min-w-0 truncate">
                      {formatName(r.name)} <span className="text-[var(--dim)]">{shortYear(r.season)}{r.hitting != null ? ` · Hitting+ ${r.hitting}` : ""}</span>
                    </span>
                    <span className="shrink-0 tabular-nums text-[var(--dim)]">{d.toFixed(1)}</span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--dim)]">
              Smaller is closer. The typical hitter is {nearby.typical.toFixed(1)} from him
              {nearby.own.length > 0 && (
                <>
                  , and his own other seasons are{" "}
                  {nearby.own
                    .sort((a, b) => b.r.season - a.r.season)
                    .map((x) => `${x.d.toFixed(1)} (${x.r.season})`)
                    .join(" and ")}
                </>
              )}
              . Click a name to compare him in the table below.
            </p>

            <div ref={addressEl} className="mt-5 flex items-baseline justify-between gap-3">
              <h3 className="text-[13px] font-semibold text-[var(--text)]">{other ? "Address comparison" : "Address"}</h3>
              {other && (
                <button type="button" onClick={() => select(other.i)} className="text-[11px] text-[var(--dim)] underline">
                  Center on {formatName(other.name)} {shortYear(other.season)}
                </button>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--dim)]">
              Percentile among all three seasons, with a tick at the middle.{" "}
              Closeness compares how hitters swing and stand, not how well it worked. Uncheck a coordinate to leave it out.
            </p>
            {other && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] font-medium text-[var(--text)]">
                <span className="flex items-center gap-1.5">
                  <span className={CENTER_DOT} aria-hidden />
                  {formatName(center.name)} {shortYear(center.season)}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className={OTHER_DOT} aria-hidden />
                  {formatName(other.name)} {shortYear(other.season)}
                </span>
              </div>
            )}
            {GROUPS.map((g) => (
              <div key={g.key} className="mt-3">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--dim)]">{g.label}</h4>
                {g.note && <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--dim)]">{g.note}</p>}
                <div className="divide-y divide-[var(--rule)]">
                  {coords.map((c, k) =>
                    c.group !== g.key ? null : (
                      <AddressRow
                        key={c.key}
                        coord={c}
                        value={center.raw[k]}
                        pct={center.pct[k]}
                        other={other ? { value: other.raw[k], pct: other.pct[k] } : undefined}
                        active={c.group === "grade" ? undefined : active[k]}
                        onToggle={c.group === "grade" ? undefined : () => setActive((cur) => (onCount === 1 && cur[k] ? cur : cur.map((v, x) => (x === k ? !v : v))))}
                      />
                    ),
                  )}
                </div>
              </div>
            ))}
            <p className="mt-3 text-[11px] leading-relaxed text-[var(--dim)]">
              {noisy.length > 0 && `${noisy.join(" and ")} ${noisy.length === 1 ? "moves" : "move"} the most from one season to the next, so try unchecking ${noisy.length === 1 ? "it" : "them"} if a match looks odd. `}
              {`The shape of the swing and the stance come from Baseball Savant's bat tracking. Swing launch is shown in the frames we read, but it is compared after lining up each season's average, because the same hitters read about 0.7 frames lower on the 2026 videos.`}
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
