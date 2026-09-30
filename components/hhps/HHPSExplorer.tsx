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
import { fetchLeagueStance, fetchStance, pickStance, stanceMedians } from "@/lib/hhps";
import type { PointsJson, StanceMedians, StanceRow } from "@/lib/hhps";
import { pointsJsonUrl } from "@/lib/hhps";
import StancePanel from "./StancePanel";
import PlayPanel from "./PlayPanel";
import { buildPitchPath } from "@/lib/hhpsPath";
import type { PitchPath } from "@/lib/hhpsPath";
import { evKey } from "@/lib/hhpsVideo";
import type { Trajectory } from "@/lib/hhpsVideo";
import {
  CIRCLE_TYPES, COLOR_BRL, COLOR_HARD, COLOR_SOFT, COLOR_WHIFF, RESULTS, TYPE_BUTTON_ORDER,
  eventLabel, parseRes, parseTypes, serializeRes, serializeTypes, typeInfo, typesFromOutcome,
} from "@/lib/hhpsEvents";
import type { CircleType, ResCode } from "@/lib/hhpsEvents";
import type { PlayItem } from "./PlayPanel";
import type { EventPoint } from "@/lib/hhps";
import { buildFigure, figureHands, plateAndBoxTraces, stanceFeet, stanceLabelTraces } from "@/lib/hhpsStance";
import { normalize } from "@/lib/hitting-plus/metrics";

// ── Types ──────────────────────────────────────────────────────────────────────

type Outcome = "hard" | "brl" | "whiff" | "soft";
type Mode = "bip" | "sw";
// A split is a pitcher-hand choice, a pitch-group choice, or both: hand letter + pitch letter ("RF", "LB", ...).
type Hand = "A" | "R" | "L" | "F" | "B" | "O" | "RF" | "LF" | "RB" | "LB" | "RO" | "LO";
type HandSel = "A" | "R" | "L";
type PitchSel = "F" | "B" | "O" | null;
const PITCH_SPLITS: Hand[] = ["F", "B", "O", "RF", "LF", "RB", "LB", "RO", "LO"];
const SPLIT_LABEL: Record<Hand, string> = {
  A: "all pitchers", R: "vs RHP", L: "vs LHP",
  F: "fastballs", B: "breaking balls", O: "offspeed",
  RF: "fastballs vs RHP", LF: "fastballs vs LHP",
  RB: "breaking balls vs RHP", LB: "breaking balls vs LHP",
  RO: "offspeed vs RHP", LO: "offspeed vs LHP",
};
const splitKey = (h: HandSel, p: PitchSel): Hand => (p ? (h === "A" ? p : ((h + p) as Hand)) : h);
function parseSplit(v: string | undefined): [HandSel, PitchSel] {
  if (v === "R" || v === "L") return [v, null];
  if (v === "F" || v === "B" || v === "O") return ["A", v];
  if (v && v.length === 2 && (v[0] === "R" || v[0] === "L") && "FBO".includes(v[1])) return [v[0] as HandSel, v[1] as PitchSel];
  return ["A", null];
}
type PlayerId = number | "league-R" | "league-L";

interface Props {
  leaderboard: HHPSLeaderboardRow[];
  season: Season;
  supabaseUrl: string;
  initialPlayer?: number;
  initialOutcome?: "hard" | "barrel" | "whiff" | "soft";
  initialTypes?: string;
  initialRes?: string;
  initialMode?: "contact" | "swing";
  initialThr?: number;
  initialWhiff?: boolean;
  initialWthr?: number;
  initialView?: "cubes" | "circles";
  initialHand?: "all" | "R" | "L" | "F" | "B" | "O" | "RF" | "LF" | "RB" | "LB" | "RO" | "LO";
}

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_ZONE = "#2b6cb0";
const COLOR_FIG = "#5b6570";
const COLOR_BAT = "#8a5a2b";
const COLOR_SUPPORT = "#cfcfcf";

function outcomeColor(outcome: Outcome) {
  return outcome === "hard" ? COLOR_HARD : outcome === "whiff" ? COLOR_WHIFF : outcome === "soft" ? COLOR_SOFT : COLOR_BRL;
}

function outcomeScale(outcome: Outcome): [number, string][] {
  return outcome === "hard"
    ? [[0, "#F7C4A5"], [1, "#DF4601"]]
    : outcome === "soft"
    ? [[0, "#F1DE9A"], [1, "#C99700"]]
    : outcome === "whiff"
    ? [[0, "#7CC7A4"], [1, "#1F7A5A"]]
    : [[0, "#E7B8D4"], [1, "#8E1A5E"]];
}

// ── Camera ────────────────────────────────────────────────────────────────────

// Scene units: the axis box is about 0.88 wide over 90 in, so 0.08 is roughly 8 in. The eye and the look-at point move
// together (same viewing angle) toward home plate; sg mirrors it for lefties.
const CAM_TOWARD_PLATE = 0.08;
function defaultCamera(sg: 1 | -1, yShift = 0) {
  // yShift re-centers on the hitter when the depth axis is stretched to fit a pitch path.
  return {
    eye: { x: (1.26 + CAM_TOWARD_PLATE) * sg, y: -1.47 + yShift, z: 0.37 },
    center: { x: (0.01 + CAM_TOWARD_PLATE) * sg, y: -0.02 + yShift, z: -0.13 },
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
  initialThr,
  initialWhiff = false,
  initialTypes,
  initialRes,
  initialWthr,
  initialView = "cubes",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── State ──────────────────────────────────────────────────────────────────
  const [season, setSeason] = useState<Season>(initialSeason);
  const [selectedId, setSelectedId] = useState<PlayerId>(initialPlayer ?? "league-R");
  const [outcome, setOutcome] = useState<Outcome>(
    initialOutcome === "barrel" ? "brl" : initialOutcome === "whiff" ? "whiff" : initialOutcome === "soft" ? "soft" : "hard",
  );
  const [modeSel, setModeSel] = useState<Mode>(initialMode === "swing" ? "sw" : "bip");
  // Whiff maps only exist per swing; the Per contact / Per swing choice is remembered for the other outcomes.
  const mode: Mode = outcome === "whiff" ? "sw" : modeSel;
  const [handSel, setHandSel] = useState<HandSel>(() => parseSplit(initialHand)[0]);
  const [pitchSel, setPitchSel] = useState<PitchSel>(() => parseSplit(initialHand)[1]);
  const hand: Hand = splitKey(handSel, pitchSel);
  const [showFig, setShowFig] = useState(true);
  const [showZone, setShowZone] = useState(true);
  // Ground overlays (need the hitter's stance data): plate + batter's box, and one toggle for the stance labels
  // (feet apart, foot angle and depth at contact).
  const [showBox, setShowBox] = useState(true);
  const [showStanceLabels, setShowStanceLabels] = useState(false);

  const [lbSort, setLbSort] = useState<{ col: string; asc: boolean }>({
    col: "bip_hard_in3",
    asc: false,
  });
  const [lbQualOnly, setLbQualOnly] = useState(true);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [hasPitchGroups, setHasPitchGroups] = useState(false);
  const [hasCombos, setHasCombos] = useState(false);
  const [hasWhiff, setHasWhiff] = useState(false);
  const [hasSoft, setHasSoft] = useState(false);
  // Stance at contact (Savant). Drives the real ABS-zone depth and the Stance panel.
  const [stanceRows, setStanceRows] = useState<StanceRow[]>([]);
  const [leagueStance, setLeagueStance] = useState<StanceMedians | null>(null);
  const stanceRef = useRef({ rows: stanceRows, league: leagueStance });
  stanceRef.current = { rows: stanceRows, league: leagueStance };
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
  // Custom threshold per "<mode>_<outcome>" (rate, e.g. 0.42). Absent = the fixed bar.
  const [thrMap, setThrMap] = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    if (initialThr !== undefined) {
      m[`${initialOutcome === "whiff" || initialMode === "swing" ? "sw" : "bip"}_${initialOutcome === "barrel" ? "brl" : initialOutcome === "whiff" ? "whiff" : initialOutcome === "soft" ? "soft" : "hard"}`] = initialThr;
    }
    if (initialWthr !== undefined) m["sw_whiff"] = initialWthr;
    return m;
  });
  // Hard-hit or Barrel can be shown together with Whiff (whiff cubes drawn as green squares, same size as the cubes).
  const [alsoWhiff, setAlsoWhiff] = useState(initialWhiff && initialOutcome !== "whiff");
  // Cubes (smoothed rate maps) or circles (each individual event at its raw location).
  const [viewMode, setViewMode] = useState<"cubes" | "circles">(initialView);
  // Circles view layers: each type (hard-hit, barrel, soft-hit, whiff, foul) and each PA result is its own toggle.
  const [circTypes, setCircTypes] = useState<Record<CircleType, boolean>>(
    () => parseTypes(initialTypes) ?? typesFromOutcome(initialOutcome === "barrel" ? "brl" : initialOutcome, initialWhiff),
  );
  const [circRes, setCircRes] = useState<Record<ResCode, boolean>>(() => parseRes(initialRes));
  const circTouched = useRef(Boolean(initialTypes || initialRes));
  const [points, setPoints] = useState<{ key: string; data: PointsJson | null } | null>(null);
  const pointsRef = useRef(points);
  pointsRef.current = points;
  // Click a cube or circle: the plays behind it (with video), shown in a card under the chart.
  const [plays, setPlays] = useState<{ title: string; subtitle?: string; items: PlayItem[] } | null>(null);
  useEffect(() => { setPlays(null); setPathSel(null); }, [selectedId, season]);
  // A pitch path drawn in the scene (from a play card's "Show pitch path").
  const [pathSel, setPathSel] = useState<{ key: string; ev: EventPoint; traj: Trajectory } | null>(null);
  const lastPathKey = useRef<string | null>(null);
  const [metaInfo, setMetaInfo] = useState<Pick<MetaJson, "thresholds" | "slider" | "league_rates"> | null>(null);
  const [playerBadge, setPlayerBadge] = useState<{ mlbam: number; teamId: number | null } | null>(null);

  // ── Data refs ──────────────────────────────────────────────────────────────
  const plotRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min") | null>(null);
  const playerCache = useRef<Map<string, PlayerJson>>(new Map());
  const leagueRef = useRef<LeagueJson | null>(null);
  // draw() runs from async callbacks; read the latest leaderboard so a season switch never shows a stale row.
  const leaderboardRef = useRef(leaderboard);
  leaderboardRef.current = leaderboard;
  const metaRef = useRef<MetaJson | null>(null);
  const figureRef = useRef<FigureJson | null>(null);
  const cameraRef = useRef<ReturnType<typeof defaultCamera> | null>(null);
  const lastStandRef = useRef<"R" | "L" | null>(null);
  const currentPayloadRef = useRef<{ payload: SplitPayload; stand: "R" | "L" } | null>(null);
  const resetCounterRef = useRef(0);

  // ── URL sync ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (typeof selectedId === "number") {
      router.replace(
        hhpsUrl(selectedId, {
          outcome: outcome === "hard" ? "hard" : outcome === "whiff" ? "whiff" : outcome === "soft" ? "soft" : "barrel",
          mode: mode === "bip" ? "contact" : "swing",
          hand: hand === "A" ? "all" : hand,
          season: season === SEASONS[0] ? undefined : season,
          thr: thrMap[`${mode}_${outcome}`],
          whiff: alsoWhiff && outcome !== "whiff" ? true : undefined,
          wthr: alsoWhiff && outcome !== "whiff" ? thrMap["sw_whiff"] : undefined,
          view: viewMode === "circles" ? "circles" : undefined,
          types: viewMode === "circles" ? serializeTypes(circTypes) : undefined,
          res: viewMode === "circles" ? serializeRes(circRes) || undefined : undefined,
        }),
        { scroll: false },
      );
    } else if (season !== initialSeason) {
      // League average has no player param; keep the season so the leaderboard matches the maps.
      router.replace(`/hhps?season=${season}`, { scroll: false });
    }
  }, [selectedId, outcome, mode, hand, season, thrMap, alsoWhiff, viewMode, circTypes, circRes, router]);

  // ── Circles view: load this hitter's individual events when asked for ───────────────────────
  useEffect(() => {
    if (viewMode !== "circles" || typeof selectedId !== "number") return;
    const key = `${season}:${selectedId}`;
    if (pointsRef.current?.key === key) return;
    let cancelled = false;
    fetch(pointsJsonUrl(supabaseUrl, season, selectedId))
      .then((r) => (r.ok ? (r.json() as Promise<PointsJson>) : null))
      .catch(() => null)
      .then((data) => { if (!cancelled) setPoints({ key, data }); });
    return () => { cancelled = true; };
  }, [viewMode, selectedId, season, supabaseUrl]);

  // ── Stance data: league medians per season, and the selected hitter's rows ─────────────────
  useEffect(() => {
    let cancelled = false;
    setLeagueStance(null);
    fetchLeagueStance(supabaseUrl, anonKey, season)
      .then((rows) => { if (!cancelled && rows.length) setLeagueStance(stanceMedians(rows)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [season, supabaseUrl, anonKey]);

  useEffect(() => {
    let cancelled = false;
    setStanceRows([]);
    if (typeof selectedId !== "number") return;
    fetchStance(supabaseUrl, anonKey, selectedId, season)
      .then((rows) => { if (!cancelled) setStanceRows(rows); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, season, supabaseUrl, anonKey]);

  // ── Player badge (headshot + team logo) ───────────────────────────────────
  useEffect(() => {
    if (typeof selectedId !== "number") { setPlayerBadge(null); return; }
    setPlayerBadge({ mlbam: selectedId, teamId: null });
    let cancelled = false;
    // Logo follows the selected season: current season uses his team today,
    // past seasons use the team he had the most PA for that year (traded players).
    const hydrate = `currentTeam,stats(group=[hitting],type=[season],season=${season},sportId=1)`;
    fetch(`https://statsapi.mlb.com/api/v1/people/${selectedId}?hydrate=${encodeURIComponent(hydrate)}`)
      .then((r) => r.json())
      .then((d) => {
        const p = d?.people?.[0];
        const splits: any[] = (p?.stats?.[0]?.splits ?? []).filter((s: any) => s.team?.id);
        const top = splits.sort((a, b) => (b.stat?.plateAppearances ?? 0) - (a.stat?.plateAppearances ?? 0))[0];
        const teamId: number | null =
          (season === SEASONS[0] ? p?.currentTeam?.id : top?.team?.id) ?? top?.team?.id ?? p?.currentTeam?.id ?? null;
        if (!cancelled) setPlayerBadge({ mlbam: selectedId, teamId });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedId, season]);

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
      // Older season files predate the pitch-type maps; hide the buttons and fall back to All.
      const hasPG = Boolean(league.R.splits.F);
      setHasPitchGroups(hasPG);
      setMetaInfo({ thresholds: meta.thresholds, slider: meta.slider, league_rates: meta.league_rates });
      setHasCombos(Boolean(league.R.splits.RB));
      const hasW = Boolean(league.R.splits.A.sw_whiff);
      setHasWhiff(hasW);
      const hasS = Boolean(league.R.splits.A.bip_soft);
      setHasSoft(hasS);
      if (!hasS && outcome === "soft") { setOutcome("hard"); return; }
      if (!hasW && outcome === "whiff") { setOutcome("hard"); return; }
      if (!hasPG && PITCH_SPLITS.includes(hand)) { setHandSel("A"); setPitchSel(null); return; }
      // Combos (pitch group vs one hand) arrived after the F/B/O maps; drop back to the hand alone if absent.
      if (hand.length === 2 && !league.R.splits[hand]) { setPitchSel(null); return; }
      await loadAndDraw(selectedId);
    }
    init().catch(console.error);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [season, supabaseUrl]);

  // Track plot width so cube markers (sized in pixels) scale with the chart on phones
  const [plotW, setPlotW] = useState(0);
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setPlotW(Math.round(e.contentRect.width / 40) * 40));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Pinch-to-zoom on phones: Plotly's 3D scene ignores two-finger pinch, so handle it here.
  // Moves the camera eye toward / away from the scene center (camera angle stays the same).
  // Listeners run in the capture phase so one-finger touches still reach Plotly (rotate).
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    let start: { d: number; eye: { x: number; y: number; z: number }; center: { x: number; y: number; z: number }; up: unknown } | null = null;
    let pending: object | null = null;
    let busy = false;
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
    const onStart = (ev: TouchEvent) => {
      if (ev.touches.length !== 2) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sc = (el as any)._fullLayout?.scene?.camera;
      if (!sc) return;
      start = { d: dist(ev.touches), ...JSON.parse(JSON.stringify({ eye: sc.eye, center: sc.center, up: sc.up })) };
      ev.preventDefault(); ev.stopPropagation();
    };
    const onMove = (ev: TouchEvent) => {
      if (!start || ev.touches.length !== 2) return;
      ev.preventDefault(); ev.stopPropagation();
      const s = start;
      const k = Math.min(4, Math.max(0.25, s.d / Math.max(1, dist(ev.touches))));  // spread fingers = zoom in
      const c = s.center;
      const eye = { x: c.x + (s.eye.x - c.x) * k, y: c.y + (s.eye.y - c.y) * k, z: c.z + (s.eye.z - c.z) * k };
      pending = { eye, center: c, up: s.up };
      flush();
    };
    // Apply the latest pinch camera; skip intermediate ones while Plotly is still redrawing
    const flush = () => {
      if (busy || !pending) return;
      const cam = pending; pending = null; busy = true;
      cameraRef.current = cam as ReturnType<typeof defaultCamera>;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      Promise.resolve((plotlyRef.current as any)?.relayout(el, { "scene.camera": cam }))
        .catch(() => {})
        .finally(() => { busy = false; flush(); });
    };
    const onEnd = (ev: TouchEvent) => {
      if (start && ev.touches.length < 2) { start = null; ev.stopPropagation(); }
    };
    const opts = { capture: true, passive: false } as const;
    el.addEventListener("touchstart", onStart, opts);
    el.addEventListener("touchmove", onMove, opts);
    el.addEventListener("touchend", onEnd, opts);
    el.addEventListener("touchcancel", onEnd, opts);
    return () => {
      el.removeEventListener("touchstart", onStart, opts);
      el.removeEventListener("touchmove", onMove, opts);
      el.removeEventListener("touchend", onEnd, opts);
      el.removeEventListener("touchcancel", onEnd, opts);
    };
  }, []);

  // ── Re-draw on toggle changes ──────────────────────────────────────────────
  useEffect(() => {
    if (!plotlyRef.current || !currentPayloadRef.current) return;
    draw(currentPayloadRef.current.payload, currentPayloadRef.current.stand);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, mode, hand, showFig, showZone, showBox, showStanceLabels, plotW, leaderboard, thrMap, stanceRows, leagueStance, alsoWhiff, viewMode, points, circTypes, circRes, pathSel]);

  // ── Load player data ───────────────────────────────────────────────────────
  const loadAndDraw = useCallback(
    async (id: PlayerId) => {
      if (!plotlyRef.current || !metaRef.current || !leagueRef.current) return;

      if (id === "league-R" || id === "league-L") {
        const lg = leagueRef.current[id === "league-R" ? "R" : "L"];
        const lgPayload = lg.splits[hand];
        if (!lgPayload) return;
        currentPayloadRef.current = { payload: lgPayload, stand: lg.stand };
        draw(lgPayload, lg.stand);
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
      const payload = player.splits[hand];
      if (!payload) return;
      const splitStand: "R" | "L" =
        payload.stand ?? (player.stand !== "S" ? player.stand : "L");
      currentPayloadRef.current = { payload, stand: splitStand };
      draw(payload, splitStand);
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
    // Markers are fixed pixel sizes: full size on desktop (~900px+ wide), shrink on narrow screens
    const sizeScale = Math.min(1, Math.max(0.4, (el.clientWidth || 900) / 900));

    // Reset camera when stand changes
    if (lastStandRef.current !== null && lastStandRef.current !== stand) {
      cameraRef.current = null;
    }
    lastStandRef.current = stand;

    const fixedThr = meta.thresholds[`${mode}_${outcome}`];
    const range = meta.slider?.[`${mode}_${outcome}`];
    const rawThr = thrMap[`${mode}_${outcome}`];
    // Custom threshold only when this season's files carry the loose cubes (meta.slider); clamp to the range.
    const customThr =
      rawThr !== undefined && range ? Math.min(range[1], Math.max(range[0], rawThr)) : null;
    const isCustom = customThr !== null && Math.abs(customThr - fixedThr) > 1e-9;
    const cubes = getCubeList(payload, mode, outcome, isCustom ? customThr : null, fixedThr);
    const batTarget = getBatTarget(payload, outcome);

    // Whiff overlay (Hard-hit or Barrel together with Whiff): whiff cubes use their own threshold, always per swing.
    const overlayWhiff = alsoWhiff && outcome !== "whiff" && Boolean(payload.sw_whiff);
    let wCubes: ReturnType<typeof getCubeList> | null = null;
    if (overlayWhiff) {
      const wFixed = meta.thresholds["sw_whiff"];
      const wRange = meta.slider?.["sw_whiff"];
      const wRaw = thrMap["sw_whiff"];
      const wCustom = wRaw !== undefined && wRange ? Math.min(wRange[1], Math.max(wRange[0], wRaw)) : null;
      const wIsCustom = wCustom !== null && Math.abs(wCustom - wFixed) > 1e-9;
      wCubes = getCubeList(payload, "sw", "whiff", wIsCustom ? wCustom : null, wFixed);
    }

    // Circles view: individual events for this hitter, filtered to the current hand / pitch-type split.
    const pts = pointsRef.current;
    const circleData =
      viewMode === "circles" && typeof selectedId === "number" && pts && pts.key === `${season}:${selectedId}` ? pts.data : null;
    const hFilter = hand.match(/[RL]/)?.[0];
    const pFilter = hand.match(/[FBO]/)?.[0];
    // Each event is drawn once: in its PA-result color if that result is switched on, otherwise in the color of the
    // first switched-on type that matches it (barrel before hard-hit). Groups are built in a fixed order so results draw on top.
    type CircleGroup = { key: string; label: string; color: string; sel: EventPoint[] };
    const groupMap = new Map<string, CircleGroup>();
    if (circleData) {
      for (const t of CIRCLE_TYPES) if (circTypes[t.key]) groupMap.set(`t:${t.key}`, { key: t.key, label: t.label, color: t.color, sel: [] });
      for (const r of RESULTS) if (circRes[r.code]) groupMap.set(`r:${r.code}`, { key: r.code, label: r.label, color: r.color, sel: [] });
      const onTypes = CIRCLE_TYPES.filter((t) => circTypes[t.key]);
      for (const p of circleData.pts) {
        if ((hFilter && p[5] !== hFilter) || (pFilter && p[6] !== pFilter)) continue;
        const res = p[11] ?? "";
        if (res && circRes[res as ResCode]) { groupMap.get(`r:${res}`)?.sel.push(p); continue; }
        const t = onTypes.find((x) => x.test(p[3]));
        if (t) groupMap.get(`t:${t.key}`)?.sel.push(p);
      }
    }
    const circleSets = circleData ? [...groupMap.values()] : null;

    // Status line
    const row = leaderboardRef.current.find(
      (r) =>
        r.split === hand &&
        (typeof selectedId === "number" ? r.mlbam === selectedId : false),
    );
    const isWhiff = outcome === "whiff";
    const rank = isWhiff
      ? row?.sw_whiff_rank
      : mode === "bip"
      ? (outcome === "hard" ? row?.bip_hard_rank : outcome === "soft" ? row?.bip_soft_rank : row?.bip_brl_rank)
      : (outcome === "hard" ? row?.sw_hard_rank : outcome === "soft" ? row?.sw_soft_rank : row?.sw_brl_rank);
    const pct = isWhiff
      ? row?.whiff_rate
      : outcome === "hard" ? row?.hh_rate
      : outcome === "soft" ? (row?.hh_rate != null ? 1 - row.hh_rate : undefined)
      : row?.brl_rate;
    const bip = row?.bip;
    const swings = row?.swings ?? undefined;
    const sampleN = isWhiff ? swings : bip;
    const statusParts: string[] = [
      stand === "L" ? "LHH" : "RHH",
      !isCustom && !circleSets && rank !== undefined && rank !== null ? `rank #${Math.round(rank)}` : "",
      pct !== undefined && pct !== null
        ? (isWhiff ? "Whiff%" : outcome === "hard" ? "HH%" : outcome === "soft" ? "Soft%" : "Brl%") + ` ${(pct * 100).toFixed(1)}%` +
          (isWhiff
            ? (swings ? ` (${Math.round(pct * swings)} whiffs)` : "")
            : bip ? ` (${Math.round(pct * bip)} ${outcome === "hard" ? "hard-hit" : outcome === "soft" ? "soft-hit" : "barrels"})` : "")
        : "",
      isWhiff ? (swings !== undefined ? `${swings} swings` : "") : bip !== undefined ? `${bip} BIP` : "",
      circleSets
        ? (circleSets.length ? circleSets.map((c) => `${c.sel.length} ${c.label.toLowerCase()}`).join(" + ") + " (circles)" : "no circle layers switched on")
        : `${cubes.x.length} cubes`,
      wCubes && !circleSets ? `${wCubes.x.length} whiff cubes${row?.whiff_rate != null ? ` (Whiff% ${(row.whiff_rate * 100).toFixed(1)}%)` : ""}` : "",
      isCustom && !circleSets ? "custom threshold, no rank" : "",
    ].filter(Boolean);
    setStatus(statusParts.join("  ·  "));

    // Sample-size note on cubes
    const smallSample = sampleN !== undefined && sampleN < (isWhiff ? 150 : 50);

    const traces: object[] = [];

    // 1. Support cloud
    const swingSpace = isWhiff || overlayWhiff || (circleSets !== null && (circTypes.whiff || circTypes.foul || circRes.K));
    const support = swingSpace && meta.support_cloud_sw ? meta.support_cloud_sw : meta.support_cloud;
    traces.push({
      type: "scatter3d",
      mode: "markers",
      x: support.map(([sx]) => sx * sg),
      y: support.map(([, sy]) => sy),
      z: support.map(([, , sz]) => sz),
      marker: { size: Math.max(1, 2 * sizeScale), color: COLOR_SUPPORT, opacity: 0.25 },
      hoverinfo: "skip",
      showlegend: false,
    });

    // 2a. Circles: each event at its raw location (not smoothed)
    if (circleSets) {
      for (const c of circleSets) {
        if (!c.sel.length) continue;
        traces.push({
          type: "scatter3d",
          mode: "markers",
          x: c.sel.map((p) => p[0] * sg),
          y: c.sel.map((p) => p[1]),
          z: c.sel.map((p) => p[2]),
          marker: { size: 5 * sizeScale, color: c.color, opacity: 0.85, symbol: "circle", line: { color: "#ffffff", width: 0.5 } },
          customdata: c.sel,
          meta: { kind: "circle" },
          text: c.sel.map((p) => eventLabel(p)),
          hovertemplate: `off body %{customdata[0]:.1f}"<br>out front %{y:.1f}"<br>height %{z:.1f}"<br>%{text}<br>click to see the play<extra></extra>`,
          showlegend: false,
        });
      }
    }

    // 2b. Whiff cubes (green squares, same shape and size as the other cubes) when combined with Hard-hit, Barrel or Soft-hit
    if (!circleSets && wCubes && wCubes.x.length > 0) {
      traces.push({
        type: "scatter3d",
        mode: "markers",
        x: flipX(wCubes.x, sg),
        y: wCubes.y,
        z: wCubes.z,
        // Same square glyph and size as the main cubes. (Diamonds looked fine alone but their corners tile into a dense lattice
        // on the 3-inch grid.) The color range is pinned (not auto-scaled) so low-rate cubes stay visible and do not shift with the slider.
        marker: { size: 5.5 * sizeScale, color: wCubes.c, colorscale: outcomeScale("whiff"), cmin: 0.2, cmax: 0.85, opacity: 0.85, symbol: "square" },
        customdata: wCubes.x,
        meta: { kind: "cube", oc: "whiff" },
        hovertemplate: `off body %{customdata}"<br>out front %{y}"<br>height %{z}"<br>whiff prob %{marker.color:.1%}<br>click for the nearest plays<extra></extra>`,
        showlegend: false,
      });
    }

    // 2. Colored cubes
    if (!circleSets && cubes.x.length > 0) {
      traces.push({
        type: "scatter3d",
        mode: "markers",
        x: flipX(cubes.x, sg),
        y: cubes.y,
        z: cubes.z,
        marker: {
          // Same size as the whiff squares when they share the view, so the two layers keep the same visual weight
          size: (overlayWhiff ? 5.5 : 5) * sizeScale,
          color: cubes.c,
          colorscale: outcomeScale(outcome),
          opacity: 0.85,
          symbol: "square",
        },
        customdata: cubes.x,
        meta: { kind: "cube", oc: outcome },
        hovertemplate:
          `off body %{customdata}"<br>out front %{y}"<br>height %{z}"<br>` +
          (outcome === "hard" ? "hard-hit" : outcome === "whiff" ? "whiff" : outcome === "soft" ? "soft-hit" : "barrel") +
          " prob %{marker.color:.1%}<br>click for the nearest plays<extra></extra>",
        showlegend: false,
      });
    }

    // Zone geometry and stance data, shared by the figure, the plate/box and the ground labels
    const lgRef = leagueRef.current;
    let zoneInfo = (payload as unknown as { zone?: PlayerJson["zone"] }).zone;
    if (!zoneInfo && lgRef) zoneInfo = { ...lgRef[stand].zone };
    const { rows: stRowsAll, league: stLeagueAll } = stanceRef.current;
    const stRow = typeof selectedId === "number" ? pickStance(stRowsAll, stand, hand) : undefined;
    const stanceDepth =
      (typeof selectedId === "number" ? stRow?.stance_depth : stLeagueAll?.stance_depth) ?? 19;
    const feet = zoneInfo && stRow ? stanceFeet(stRow, zoneInfo.plate_off_body) : null;

    // 3. Figure mesh (legs and feet follow his contact stance when we have it)
    if (showFig) {
      const body = buildFigure(feet);
      traces.push({
        type: "mesh3d",
        x: flipX(body.x, sg),
        y: body.y,
        z: body.z,
        i: body.i,
        j: body.j,
        k: body.k,
        color: COLOR_FIG,
        opacity: 0.16,
        flatshading: true,
        hoverinfo: "skip",
        showlegend: false,
        lighting: { ambient: 0.9, diffuse: 0.3 },
      });

      // 4. Bat mesh
      if (batTarget) {
        const fh = figureHands(feet);   // hands move with the upper body when it is centered over his stance
        const hands: [number, number, number] = [fh[0] * sg, fh[1], fh[2]];
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
      const zone = zoneInfo;
      if (zone) {
        const cx = zone.plate_off_body * sg;
        const hw = 8.5;
        const x0 = (zone.plate_off_body - hw) * sg;
        const x1 = (zone.plate_off_body + hw) * sg;
        // Strike-zone plane depth = how far behind the front of the plate he stands (Savant stance data).
        // Falls back to the league median (league-average views) or the old 19" placeholder if unavailable.
        const yd = stanceDepth;
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

    // 6. Home plate and the batter's box on the ground, then the toggled stance data labels
    if (showBox && zoneInfo) {
      traces.push(...plateAndBoxTraces(zoneInfo.plate_off_body, stanceDepth, sg, true, { line: "#8a949e", fill: "#8a949e" }));
    }
    if (feet && stRow && showStanceLabels) {
      traces.push(...stanceLabelTraces(feet, stRow, sg, { apart: true, angle: true, depth: true }));
    }

    // 7. Pitch path (from a play card): the real flight, stretching the depth axis only while it is showing
    let path: PitchPath | null = null;
    if (pathSel && zoneInfo) {
      path = buildPitchPath(pathSel.traj, pathSel.ev, {
        plateOffBody: zoneInfo.plate_off_body, stanceDepth, sgE: stand === "L" ? 1 : -1,
      });
    }
    if (path) {
      const PATH_COLOR = "#111827";
      traces.push({
        type: "scatter3d", mode: "lines",
        x: flipX(path.solid.x, sg), y: path.solid.y, z: path.solid.z,
        line: { color: PATH_COLOR, width: 6 }, hoverinfo: "skip", showlegend: false,
      });
      if (path.dashed) {
        traces.push({
          type: "scatter3d", mode: "lines",
          x: flipX(path.dashed.x, sg), y: path.dashed.y, z: path.dashed.z,
          line: { color: PATH_COLOR, width: 4, dash: "dash" }, opacity: 0.6, hoverinfo: "skip", showlegend: false,
        });
      }
      traces.push({
        type: "scatter3d", mode: "markers",
        x: flipX(path.marks.map((m) => m.x), sg), y: path.marks.map((m) => m.y), z: path.marks.map((m) => m.z),
        marker: { size: 3.5, color: PATH_COLOR, opacity: 0.9 },
        text: path.marks.map((m) => m.label), hovertemplate: "%{text}<extra></extra>", showlegend: false,
      });
      traces.push({
        type: "scatter3d", mode: "markers",
        x: [path.contact.x * sg], y: [path.contact.y], z: [path.contact.z],
        marker: { size: 7, color: "#ffffff", line: { color: PATH_COLOR, width: 3 }, opacity: 1 },
        hovertemplate: "point of contact / miss<extra></extra>", showlegend: false,
      });
    }
    const yHi = path ? Math.max(60, Math.ceil(path.yStart + 6)) : 60;
    const yShift = (43 - (yHi + 26) / 2) / 86;     // keeps the default view on the hitter when the axis is longer
    const pathKey = path ? pathSel?.key ?? null : null;
    if (lastPathKey.current !== pathKey) {
      lastPathKey.current = pathKey;
      cameraRef.current = null;
      resetCounterRef.current += 1;
    }
    const cam = cameraRef.current ?? defaultCamera(sg, yShift);

    const xRange: [number, number] = sg > 0 ? [-30, 60] : [-60, 30];
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
          range: [-26, yHi],
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
        aspectratio: { x: 0.88, y: (yHi + 26) / 86, z: 0.86 },
        camera: cam,
        bgcolor: "rgba(0,0,0,0)",
        dragmode: "turntable",
      },
      uirevision: `${stand}-${resetCounterRef.current}`,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (Plotly as any).react(el, traces, layout, { responsive: true, displayModeBar: false });

    // Capture camera on user interaction
    setTimeout(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pel = el as any;
      if (pel.on) {
        pel.removeAllListeners?.("plotly_click");
        pel.on("plotly_click", (e: { points?: ChartClickPoint[] }) => {
          const pt = e?.points?.[0];
          if (pt) void handleChartClick(pt);
        });
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
  const smallSample =
    currentRow !== undefined &&
    (outcome === "whiff" ? (currentRow.swings ?? Infinity) < 150 : currentRow.bip < 50);

  // ── Click a cube or circle: find the plays behind it ───────────────────────────────────────────
  interface ChartClickPoint {
    x: number; y: number; z: number;
    customdata?: unknown;
    data?: { meta?: { kind?: string; oc?: Outcome } };
  }

  async function ensurePoints(): Promise<PointsJson | null> {
    if (typeof selectedId !== "number") return null;
    const key = `${season}:${selectedId}`;
    if (pointsRef.current?.key === key) return pointsRef.current.data;
    const data = await fetch(pointsJsonUrl(supabaseUrl, season, selectedId))
      .then((r) => (r.ok ? (r.json() as Promise<PointsJson>) : null))
      .catch(() => null);
    setPoints({ key, data });
    return data;
  }

  async function handleChartClick(pt: ChartClickPoint) {
    const meta = pt.data?.meta;
    if (!meta) return;
    const ocLabel = (o?: Outcome) => (o === "hard" ? "hard-hit balls" : o === "brl" ? "barrels" : o === "soft" ? "soft-hit balls" : "whiffs");
    if (meta.kind === "circle") {
      const ev = pt.customdata as EventPoint | undefined;
      if (!ev) return;
      setPathSel(null);
      setPlays({ title: "Selected play", subtitle: "Click another circle or cube to switch.", items: [{ ev }] });
      return;
    }
    if (meta.kind === "cube" && typeof selectedId === "number") {
      const sgNow = currentPayloadRef.current?.stand === "L" ? -1 : 1;
      const cx = pt.x * sgNow, cy = pt.y, cz = pt.z;
      const oc = meta.oc ?? outcome;
      const data = await ensurePoints();
      const hF = hand.match(/[RL]/)?.[0];
      const pF = hand.match(/[FBO]/)?.[0];
      const test = (c: number) => (oc === "hard" ? c === 2 || c === 3 : oc === "brl" ? c === 3 : oc === "soft" ? c === 5 : c === 1);
      const near = (data?.pts ?? [])
        .filter((p) => test(p[3]) && (!hF || p[5] === hF) && (!pF || p[6] === pF))
        .map((p) => ({ ev: p, dist: Math.hypot(p[0] - cx, p[1] - cy, p[2] - cz) }))
        .filter((x) => x.dist <= 12)
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 3);
      setPathSel(null);
      setPlays({
        title: `Nearest ${ocLabel(oc)} to this cube`,
        subtitle: `Cube at ${cx.toFixed(0)}″ off body, ${cy.toFixed(0)}″ out front, ${cz.toFixed(0)}″ high. Up to 3 plays within 12″.`,
        items: near,
      });
    }
  }

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
    resetCounterRef.current += 1;
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
    const q = normalize(query.trim());  // accent-insensitive: "rodriguez" finds "Rodríguez"
    const n = normalize(storedName);
    if (n.includes(q)) return true;
    const parts = n.split(", ");
    return parts.length === 2 && `${parts[1]} ${parts[0]}`.includes(q);
  }

  // ── Leaderboard ────────────────────────────────────────────────────────────
  // Cube columns follow the Per contact / Per swing toggle so the table matches the graph.
  const sortCol = /^(bip|sw)_(hard|brl)_in3$/.test(lbSort.col)
    ? outcome === "whiff"
      ? "sw_whiff_in3"
      : outcome === "soft"
      ? `${mode}_soft_in3`
      : lbSort.col.replace(/^(bip|sw)_/, `${mode}_`)
    : lbSort.col;
  const lbRows = leaderboard
    .filter((r) => r.split === hand)
    .filter((r) => !lbQualOnly || r.qualified)
    .filter((r) => !search || nameMatch(r.name, search))
    .sort((a, b) => {
      const av = ((a as unknown as Record<string, unknown>)[sortCol] as number | null) ?? -Infinity;
      const bv = ((b as unknown as Record<string, unknown>)[sortCol] as number | null) ?? -Infinity;
      return lbSort.asc ? av - bv : bv - av;
    });

  const modeLabel = mode === "bip" ? "per contact" : "per swing";

  // Threshold sliders: one per cube layer on screen (the main outcome, plus whiff when combined). Absent for seasons
  // published before the loose cubes.
  function sliderInfo(key: string) {
    const range = metaInfo?.slider?.[key];
    const fixed = metaInfo?.thresholds?.[key];
    const league = metaInfo?.league_rates?.[key];
    const value =
      range && fixed !== undefined ? Math.min(range[1], Math.max(range[0], thrMap[key] ?? fixed)) : 0;
    const isCustom =
      fixed !== undefined && thrMap[key] !== undefined && range !== undefined && Math.abs(value - fixed) > 1e-9;
    return { range, fixed, league, value, isCustom, step: key === "bip_hard" || key === "bip_soft" ? 0.01 : 0.005 };
  }
  const primarySliderKey = `${mode}_${outcome}`;
  const whiffOverlaySlider = alsoWhiff && outcome !== "whiff" && hasWhiff;
  const primaryCubeKey = `${mode}_${outcome === "hard" ? "hard" : outcome === "soft" ? "soft" : "brl"}_in3`;
  const primaryCubeLabel = outcome === "hard" ? "Hard-hit" : outcome === "soft" ? "Soft-hit" : "Barrel";
  const LB_COLS: { key: string; label: string; title: string }[] =
    outcome !== "whiff" && alsoWhiff && hasWhiff
      ? [
          { key: "name", label: "Player", title: "Player name" },
          { key: primaryCubeKey, label: `${primaryCubeLabel} cubes`, title: `${primaryCubeLabel} ${modeLabel} space (lit 3-inch cubes)` },
          { key: "sw_whiff_in3", label: "Whiff cubes", title: "Whiff space (lit 3-inch cubes): pockets where at least half of his swings miss" },
          { key: "bip", label: "BIP", title: "Balls in play" },
          { key: "swings", label: "Swings", title: "Swings" },
        ]
      : outcome === "whiff"
      ? [
          { key: "name", label: "Player", title: "Player name" },
          { key: "sw_whiff_in3", label: "Whiff cubes", title: "Whiff space (lit 3-inch cubes): pockets where at least half of his swings miss" },
          { key: "whiff_rate", label: "Whiff %", title: "Whiffs per swing" },
          { key: "swings", label: "Swings", title: "Swings" },
        ]
      : outcome === "soft"
      ? [
          { key: "name", label: "Player", title: "Player name" },
          { key: `${mode}_soft_in3`, label: "Soft-hit cubes", title: `Soft-hit ${modeLabel} space (lit 3-inch cubes): pockets where most contact is under 95 mph` },
          { key: `${mode}_hard_in3`, label: "Hard-hit cubes", title: `Hard-hit ${modeLabel} space (lit 3-inch cubes)` },
          { key: "bip", label: "BIP", title: "Balls in play" },
        ]
      : [
          { key: "name", label: "Player", title: "Player name" },
          { key: `${mode}_hard_in3`, label: "Hard-hit cubes", title: `Hard-hit ${modeLabel} space (lit 3-inch cubes)` },
          { key: `${mode}_brl_in3`, label: "Barrel cubes", title: `Barrel ${modeLabel} space (lit 3-inch cubes)` },
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
  // Hand and pitch type combine freely, but seasons published before the combos only have the two singles.
  function pickHand(h: HandSel) {
    setHandSel(h);
    if (h !== "A" && !hasCombos) setPitchSel(null);
  }
  function pickPitch(p: "F" | "B" | "O") {
    setPitchSel(pitchSel === p ? null : p);
    if (!hasCombos) setHandSel("A");
  }

  function renderSlider(key: string, oc: Outcome) {
    const info = sliderInfo(key);
    const range = info.range;
    const fixed = info.fixed;
    if (!range || fixed === undefined) return null;
    return (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 text-xs text-[var(--dim)]">
          <span className="font-medium w-28 shrink-0" style={{ color: outcomeColor(oc) }}>{oc === "whiff" ? "Whiff threshold" : "Threshold"}</span>
          <div className="relative w-56 sm:w-72">
            <input
              type="range"
              min={range[0]}
              max={range[1]}
              step={info.step}
              value={info.value}
              onChange={(e) => setThrMap((m) => ({ ...m, [key]: Number(e.target.value) }))}
              className="w-full"
              style={{ accentColor: outcomeColor(oc) }}
              aria-label={`${oc === "whiff" ? "Whiff" : oc === "brl" ? "Barrel" : oc === "soft" ? "Soft-hit" : "Hard-hit"} cube threshold`}
            />
            {/* Ticks: the standard bar (▲) and the league-average rate (│), so "normal" is visible on the track */}
            {[
              { v: fixed, label: "standard" },
              ...(info.league !== undefined ? [{ v: info.league, label: "league avg" }] : []),
            ].map((t) => {
              const pos = ((t.v - range[0]) / (range[1] - range[0])) * 100;
              if (pos < 0 || pos > 100) return null;
              return (
                <span
                  key={t.label}
                  title={`${t.label}: ${(t.v * 100).toFixed(1)}%`}
                  className="absolute -bottom-3 -translate-x-1/2 text-[9px] leading-none text-[var(--dimmer)] pointer-events-none"
                  style={{ left: `calc(${pos}% + ${(0.5 - pos / 100) * 16}px)` }}
                >
                  {t.label === "standard" ? "▲" : "│"}
                </span>
              );
            })}
          </div>
          <span className="tabular-nums text-[var(--text)] w-32 whitespace-nowrap">
            ≥ {(info.value * 100).toFixed(1)}% {key.startsWith("bip_") ? "of BIP" : "of swings"}
          </span>
          <button
            onClick={() =>
              setThrMap((m) => {
                const n = { ...m };
                delete n[key];
                return n;
              })
            }
            disabled={!info.isCustom}
            className="px-2 py-0.5 rounded border border-[var(--panel-border)] bg-[var(--panel)] hover:bg-[var(--bg)] text-[var(--text)] disabled:opacity-40 disabled:cursor-default transition-colors"
          >
            Reset
          </button>
          <span className="text-[10px] text-[var(--dimmer)]">
            ▲ standard {(fixed * 100).toFixed(1)}%
            {info.league !== undefined && <> · │ league avg {(info.league * 100).toFixed(1)}%</>}
            {" · leaderboard stays on the standard bar"}
          </span>
        </div>
    );
  }

  // Hard-hit and Barrel are alternatives; Whiff can be on with either, or alone. Something is always selected.
  function toggleType(k: CircleType) {
    circTouched.current = true;
    setCircTypes((t) => ({ ...t, [k]: !t[k] }));
  }
  function toggleRes(c: ResCode) {
    circTouched.current = true;
    setCircRes((r) => ({ ...r, [c]: !r[c] }));
  }
  // First time into Circles: start from whatever the cube view was showing.
  function switchView(v: "cubes" | "circles") {
    if (v === "circles" && !circTouched.current) setCircTypes(typesFromOutcome(outcome, alsoWhiff));
    setViewMode(v);
  }

  function pickOutcome(o: "hard" | "brl" | "soft" | "whiff") {
    if (o === "whiff") {
      if (outcome === "whiff") return;             // whiff is the only thing on
      setAlsoWhiff((v) => !v);
      return;
    }
    if (outcome === o) {
      if (alsoWhiff) { setOutcome("whiff"); setAlsoWhiff(false); }   // turn hard-hit / barrel off, leave whiff
      return;
    }
    if (outcome === "whiff") setAlsoWhiff(true);   // whiff stays on next to the new one
    setOutcome(o);
  }
  const circlesActive = viewMode === "circles" && typeof selectedId === "number";

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
            {circlesActive
              ? "Each dot is one swing, at the raw spot where it happened."
              : `3-inch pockets of space where ${outcome === "whiff" ? "swings turn into" : "contact becomes"} ${outcome === "hard" ? "a hard-hit ball (95+ mph)" : outcome === "whiff" ? "a swing-and-miss" : outcome === "soft" ? "a soft-hit ball (under 95 mph)" : "a barrel"}${alsoWhiff && outcome !== "whiff" ? " (and where swings miss, in green)" : ""}.`}
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
          <Btn on={handSel === "A"} onClick={() => pickHand("A")}>All pitchers</Btn>
          <Btn on={handSel === "R"} onClick={() => pickHand("R")}>vs RHP</Btn>
          <Btn on={handSel === "L"} onClick={() => pickHand("L")}>vs LHP</Btn>
        </div>

        {/* Pitch type. Only when this season's files carry the pitch-group maps. */}
        {hasPitchGroups && (
          <>
          <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />
          <div className="flex gap-1">
            <Btn on={pitchSel === "F"} onClick={() => pickPitch("F")}>Fastball</Btn>
            <Btn on={pitchSel === "B"} onClick={() => pickPitch("B")}>Breaking</Btn>
            <Btn on={pitchSel === "O"} onClick={() => pickPitch("O")}>Offspeed</Btn>
          </div>
          </>
        )}

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* Outcome */}
        {circlesActive ? (
          <>
            {/* Circles: every layer is its own toggle */}
            <div className="flex flex-wrap gap-1" title="Which kinds of pitches to show as circles">
              {TYPE_BUTTON_ORDER.map((k) => (
                <Btn key={k} on={circTypes[k]} onClick={() => toggleType(k)}>{typeInfo(k).label}</Btn>
              ))}
            </div>
            <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />
            <div className="flex flex-wrap items-center gap-1" title="How the plate appearance ended on that pitch">
              <span className="text-xs text-[var(--dimmer)] mr-0.5">Result</span>
              {RESULTS.map((r) => (
                <Btn key={r.code} on={circRes[r.code]} onClick={() => toggleRes(r.code)}>{r.label}</Btn>
              ))}
            </div>
          </>
        ) : (
          <div className="flex gap-1" title="Whiff can be shown together with Hard-hit, Barrel or Soft-hit">
            <Btn on={outcome === "hard"} onClick={() => pickOutcome("hard")}>Hard-hit</Btn>
            <Btn on={outcome === "brl"} onClick={() => pickOutcome("brl")}>Barrel</Btn>
            {hasSoft && <Btn on={outcome === "soft"} onClick={() => pickOutcome("soft")}>Soft-hit</Btn>}
            {hasWhiff && <Btn on={outcome === "whiff" || alsoWhiff} onClick={() => pickOutcome("whiff")}>Whiff</Btn>}
          </div>
        )}

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* Mode */}
        <div
          className={`flex gap-1 ${outcome === "whiff" || circlesActive ? "opacity-40 pointer-events-none" : ""}`}
          title={circlesActive ? "Circles show every event, so contact vs swing does not apply" : outcome === "whiff" ? "Whiff maps are always per swing" : alsoWhiff ? "Applies to the hard-hit / barrel cubes; whiff is always per swing" : undefined}
        >
          <Btn on={mode === "bip"} onClick={() => setModeSel("bip")}>Per contact</Btn>
          <Btn on={mode === "sw"} onClick={() => setModeSel("sw")}>Per swing</Btn>
        </div>

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        {/* View: smoothed cubes or raw event circles */}
        <div
          className={`flex gap-1 ${typeof selectedId !== "number" ? "opacity-40 pointer-events-none" : ""}`}
          title={typeof selectedId !== "number" ? "Circles need a hitter (league averages have no individual events)" : "Cubes are smoothed rate maps; circles are each individual event at its raw location"}
        >
          <Btn on={viewMode === "cubes"} onClick={() => switchView("cubes")}>Cubes</Btn>
          <Btn on={viewMode === "circles"} onClick={() => switchView("circles")}>Circles</Btn>
        </div>

        <span className="w-px h-4 bg-[var(--rule)] mx-1 hidden sm:block" />

        <Btn on={showFig} onClick={() => setShowFig((v) => !v)}>Figure</Btn>
        <Btn on={showZone} onClick={() => setShowZone((v) => !v)}>Zone</Btn>
        <Btn on={showBox} onClick={() => setShowBox((v) => !v)}>Batter&rsquo;s box</Btn>
        {stanceRows.length > 0 && (
          <Btn on={showStanceLabels} onClick={() => setShowStanceLabels((v) => !v)}>Stance labels</Btn>
        )}
      </div>

      {/* Threshold sliders (cube view only) */}
      {!circlesActive && renderSlider(primarySliderKey, outcome)}
      {!circlesActive && whiffOverlaySlider && renderSlider("sw_whiff", "whiff")}

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
          className="w-full rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] overflow-hidden h-[360px] sm:h-[560px]"
        />
        <div className="absolute top-3 right-3 flex flex-col items-end gap-2 pointer-events-none">
        {playerBadge && (() => {
          const storedName = allRows.find((r) => r.mlbam === playerBadge.mlbam)?.name ?? "";
          return (
            <div className="flex items-center gap-2">
              {storedName && (
                <span className="text-sm font-semibold text-[var(--text)] drop-shadow-sm text-right leading-snug">
                  {displayName(storedName)}
                  <span className="block text-xs font-normal text-[var(--dim)]">
                    {season}{hand !== "A" ? ` · ${SPLIT_LABEL[hand]}` : ""}
                  </span>
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
          {/* Chart labels, in the layer colors, so screenshots say what they show */}
          {circlesActive ? (
            <>
              {TYPE_BUTTON_ORDER.filter((k) => circTypes[k]).map((k) => (
                <span key={k} className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] leading-4 font-semibold text-white" style={{ background: typeInfo(k).color }}>
                  {typeInfo(k).label}
                  <span className="font-normal opacity-85">· each event</span>
                </span>
              ))}
              {RESULTS.filter((r) => circRes[r.code]).map((r) => (
                <span key={r.code} className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] leading-4 font-semibold text-white" style={{ background: r.color }}>
                  {r.label}
                  <span className="font-normal opacity-85">· result</span>
                </span>
              ))}
            </>
          ) : (
            <>
              <span
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] leading-4 font-semibold text-white"
                style={{ background: outcomeColor(outcome) }}
              >
                {outcome === "hard" ? "Hard-hit" : outcome === "whiff" ? "Whiffs" : outcome === "soft" ? "Soft-hit" : "Barrels"}
                <span className="font-normal opacity-85">· {mode === "bip" ? "per contact" : "per swing"}</span>
              </span>
              {alsoWhiff && outcome !== "whiff" && (
                <span
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] leading-4 font-semibold text-white"
                  style={{ background: outcomeColor("whiff") }}
                >
                  Whiffs
                  <span className="font-normal opacity-85">· per swing</span>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      <p className="text-xs text-[var(--dimmer)] px-1 -mt-2">
        Click a cube or circle to see the plays behind it and watch the video.
      </p>

      {plays && (
        <PlayPanel
          title={plays.title}
          subtitle={plays.subtitle}
          items={plays.items}
          onClose={() => { setPlays(null); setPathSel(null); }}
          onShowPath={(ev, traj) => setPathSel((p) => (p?.key === evKey(ev) ? null : { key: evKey(ev), ev, traj }))}
          activePathKey={pathSel?.key ?? null}
        />
      )}

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

      {/* Stance at contact */}
      {typeof selectedId === "number" && (
        <StancePanel
          rows={stanceRows}
          league={leagueStance}
          season={season}
          split={hand}
          name={displayName(allRows.find((r) => r.mlbam === selectedId)?.name ?? "")}
        />
      )}

      {/* Leaderboard */}
      <section className="rounded-xl border border-[var(--panel-border)] bg-[var(--panel)] overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[var(--rule)]">
          <h2 className="font-semibold text-sm">
            Leaderboard —{" "}
            {SPLIT_LABEL[hand]}, {modeLabel}
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
                      sortCol === col.key ? "text-[var(--text)]" : ""
                    }`}
                  >
                    {col.label}
                    {sortCol === col.key && (
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
                  {LB_COLS.slice(1).map((col) => (
                    <td
                      key={col.key}
                      className={`px-3 py-1.5 tabular-nums ${col.key === "bip" || col.key === "swings" ? "text-[var(--dim)]" : ""}`}
                    >
                      {col.key === "whiff_rate"
                        ? r.whiff_rate != null ? `${(r.whiff_rate * 100).toFixed(1)}%` : "—"
                        : (((r as unknown as Record<string, number | null>)[col.key]) ?? (col.key.endsWith("_in3") ? 0 : "—")).toLocaleString()}
                    </td>
                  ))}
                </tr>
              ))}
              {lbRows.length === 0 && (
                <tr>
                  <td colSpan={4}className="px-3 py-6 text-center text-[var(--dim)] text-sm">
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
          <strong className="text-[var(--text)]">Hard-Hit Possibility Space (HHPS)</strong>{" "}
          maps where in the space around a hitter&rsquo;s body his contact turns into a hard-hit ball
          (95+ mph exit velocity). Each orange cube is a 3-inch pocket. <strong className="text-[var(--text)]">Barrel Space</strong>{" "}
          (purple) does the same for barrels, using Baseball Savant&rsquo;s own barrel flag, so barrel
          counts match Savant.
        </p>
        <p>
          <strong className="text-[var(--text)]">Per contact</strong>{" "}
          asks: of the balls he put in play from this pocket, what share were hard-hit (or barrels)?{" "}
          <strong className="text-[var(--text)]">Per swing</strong>{" "}
          also counts whiffs and fouls as swings that didn&rsquo;t produce the outcome, so it penalizes
          swing-and-miss.
        </p>
        <p>
          <strong className="text-[var(--text)]">Cutoffs:</strong>{" "}
          a cube lights up when the hitter&rsquo;s rate in that pocket reaches a fixed bar, the same for
          every hitter, split and season:
        </p>
        <ul className="list-disc pl-5 space-y-0.5 -mt-1">
          <li>Hard-hit, per contact: at least <strong className="text-[var(--text)]">50%</strong> of balls in play are 95+ mph</li>
          <li>Hard-hit, per swing: at least <strong className="text-[var(--text)]">22%</strong> of swings produce a 95+ mph ball</li>
          <li>Barrel, per contact: at least <strong className="text-[var(--text)]">15%</strong> of balls in play are barrels</li>
          <li>Barrel, per swing: at least <strong className="text-[var(--text)]">7.5%</strong> of swings produce a barrel</li>
          <li>Whiff, per swing: at least <strong className="text-[var(--text)]">50%</strong> of swings are misses (league average is about 23%)</li>
        </ul>
        <p>
          Because the bars are fixed, a hitter&rsquo;s cube count can be compared across seasons. The
          grey dots mark the pockets holding 90% of all league batted balls, the contact space a hitter
          can realistically reach; cubes only light up inside it.
        </p>
        <p>
          <strong className="text-[var(--text)]">Stance at contact</strong>{" "}
          comes from Baseball Savant&rsquo;s batting-stance tracking, which records where the hitter&rsquo;s
          feet are at three moments: in his stance, at pitch release, and at bat-ball contact. The panel below
          the chart shows feet apart and foot angle at each moment (negative angle is an open stance,
          positive is closed) and his stride. Stance
          depth is how far behind the front of the plate he stands, and it also sets how far out front the
          blue strike-zone plane is drawn for each hitter. Depth at contact is derived from how far his feet
          move toward the pitcher. In the 3D view the figure&rsquo;s legs and feet are drawn at his real
          contact stance (the upper body stays generic), home plate and his batter&rsquo;s box are on the ground
          so you can see where he stands, and the Stance labels button prints feet apart, foot angle and depth
          at contact right on the ground.
        </p>
        <p>
          <strong className="text-[var(--text)]">Pitch path:</strong>{" "}
          on any play card, <em>Show pitch path</em> draws the real flight of that pitch, from the MLB game
          feed&rsquo;s tracking (release point, velocity and acceleration). The last nine feet of its approach
          come in from the pitcher&rsquo;s side, with a dot every 10 milliseconds (wider spacing means a faster
          pitch) and a dashed line showing where it was headed past the contact or miss point. The path is
          placed in the hitter&rsquo;s frame so it passes through that play&rsquo;s contact point, which makes it
          accurate to within a few inches. Circles are plotted at the height the pitch crossed the plate, so the
          path can pass a couple of inches above or below one. The depth axis stretches only while a path is showing.
          The card also lists the pitch&rsquo;s spin rate and its horizontal and induced vertical break.
        </p>
        <p>
          <strong className="text-[var(--text)]">Watch the plays:</strong>{" "}
          click a circle to open that exact play, or click a cube to see the nearest hard-hit balls, barrels or
          whiffs (up to three within 12 inches of the cube&rsquo;s center, for the hand and pitch type you have
          selected). Each card shows the matchup, inning, date and result from the MLB game feed, with a
          link that opens the clip on Baseball Savant. Whiff cards also show how far the bat missed the
          ball. Video links need the play&rsquo;s game id, which is filled in for every play in the data.
        </p>
        <p>
          <strong className="text-[var(--text)]">Soft-hit</strong>{" "}
          (gold) is any ball in play under 95 mph, the opposite of Hard-hit. Because most contact is soft (about
          62% league-wide), its bars are high: a pocket lights when at least <strong className="text-[var(--text)]">80%</strong> of
          balls in play there are soft (per contact), or at least <strong className="text-[var(--text)]">35%</strong> of
          swings end in a soft ball in play (per swing). It has its own slider and leaderboard columns like Hard-hit.
          Rank 1 on the leaderboard is the most soft-hit cubes, meaning the softest map, not the best.
        </p>
        <p>
          <strong className="text-[var(--text)]">Circles layers:</strong>{" "}
          in Circles every pitch type is its own button (Hard-hit, Barrel, Soft-hit, Whiff, Foul) and you can turn
          any combination on. Fouls are foul balls and foul tips (bunts excluded), so every swing is exactly one
          of whiff, foul or in play. The <em>Result</em> buttons (Single, Double, Triple, Home run, Out in
          play, Strikeout) show the pitch that ended a plate appearance that way, each in its own color; an event
          that matches an active result is drawn in the result color, otherwise in its type color. Out in play
          includes every non-hit result on a ball in play (field outs, force outs, double plays, sacrifices,
          errors and fielder&rsquo;s choices). Strikeouts here are swinging strikeouts, because a called strike
          has no swing to locate.
        </p>
        <p>
          <strong className="text-[var(--text)]">Combining outcomes and circles:</strong>{" "}
          Whiff can be switched on together with Hard-hit or Barrel: the whiff cubes appear as green squares, the same size as the other cubes, on
          top of the orange or purple cubes, each with its own threshold slider (whiff is always per swing).
          The <em>Circles</em> button swaps the smoothed cubes for the raw events themselves: every hard-hit
          ball, barrel and whiff at the exact spot it happened (hover for exit velocity), following the hand and
          pitch-type buttons. Circles show counts, not rates, so the threshold slider and the leaderboard ranks
          do not apply to them.
        </p>
        <p>
          <strong className="text-[var(--text)]">Whiff map</strong>{" "}
          (green) shows where the ball was, relative to his body, on swings he missed. It is always per
          swing: each pocket&rsquo;s rate is whiffs divided by swings there. It lives in swing space
          (the pockets holding 90% of league swings), which is wider than contact space because it includes
          pitches he swings through, and a cube needs at least 2 whiffs nearby. A whiff is a swinging strike
          (foul tips are not counted). Height is where the pitch crossed the plate, like the other maps.
          The leaderboard for this view ranks by whiff cubes, so rank 1 means the most whiff-prone map.
        </p>
        <p>
          <strong className="text-[var(--text)]">Threshold slider:</strong>{" "}
          drag it to change how high a pocket&rsquo;s rate must be to light up. Lower it to see where a
          hitter does <em>some</em> damage; raise it to isolate his true sweet spot. The ▲ marks the
          standard bar and the │ marks the league-average rate. The slider is capped to a sensible
          range, and the 4% coverage floor and 2-ball minimum never change. The leaderboard and ranks
          always use the standard bar, so a custom view shows its live cube count with no rank. Share a
          custom view with the <code>thr</code> link parameter.
        </p>
        <p>
          <strong className="text-[var(--text)]">Each map is the hitter&rsquo;s own data</strong>{" "}
          (no blending with league average), smoothed so nearby balls in play count toward a pocket. A
          cube only shows where he has at least 2 balls in play nearby (in both modes) and at
          least 4% of his peak contact density, so one lucky ball can&rsquo;t light up a whole region and
          smoothing can&rsquo;t reach pockets he rarely gets to. Small samples show few cubes by design.
          Leaderboard numbers count lit 3-inch cubes.
        </p>
        <p>
          <strong className="text-[var(--text)]">Pitch type</strong>{" "}
          filters to one family of pitch, against pitchers of both hands: Fastball (four-seam, sinker,
          cutter), Breaking (slider, sweeper, curve, knuckle-curve, slurve) or Offspeed (changeup,
          splitter, forkball). The same fixed bars apply, so breaking and offspeed maps light far fewer
          cubes (those pitches are simply hit less hard), and offspeed barrel maps are often empty.
          A pitch type can also be combined with a pitcher hand (for example breaking balls vs LHP).
          Those samples are small, especially offspeed vs one hand (a regular has a few dozen balls in
          play), so expect sparse maps there.
        </p>
        <p className="text-xs text-[var(--dimmer)]">
          Known limitations: the ABS zone is drawn at each hitter&rsquo;s stance depth (from Savant&rsquo;s batting-stance data, league median about 29&Prime;); where that is missing it falls back to a 19&Prime; placeholder. The figure is
          generic, not the hitter&rsquo;s real body. vs LHP samples are small (&sim;80 BIP for a regular).
          In the All view a switch hitter&rsquo;s two sides are combined.
        </p>
      </section>
    </main>
  );
}

