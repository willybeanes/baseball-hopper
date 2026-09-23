"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  HHPSLeaderboardRow,
  PlayerJson,
  LeagueJson,
  MetaJson,
  FigureJson,
  SplitPayload,
  Season,
} from "@/lib/hhps";
import {
  SEASONS,
  getCubeList,
  getBatTarget,
  flipX,
  buildBatMesh,
  playerJsonUrl,
  leagueJsonUrl,
  metaJsonUrl,
  figureJsonUrl,
  hhpsUrl,
} from "@/lib/hhps";

// ── Types ──────────────────────────────────────────────────────────────────────

type Outcome = "hard" | "brl";
type Mode = "bip" | "sw";
type Hand = "A" | "R" | "L";
type PlayerId = number | "league-R" | "league-L";

interface Props {
  leaderboard: HHPSLeaderboardRow[];
  season: Season;
  supabaseUrl: string;
  initialPlayer?: number;
  initialOutcome?: "hard" | "barrel";
  initialMode?: "contact" | "swing";
  initialHand?: "all" | "R" | "L";
}

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_HARD = "#DF4601";
const COLOR_BRL = "#8E1A5E";
const COLOR_ZONE = "#2b6cb0";
const COLOR_FIG = "#5b6570";
const COLOR_BAT = "#8a5a2b";
const COLOR_SUPPORT = "#cfcfcf";

function outcomeColor(outcome: Outcome) {
  return outcome === "hard" ? COLOR_HARD : COLOR_BRL;
}

function outcomeScale(outcome: Outcome): [number, string][] {
  return outcome === "hard"
    ? [[0, "#F7C4A5"], [1, "#DF4601"]]
    : [[0, "#E7B8D4"], [1, "#8E1A5E"]];
}

// ── Camera ────────────────────────────────────────────────────────────────────

function defaultCamera(sg: 1 | -1) {
  return {
    eye: { x: 1.26 * sg, y: -1.47, z: 0.37 },
    center: { x: 0.01 * sg, y: -0.02, z: -0.13 },
    up: { x: 0, y: 0, z: 1 },
  };
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function HHPSExplorer({
  leaderboard,
  season: initialSeason,
  supabaseUrl,
  initialPlayer,
  initialOutcome = "hard",
  initialMode = "contact",
  initialHand = "all",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [season, setSeason] = useState<Season>(initialSeason);
  const [selectedId, setSelectedId] = useState<PlayerId>(initialPlayer ?? "league-R");
  const [outcome, setOutcome] = useState<Outcome>(initialOutcome === "barrel" ? "brl" : "hard");
  const [mode, setMode] = useState<Mode>(initialMode === "swing" ? "sw" : "bip");
  const [hand, setHand] = useState<Hand>(
    initialHand === "R" ? "R" : initialHand === "L" ? "L" : "A",
  );
  const [showFig, setShowFig] = useState(true);
  const [showZone, setShowZone] = useState(true);

  const [lbSort, setLbSort] = useState<{ col: string; asc: boolean }>({
    col: "bip_hard_in3",
    asc: false,
  });
  const [lbQualOnly, setLbQualOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [playerBadge, setPlayerBadge] = useState<{ mlbam: number; teamId: number | null } | null>(null);

  // ── Data refs ──────────────────────────────────────────────────────────────
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min") | null>(null);
  const playerCache = useRef<Map<string, PlayerJson>>(new Map());
  const leagueRef = useRef<LeagueJson | null>(null);
  const metaRef = useRef<MetaJson | null>(null);
  const figureRef = useRef<FigureJson | null>(null);
  const cameraRef = useRef<ReturnType<typeof defaultCamera> | null>(null);
  const lastStandRef = useRef<"R" | "L" | null>(null);
  const currentPayloadRef = useRef<{ payload: SplitPayload; stand: "R" | "L" } | null>(null);

  // ── URL sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof selectedId === "number") {
      router.replace(
        hhpsUrl(selectedId, {
          outcome: outcome === "hard" ? "hard" : "barrel",
          mode: mode === "bip" ? "contact" : "swing",
          hand: hand === "A" ? "all" : hand,
        }),
        { scroll: false },
      );
    }
  }, [selectedId, outcome, mode, hand, router]);

  // ── Player badge (headshot + team logo) ───────────────────────────────────
  useEffect(() => {
    if (typeof selectedId !== "number") { setPlayerBadge(null); return; }
    setPlayerBadge({ mlbam: selectedId, teamId: null });
    fetch(`https://statsapi.mlb.com/api/v1/people/${selectedId}?hydrate=currentTeam`)
      .then((r) => r.json())
      .then((d) => {
        const teamId: number | null = d?.people?.[0]?.currentTeam?.id ?? null;
        setPlayerBadge({ mlbam: selectedId, teamId });
      })
      .catch(() => {});
  }, [selectedId]);

  // ── Load static assets + Plotly on mount ──────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    async function init() {
      const [Plotly, meta, league, figure] = await Promise.all([
        import("plotly.js-dist-min"),
        fetch(metaJsonUrl(supabaseUrl, season)).then((r) => r.json() as Promise<MetaJson>),
        fetch(leagueJsonUrl(supabaseUrl, season)).then((r) => r.json() as Promise<LeagueJson>),
        fetch(figureJsonUrl(supabaseUrl, season)).then((r) => r.json() as Promise<FigureJson>),
      ]);
      if (cancelled) return;
      plotlyRef.current = Plotly;
      metaRef.current = meta;
      leagueRef.current = league;
      figureRef.current = figure;
      await loadAndDraw(selectedId);
    }
    init().catch(console.error);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, supabaseUrl]);

  // ── Re-draw on toggle changes ──────────────────────────────────────────────
  useEffect(() => {
    if (!plotlyRef.current || !currentPayloadRef.current) return;
    draw(currentPayloadRef.current.payload, currentPayloadRef.current.stand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, mode, hand, showFig, showZone]);

  // ── Load player data ───────────────────────────────────────────────────────
  const loadAndDraw = useCallback(
    async (id: PlayerId) => {
      if (!plotlyRef.current || !metaRef.current || !leagueRef.current) return;

      if (id === "league-R" || id === "league-L") {
        const lg = leagueRef.current[id === "league-R" ? "R" : "L"];
        currentPayloadRef.current = { payload: lg.splits[hand], stand: lg.stand };
        draw(lg.splits[hand], lg.stand);
        return;
      }

      const cacheKey = `${season}:${id}`;
      let player = playerCache.current.get(cacheKey);
      if (!player) {
        try {
          const fetched = await fetch(playerJsonUrl(supabaseUrl, season, id)).then(
            (r) => r.json() as Promise<PlayerJson>,
          );
          playerCache.current.set(cacheKey, fetched);
          player = fetched;
        } catch {
          return;
        }
      }
      currentPayloadRef.current = { payload: player.splits[hand], stand: player.stand };
      draw(player.splits[hand], player.stand);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [season, supabaseUrl, hand, outcome, mode, showFig, showZone],
  );

  // Re-draw when player or hand changes
  useEffect(() => {
    loadAndDraw(selectedId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, hand]);

  // ── Build and render traces ────────────────────────────────────────────────
  function draw(payload: SplitPayload, stand: "R" | "L") {
    const Plotly = plotlyRef.current;
    const meta = metaRef.current;
    const figure = figureRef.current;
    const el = plotRef.current;
    if (!Plotly || !meta || !figure || !el) return;

    const sg: 1 | -1 = stand === "L" ? -1 : 1;

    // Reset camera when stand changes
    if (lastStandRef.current !== null && lastStandRef.current !== stand) {
      cameraRef.current = null;
    }
    lastStandRef.current = stand;
    const cam = cameraRef.current ?? defaultCamera(sg);

    const cubes = getCubeList(payload, mode, outcome);
    const batTarget = getBatTarget(payload, outcome);

    // Status line
    const row = leaderboard.find(
      (r) =>
        r.split === hand &&
        (typeof selectedId === "number" ? r.mlbam === selectedId : false),
    );
    const vol = mode === "bip"
      ? (outcome === "hard" ? row?.bip_hard_in3 : row?.bip_brl_in3)
      : (outcome === "hard" ? row?.sw_hard_in3 : row?.sw_brl_in3);
    const rank = mode === "bip"
      ? (outcome === "hard" ? row?.bip_hard_rank : row?.bip_brl_rank)
      : (outcome === "hard" ? row?.sw_hard_rank : row?.sw_brl_rank);
    const pct = outcome === "hard" ? row?.hh_rate : row?.brl_rate;
    const bip = row?.bip;
    const statusParts: string[] = [
      stand === "L" ? "LHH" : "RHH",
      vol !== undefined && vol !== null ? `${vol.toLocaleString()} in³` : "",
      rank !== undefined && rank !== null ? `rank #${Math.round(rank)}` : "",
      pct !== undefined && pct !== null
        ? (outcome === "hard" ? "HH%" : "Brl%") + ` ${(pct * 100).toFixed(1)}%`
        : "",
      bip !== undefined ? `${bip} BIP` : "",
      `${cubes.x.length} cubes`,
    ].filter(Boolean);
    setStatus(statusParts.join("  ·  "));

    // Sample-size note on cubes
    const smallSample = bip !== undefined && bip < 50;

    const traces: object[] = [];

    // 1. Support cloud
    const support = meta.support_cloud;
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: support.map(([sx]) => sx * sg),
      y: support.map(([, sy]) => sy),
      z: support.map(([, , sz]) => sz),
      marker: { size: 2, color: COLOR_SUPPORT, opacity: 0.25 },
      hoverinfo: "skip",
      showlegend: false,
    });

    // 2. Colored cubes
    if (cubes.x.length > 0) {
      traces.push({
        type: "scatter3d",
        mode: "markers",
        x: flipX(cubes.x, sg),
        y: cubes.y,
        z: cubes.z,
        marker: {
          size: 5,
          color: cubes.c,
          colorscale: outcomeScale(outcome),
          opacity: 0.85,
          symbol: "square",
        },
        customdata: cubes.x,
        hovertemplate:
          `off body %{customdata}"<br>out front %{y}"<br>height %{z}"<br>` +
          (outcome === "hard" ? "hard-hit" : "barrel") +
          " prob %{marker.color:.1%}<extra></extra>",
        showlegend: false,
      });
    }

    // 3. Figure mesh
    if (showFig) {
      traces.push({
        type: "mesh3d",
        x: flipX(figure.body.x, sg),
        y: figure.body.y,
        z: figure.body.z,
        i: figure.body.i,
        j: figure.body.j,
        k: figure.body.k,
        color: COLOR_FIG,
        opacity: 0.16,
        flatshading: true,
        hoverinfo: "skip",
        showlegend: false,
        lighting: { ambient: 0.9, diffuse: 0.3 },
      });

      // 4. Bat mesh
      if (batTarget) {
        const hands: [number, number, number] = [figure.hands[0] * sg, figure.hands[1], figure.hands[2]];
        const target: [number, number, number] = [batTarget[0] * sg, batTarget[1], batTarget[2]];
        const bat = buildBatMesh(hands, target);
        traces.push({
          type: "mesh3d",
          x: bat.x,
          y: bat.y,
          z: bat.z,
          i: bat.i,
          j: bat.j,
          k: bat.k,
          color: COLOR_BAT,
          opacity: 0.45,
          flatshading: true,
          hoverinfo: "skip",
          showlegend: false,
        });
      }
    }

    // 5. ABS zone
    if (showZone) {
      const lg = leagueRef.current;
      // Use per-hitter zone if available, else league average for the side
      let zone = (payload as unknown as { zone?: PlayerJson["zone"] }).zone;
      if (!zone && lg) {
        const lgEntry = lg[stand];
        zone = { ...lgEntry.zone };
      }
      if (zone) {
        const cx = zone.plate_off_body * sg;
        const hw = 8.5;
        const x0 = (zone.plate_off_body - hw) * sg;
        const x1 = (zone.plate_off_body + hw) * sg;
        const yd = 19; // placeholder depth
        traces.push({
          type: "mesh3d",
          x: [x0, x1, x1, x0],
          y: [yd, yd, yd, yd],
          z: [zone.sz_bot, zone.sz_bot, zone.sz_top, zone.sz_top],
          i: [0, 0],
          j: [1, 2],
          k: [2, 3],
          color: COLOR_ZONE,
          opacity: 0.12,
          hoverinfo: "skip",
          showlegend: false,
        });
        traces.push({
          type: "scatter3d",
          mode: "lines",
          x: [x0, x1, x1, x0, x0],
          y: [yd, yd, yd, yd, yd],
          z: [zone.sz_bot, zone.sz_bot, zone.sz_top, zone.sz_top, zone.sz_bot],
          line: { color: COLOR_ZONE, width: 4 },
          hovertemplate:
            `ABS zone<br>${zone.sz_bot.toFixed(1)}" to ${zone.sz_top.toFixed(1)}" high<br>` +
            `plate center ${Math.abs(cx).toFixed(1)}" off body<extra></extra>`,
          showlegend: false,
        });
      }
    }

    const xRange: [number, number] = sg > 0 ? [-16, 60] : [-60, 16];
    const layout = {
      margin: { l: 0, r: 0, t: 0, b: 0 },
      paper_bgcolor: "rgba(0,0,0,0)",
      scene: {
        xaxis: {
          title: { text: "toward plate (in)" },
          range: xRange,
          tickvals: [0, 20, 40, 60].map((v) => v * sg),
          ticktext: ["0", "20", "40", "60"],
          backgroundcolor: "rgba(0,0,0,0)",
          gridcolor: "rgba(128,128,128,0.15)",
          zerolinecolor: "rgba(128,128,128,0.3)",
        },
        yaxis: {
          title: { text: "out front (in)" },
          range: [-26, 60],
          backgroundcolor: "rgba(0,0,0,0)",
          gridcolor: "rgba(128,128,128,0.15)",
          zerolinecolor: "rgba(128,128,128,0.3)",
        },
        zaxis: {
          title: { text: "height (in)" },
          range: [0, 74],
          backgroundcolor: "rgba(0,0,0,0)",
          gridcolor: "rgba(128,128,128,0.15)",
          zerolinecolor: "rgba(128,128,128,0.3)",
        },
        aspectmode: "manual",
        aspectratio: { x: 0.88, y: 1, z: 0.86 },
        camera: cam,
        bgcolor: "rgba(0,0,0,0)",
      },
      uirevision: stand, // Plotly preserves camera across trace-only updates same stand
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Plotly as any).react(el, traces, layout, { responsive: true, displayModeBar: false });

    // Capture camera on user interaction
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pel = el as any;
      if (pel.on) {
        pel.removeAllListeners?.("plotly_relayout");
        pel.on("plotly_relayout", () => {
          try {
            const sc = pel._fullLayout?.scene?.camera;
            if (sc) cameraRef.current = JSON.parse(JSON.stringify({ eye: sc.eye, center: sc.center, up: sc.up }));
          } catch {}
        });
      }
    }, 300);

  }

  const currentRow = leaderboard.find(
    (r) => r.split === hand && typeof selectedId === "number" && r.mlbam === selectedId,
  );
  const smallSample = currentRow !== undefined && currentRow.bip < 50;

  // ── Camera move ────────────────────────────────────────────────────────────
  // dr = right, du = up, df = forward — all in camera-local space, step 0.08
  function move(dr: number, du: number, df: number) {
    const Plotly = plotlyRef.current;
    const el = plotRef.current;
    if (!Plotly || !el) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sc = (el as any)._fullLayout?.scene?.camera;
    if (!sc) return;
    const cam = JSON.parse(JSON.stringify({ eye: sc.eye, center: sc.center, up: sc.up }));
    const e = cam.eye, ce = cam.center;
    // Forward vector (eye → center, normalised)
    let f = [ce.x - e.x, ce.y - e.y, ce.z - e.z];
    const fL = Math.hypot(...f); f = f.map(v => v / fL);
    // Right vector (f × world-up)
    const wu = [0, 0, 1];
    let r = [f[1]*wu[2]-f[2]*wu[1], f[2]*wu[0]-f[0]*wu[2], f[0]*wu[1]-f[1]*wu[0]];
    const rL = Math.hypot(...r) || 1; r = r.map(v => v / rL);
    // True up (r × f)
    const u = [r[1]*f[2]-r[2]*f[1], r[2]*f[0]-r[0]*f[2], r[0]*f[1]-r[1]*f[0]];
    const st = 0.08;
    const d = [0, 1, 2].map(i => st * (dr*r[i] + du*u[i] + df*f[i]));
    (['x', 'y', 'z'] as const).forEach((a, i) => { e[a] += d[i]; ce[a] += d[i]; });
    cameraRef.current = cam;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Plotly as any).relayout(el, { "scene.camera": cam });
  }

  function resetCamera() {
    if (!currentPayloadRef.current) return;
    cameraRef.current = null;
    const { payload, stand } = currentPayloadRef.current;
    draw(payload, stand);
  }

  // Keyboard controls
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "a" || k === "arrowleft") move(-1, 0, 0);
      else if (k === "d" || k === "arrowright") move(1, 0, 0);
      else if (k === "w" || k === "arrowup") move(0, 0, 1);
      else if (k === "s" || k === "arrowdown") move(0, 0, -1);
      else if (k === "q") move(0, 1, 0);
      else if (k === "e") move(0, -1, 0);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // "Last, First" → "First Last"
  function displayName(stored: string): string {
    const parts = stored.split(", ");
    return parts.length === 2 ? `${parts[1]} ${parts[0]}` : stored;
  }

  // Matches "Last, First" stored names against "first last" or "last" queries
  function nameMatch(storedName: string, query: string): boolean {
    const q = query.toLowerCase();
    const n = storedName.toLowerCase();
    if (n.includes(q)) return true;
    const parts = n.split(", ");
    return parts.length === 2 && `${parts[1]} ${parts[0]}`.includes(q);
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  const lbRows = leaderboard
    .filter((r) => r.split === hand)
    .filter((r) => !lbQualOnly || r.qualified)
    .filter((r) => !search || nameMatch(r.name, search))
    .sort((a, b) => {
      const av = ((a as unknown as Record<string, unknown>)[lbSort.col] as number | null) ?? -Infinity;
      const bv = ((b as unknown as Record<string, unknown>)[lbSort.col] as number | null) ?? -Infinity;
      return lbSort.asc ? av - bv : bv - av;
    });

  const LB_COLS: { key: string; label: string; title: string }[] = [
    { key: "name", label: "Player", title: "Player name" },
    { key: "bip_hard_in3", label: "HH BIP", title: "Hard-hit per contact space (in³)" },
    { key: "sw_hard_in3", label: "HH SW", title: "Hard-hit per swing space (in³)" },
    { key: "bip_brl_in3", label: "Brl BIP", title: "Barrel per contact space (in³)" },
    { key: "sw_brl_in3", label: "Brl SW", title: "Barrel per swing space (in³)" },
    { key: "bip", label: "BIP", title: "Balls in play" },
  ];

  function sortBy(col: string) {
    setLbSort((s) => s.col === col ? { col, asc: !s.asc } : { col, asc: col === "name" });
  }

  // ── Player search for the picker ──────────────────────────────────────────
  const allRows = leaderboard.filter((r) => r.split === "A");
  const searchFiltered = search
    ? allRows.filter((r) => nameMatch(r.name, search))
    : allRows.filter((r) => r.qualified);

  // ── Toggle button helper ──────────────────────────────────────────────────
  function Btn({
    on, onClick, children,
  }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
      <button
        onClick={onClick}
        className={`px-3 py-1 rounded-md text-sm font-medium transition-colors border ${
          on
            ? "bg-[var(--accent)] text-white border-[var(--accent)]"
            : "bg-[var(--panel)] text-[var(--dim)] border-[var(--panel-border)] hover:text-[var(--text)]"
        }`}
      >
        {children}
      </button>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-baseline gap-3 justify-between">
        <div>
          <h1 className="text-xl font-bold">3D Swing Explorer</h1>
          <p className="text-sm text-[var(--dim)] mt-0.5">
            3-inch pockets of space where contact becomes{" "}
            {outcome === "hard" ? "a hard-hit ball (95+ mph)" : "a barrel"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-[var(--dimmer)]">Season</span>
          <select
            value={season}
            onChange={(e) => setSeason(Number(e.target.value) as Season)}
            className="text-sm border border-[var(--panel-border)] rounded-md px-2 py-1 bg-[var(--panel)] text-[var(--text)]"
          >
            {SEASONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Player picker */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search hitters…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="text-sm border border-[var(--panel-border)] rounded-md px-3 py-1.5 bg-[var(--panel)] text-[var(--text)] w-48 placeholder:text-[var(--dimmer)]"
          />
          {search && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 max-h-60 overflow-y-auto rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] shadow-[var(--elevated-shadow)] py-1">
              <button
                onClick={() => { setSelectedId("league-R"); setSearch(""); }}
                className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--bg)] text-[var(--text)]"
              >
                League average, RHH
              </button>
              <button
                onClick={() => { setSelectedId("league-L"); setSearch(""); }}
                className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--bg)] text-[var(--text)]"
              >
                League average, LHH
              </button>
              {searchFiltered.slice(0, 30).map((r) => (
                <button
                  key={r.mlbam}
                  onClick={() => { setSelectedId(r.mlbam); setSearch(""); }}
                  className="w-full text-left px-3.5 py-2 text-sm hover:bg-[var(--bg)] text-[var(--text)] flex justify-between"
                >
                  <span>{displayName(r.name)}</span>
                  <span className="text-[var(--dimmer)] text-xs">{r.stand}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Current selection chip */}
        {!search && (
          <span className="text-sm font-medium text-[var(--text)] px-2">
            {selectedId === "league-R"
              ? "League avg, RHH"
              : selectedId === "league-L"
              ? "League avg, LHH"
              : (allRows.find((r) => r.mlbam === selectedId)?.name ?? "—")}
          </span>
        )}

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* Hand split */}
        <div className="flex gap-1">
          <Btn on={hand === "A"} onClick={() => setHand("A")}>All pitchers</Btn>
          <Btn on={hand === "R"} onClick={() => setHand("R")}>vs RHP</Btn>
          <Btn on={hand === "L"} onClick={() => setHand("L")}>vs LHP</Btn>
        </div>

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* Outcome */}
        <div className="flex gap-1">
          <Btn on={outcome === "hard"} onClick={() => setOutcome("hard")}>Hard-hit</Btn>
          <Btn on={outcome === "brl"} onClick={() => setOutcome("brl")}>Barrel</Btn>
        </div>

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* Mode */}
        <div className="flex gap-1">
          <Btn on={mode === "bip"} onClick={() => setMode("bip")}>Per contact</Btn>
          <Btn on={mode === "sw"} onClick={() => setMode("sw")}>Per swing</Btn>
        </div>

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        <Btn on={showFig} onClick={() => setShowFig((v) => !v)}>Figure</Btn>
        <Btn on={showZone} onClick={() => setShowZone((v) => !v)}>Zone</Btn>
      </div>

      {/* Status line */}
      {status && (
        <div className="font-mono text-xs text-[var(--dim)] px-1">
          {status}
          {smallSample && (
            <span className="ml-2 text-[var(--amber)] font-sans">
              · small sample ({currentRow?.bip} BIP)
            </span>
          )}
        </div>
      )}

      {/* Plot */}
      <div className="relative">
        <div
          ref={plotRef}
          className="w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] overflow-hidden"
          style={{ height: 560 }}
        />
        {playerBadge && (() => {
          const storedName = allRows.find((r) => r.mlbam === playerBadge.mlbam)?.name ?? "";
          return (
            <div className="absolute top-3 right-3 flex items-center gap-2 pointer-events-none">
              {storedName && (
                <span className="text-sm font-semibold text-[var(--text)] drop-shadow-sm">
                  {displayName(storedName)}
                </span>
              )}
              <img
                src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_213,q_auto:best/v1/people/${playerBadge.mlbam}/headshot/67/current`}
                alt=""
                className="w-14 h-14 rounded-full object-cover border-2 border-[var(--panel-border)] bg-[var(--panel)]"
              />
              {playerBadge.teamId && (
                <img
                  src={`https://www.mlbstatic.com/team-logos/${playerBadge.teamId}.svg`}
                  alt=""
                  className="w-14 h-14 rounded-full object-contain bg-white p-1 border-2 border-[var(--panel-border)]"
                />
              )}
            </div>
          );
        })()}
      </div>

      {/* Camera controls */}
      <div className="flex flex-wrap gap-1.5 items-center text-xs text-[var(--dim)]">
        <span className="mr-1">Move camera:</span>
        {[
          { label: "← A", dr: -1, du: 0, df: 0 },
          { label: "→ D", dr: 1, du: 0, df: 0 },
          { label: "↑ W", dr: 0, du: 0, df: 1 },
          { label: "↓ S", dr: 0, du: 0, df: -1 },
          { label: "Up Q", dr: 0, du: 1, df: 0 },
          { label: "Down E", dr: 0, du: -1, df: 0 },
        ].map(({ label, dr, du, df }) => (
          <button
            key={label}
            onClick={() => move(dr, du, df)}
            className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-[var(--panel)] hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
          >
            {label}
          </button>
        ))}
        <button
          onClick={resetCamera}
          className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-[var(--panel)] hover:bg-[var(--bg)] text-[var(--text)] transition-colors"
        >
          Reset
        </button>
      </div>

      {/* Leaderboard */}
      <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--rule)]">
          <h2 className="font-semibold text-sm">
            Leaderboard —{" "}
            {hand === "A" ? "all pitchers" : hand === "R" ? "vs RHP" : "vs LHP"}
          </h2>
          <label className="flex items-center gap-1.5 text-xs text-[var(--dim)] cursor-pointer">
            <input
              type="checkbox"
              checked={lbQualOnly}
              onChange={(e) => setLbQualOnly(e.target.checked)}
              className="rounded"
            />
            Qualified only (150+ PA)
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-[var(--dimmer)] bg-[var(--bg)]">
                {LB_COLS.map((col) => (
                  <th
                    key={col.key}
                    title={col.title}
                    onClick={() => sortBy(col.key)}
                    className={`px-3 py-2 text-left cursor-pointer hover:text-[var(--text)] select-none whitespace-nowrap ${
                      lbSort.col === col.key ? "text-[var(--text)]" : ""
                    }`}
                  >
                    {col.label}
                    {lbSort.col === col.key && (
                      <span className="ml-1">{lbSort.asc ? "↑" : "↓"}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lbRows.slice(0, 100).map((r) => (
                <tr
                  key={`${r.mlbam}-${r.split}`}
                  onClick={() => setSelectedId(r.mlbam)}
                  className={`border-t border-[var(--rule)] cursor-pointer transition-colors hover:bg-[var(--bg)] ${
                    selectedId === r.mlbam ? "bg-[var(--accent-dim)]" : ""
                  }`}
                >
                  <td className="px-3 py-1.5 font-medium">{r.name}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.bip_hard_in3.toLocaleString()}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.sw_hard_in3.toLocaleString()}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.bip_brl_in3.toLocaleString()}</td>
                  <td className="px-3 py-1.5 tabular-nums">{r.sw_brl_in3.toLocaleString()}</td>
                  <td className="px-3 py-1.5 tabular-nums text-[var(--dim)]">{r.bip}</td>
                </tr>
              ))}
              {lbRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-[var(--dim)] text-sm">
                    No results
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Explainer */}
      <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-4 space-y-3 text-sm text-[var(--dim)] leading-relaxed">
        <h2 className="font-semibold text-[var(--text)] text-base">About this tool</h2>
        <p>
          <strong className="text-[var(--text)]">Hard-Hit Possibility Space (HHPS)</strong> measures
          where in the space around a hitter&rsquo;s body contact becomes a hard-hit ball (&ge;95 mph
          exit velocity). Each orange cube is a 3-inch pocket where a batted ball has a high enough
          probability to count. Barrel Space (purple) uses the standard Statcast EV/LA barrel formula.
        </p>
        <p>
          <strong className="text-[var(--text)]">Per contact</strong> asks: of balls put in play from
          this location, what share are hard? <strong className="text-[var(--text)]">Per swing</strong>{" "}
          counts whiffs and fouls as swings that didn&rsquo;t produce the outcome — it penalizes holes in
          the zone.
        </p>
        <p>
          <strong className="text-[var(--text)]">Thresholds:</strong> A cube lights up orange (hard-hit)
          when &ge;50% of per-contact balls in that pocket exit at 95+ mph. Per-swing hard-hit uses a
          relative cutoff — top 25% of league spatial cells by rate. Barrel (purple) uses both a relative
          cutoff — top 9% of league cells — and the standard Statcast EV/LA formula (roughly EV &ge;98 mph
          at the ideal launch angle). The grey dots mark cells holding 90% of all league batted-ball
          density — the full contact space a hitter can reach.
        </p>
        <p>
          <strong className="text-[var(--text)]">Splits</strong> use the same cutoffs in every split.
          Each hitter&rsquo;s map is blended with the league average for his batting side using
          5 effective balls of shrinkage — early in a season every map sits close to league average.
        </p>
        <p className="text-xs text-[var(--dimmer)]">
          Known limitations: the ABS zone depth (19&Prime; out front) is a placeholder. The figure is
          generic, not the hitter&rsquo;s real body. vs LHP samples are small (&sim;80 BIP for a regular).
          In the All view a switch hitter&rsquo;s two sides are combined.
        </p>
      </section>
    </main>
  );
}

