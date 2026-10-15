"use client";

import { useEffect, useRef, useState } from "react";
import type { HHPSLeaderboardRow, LeagueJson, MetaJson, PlayerJson, Side, StanceRow } from "@/lib/hhps";
import {
  buildBatMesh,
  fetchStance,
  flipX,
  getBatTarget,
  getCubeList,
  leagueJsonUrl,
  metaJsonUrl,
  pickStance,
  playerJsonUrl,
} from "@/lib/hhps";
import { buildFigure, figureHands, plateAndBoxTraces, stanceFeet } from "@/lib/hhpsStance";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const COLOR_ZONE = "#2b6cb0";
const COLOR_FIG = "#5b6570";
const COLOR_BAT = "#8a5a2b";
const COLOR_SUPPORT = "#cfcfcf";

/** Same ramps as the 3D explorer. */
const SCALE = {
  hard: [[0, "#F7C4A5"], [1, "#DF4601"]],
  whiff: [[0, "#7CC7A4"], [1, "#1F7A5A"]],
} as const;

type Outcome = keyof typeof SCALE;
type Split = "A" | "R" | "L";

interface Loaded {
  Plotly: typeof import("plotly.js-dist-min");
  meta: MetaJson | null;
  league: LeagueJson | null;
  player: PlayerJson | null;
  stanceRows: StanceRow[];
}

const pct = (v: number | null | undefined) => (v == null ? null : `${(v * 100).toFixed(1)}%`);

/**
 * Read-only 3D cube map for the player page: hitters get hard-hit cubes per ball in play,
 * pitchers get the whiff cubes they induce per swing. Drag to rotate; the full controls
 * live in the 3D Swing / Pitch Explorer.
 */
export default function SwingMap({
  mlbam,
  season,
  side,
  rows,
}: {
  mlbam: number;
  season: number;
  side: Side;
  /** Leaderboard rows for this season by split (A/R/L), for the caption. */
  rows: HHPSLeaderboardRow[];
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const loadRef = useRef<Promise<Loaded> | null>(null);
  const [visible, setVisible] = useState(false);
  const [split, setSplit] = useState<Split>("A");
  const [state, setState] = useState<"loading" | "ready" | "empty" | "error">("loading");

  const outcome: Outcome = side === "pitcher" ? "whiff" : "hard";
  const mode = side === "pitcher" ? "sw" : "bip";

  // Plotly is ~1 MB; only fetch it once the map is about to scroll into view.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin: "400px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    let ro: ResizeObserver | null = null;

    (async () => {
      // Fetched once; switching splits only redraws.
      loadRef.current ??= (async () => {
        const json = <T,>(url: string) => fetch(url).then((r) => (r.ok ? (r.json() as Promise<T>) : null));
        const [Plotly, meta, league, player, stanceRows] = await Promise.all([
          import("plotly.js-dist-min"),
          json<MetaJson>(metaJsonUrl(SUPABASE_URL, season, side)),
          json<LeagueJson>(leagueJsonUrl(SUPABASE_URL, season, side)),
          json<PlayerJson>(playerJsonUrl(SUPABASE_URL, season, mlbam, side)),
          // Batting stance is a hitter measurement; pitcher maps pool every hitter.
          side === "hitter" ? fetchStance(SUPABASE_URL, SUPABASE_ANON_KEY, mlbam, season) : Promise.resolve([] as StanceRow[]),
        ]);
        return { Plotly, meta, league, player, stanceRows };
      })();
      const { Plotly, meta, league, player, stanceRows } = await loadRef.current;
      if (cancelled) return;
      const el = plotRef.current;
      if (!meta || !player || !el) return setState(player === null ? "empty" : "error");

      // Pitcher files key vs-RHH / vs-LHH under R / L; each split carries the batter side it's drawn for.
      const payload = player.splits[split];
      if (!payload) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Plotly as any).purge(el);
        return setState("empty");
      }
      const stand: "R" | "L" = payload.stand ?? (player.stand !== "S" ? player.stand : "L");
      const sg: 1 | -1 = stand === "L" ? -1 : 1;
      const cubes = getCubeList(payload, mode, outcome);
      if (!cubes.x.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Plotly as any).purge(el);
        return setState("empty");
      }

      const zone = player.zone ?? league?.[stand].zone;
      const stRow = pickStance(stanceRows, stand, split);
      const stanceDepth = stRow?.stance_depth ?? 19;
      const feet = zone && stRow ? stanceFeet(stRow, zone.plate_off_body) : null;

      const draw = () => {
        const sizeScale = Math.min(1, Math.max(0.4, (el.clientWidth || 900) / 900));
        const zoom = el.clientWidth < 500 ? 1.3 : 1;
        const traces: object[] = [];

        const support = outcome === "whiff" && meta.support_cloud_sw ? meta.support_cloud_sw : meta.support_cloud;
        traces.push({
          type: "scatter3d", mode: "markers",
          x: support.map(([x]) => x * sg), y: support.map(([, y]) => y), z: support.map(([, , z]) => z),
          marker: { size: Math.max(1, 2 * sizeScale), color: COLOR_SUPPORT, opacity: 0.25 },
          hoverinfo: "skip", showlegend: false,
        });

        traces.push({
          type: "scatter3d", mode: "markers",
          x: flipX(cubes.x, sg), y: cubes.y, z: cubes.z,
          marker: {
            size: 5 * sizeScale, color: cubes.c, colorscale: SCALE[outcome], opacity: 0.85, symbol: "square",
            ...(outcome === "whiff" ? { cmin: 0.2, cmax: 0.85 } : {}),
          },
          customdata: cubes.x,
          hovertemplate:
            `off body %{customdata}"<br>out front %{y}"<br>height %{z}"<br>` +
            `${outcome === "whiff" ? "whiff" : "hard-hit"} prob %{marker.color:.1%}<extra></extra>`,
          showlegend: false,
        });

        const body = buildFigure(feet);
        traces.push({
          type: "mesh3d", x: flipX(body.x, sg), y: body.y, z: body.z, i: body.i, j: body.j, k: body.k,
          color: COLOR_FIG, opacity: 0.16, flatshading: true, hoverinfo: "skip", showlegend: false,
          lighting: { ambient: 0.9, diffuse: 0.3 },
        });

        // Pitcher maps can lack a whiff bat target on thin samples; fall back like the explorer does.
        const aim = getBatTarget(payload, outcome) ?? payload.bat_target_hard ?? league?.R.splits.A.bat_target_hard ?? null;
        if (aim) {
          const fh = figureHands(feet);
          const bat = buildBatMesh([fh[0] * sg, fh[1], fh[2]], [aim[0] * sg, aim[1], aim[2]]);
          traces.push({
            type: "mesh3d", x: bat.x, y: bat.y, z: bat.z, i: bat.i, j: bat.j, k: bat.k,
            color: COLOR_BAT, opacity: 0.45, flatshading: true, hoverinfo: "skip", showlegend: false,
          });
        }

        if (zone) {
          const x0 = (zone.plate_off_body - 8.5) * sg;
          const x1 = (zone.plate_off_body + 8.5) * sg;
          const yd = stanceDepth;
          traces.push({
            type: "mesh3d", x: [x0, x1, x1, x0], y: [yd, yd, yd, yd],
            z: [zone.sz_bot, zone.sz_bot, zone.sz_top, zone.sz_top], i: [0, 0], j: [1, 2], k: [2, 3],
            color: COLOR_ZONE, opacity: 0.12, hoverinfo: "skip", showlegend: false,
          });
          traces.push({
            type: "scatter3d", mode: "lines", x: [x0, x1, x1, x0, x0], y: [yd, yd, yd, yd, yd],
            z: [zone.sz_bot, zone.sz_bot, zone.sz_top, zone.sz_top, zone.sz_bot],
            line: { color: COLOR_ZONE, width: 4 }, hoverinfo: "skip", showlegend: false,
          });
          traces.push(...plateAndBoxTraces(zone.plate_off_body, stanceDepth, sg, true, { line: "#8a949e", fill: "#8a949e" }));
        }

        const axis = { backgroundcolor: "rgba(0,0,0,0)", gridcolor: "rgba(128,128,128,0.15)", zerolinecolor: "rgba(128,128,128,0.3)" };
        const layout = {
          margin: { l: 0, r: 0, t: 0, b: 0 },
          paper_bgcolor: "rgba(0,0,0,0)",
          scene: {
            xaxis: { ...axis, title: { text: "toward plate (in)" }, range: sg > 0 ? [-30, 60] : [-60, 30], tickvals: [0, 20, 40, 60].map((v) => v * sg), ticktext: ["0", "20", "40", "60"] },
            yaxis: { ...axis, title: { text: "out front (in)" }, range: [-26, 60] },
            zaxis: { ...axis, title: { text: "height (in)" }, range: [0, 74] },
            aspectmode: "manual",
            aspectratio: { x: 0.88, y: 1, z: 0.86 },
            // Same angle as the explorer's default view, pulled back on phones so the whole scene fits.
            camera: {
              eye: { x: 1.34 * sg * zoom, y: -1.47 * zoom, z: 0.37 * zoom },
              center: { x: 0.09 * sg, y: -0.02, z: -0.13 },
              up: { x: 0, y: 0, z: 1 },
            },
            bgcolor: "rgba(0,0,0,0)",
            dragmode: "turntable",
          },
          // Keep the visitor's rotation across splits unless the batter side (and so the frame) flips.
          uirevision: stand,
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (Plotly as any).react(el, traces, layout, { responsive: true, displayModeBar: false, scrollZoom: false });
      };

      draw();
      setState("ready");
      // Cube markers are sized in pixels, so redraw when the width changes.
      let lastW = el.clientWidth;
      ro = new ResizeObserver(() => {
        if (Math.abs(el.clientWidth - lastW) < 40) return;
        lastW = el.clientWidth;
        draw();
      });
      ro.observe(el);
    })().catch(() => !cancelled && setState("error"));

    return () => {
      cancelled = true;
      ro?.disconnect();
    };
  }, [visible, split, mlbam, season, side, mode, outcome]);

  const row = rows.find((r) => r.split === split);
  const opp = side === "pitcher" ? "H" : "P";
  const caption = row
    ? side === "pitcher"
      ? [pct(row.whiff_rate) && `Whiff% ${pct(row.whiff_rate)}`, row.swings != null && `${row.swings} swings`]
      : [pct(row.hh_rate) && `HH% ${pct(row.hh_rate)}`, `${row.bip} BIP`]
    : [];

  return (
    <div>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 px-5 sm:px-7">
        <div className="flex gap-1" role="group" aria-label="Split">
          {(["A", "R", "L"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSplit(k)}
              aria-pressed={split === k}
              className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-colors ${
                split === k
                  ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                  : "border-[var(--rule)] text-[var(--dim)] hover:text-[var(--text)]"
              }`}
            >
              {k === "A" ? "All" : `vs ${k}H${opp}`}
            </button>
          ))}
        </div>
        <span className="text-xs tabular-nums text-[var(--dim)]">{caption.filter(Boolean).join(" · ")}</span>
      </div>
      <div ref={wrapRef} className="relative h-[380px] sm:h-[460px]">
        <div ref={plotRef} className="h-full w-full" />
        {state !== "ready" && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-[var(--dim)]">
            {state === "loading" ? "Loading 3D map…" : state === "empty" ? "Not enough data for this split yet" : "Couldn't load the 3D map"}
          </div>
        )}
      </div>
    </div>
  );
}
