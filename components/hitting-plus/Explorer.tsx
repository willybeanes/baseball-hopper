"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { COMPONENT_KEYS, DepthKey, SwingPlusData } from "@/lib/hitting-plus/types";
import { buildPercentiles, fieldPercentileValue, leagueMean, pairedFieldPercentileValue } from "@/lib/hitting-plus/metrics";
import { FOOTER_COPY, PA_FILTER_NOTE } from "@/lib/hitting-plus/copy";
import SearchBox from "./SearchBox";
import PlayerCard from "./PlayerCard";
import Leaderboard from "./Leaderboard";
import Compare from "./Compare";
import HowItWorks from "./HowItWorks";
import Teams from "./Teams";

type Tab = "card" | "leaderboard" | "compare" | "teams" | "how";
const TAB_KEYS: Tab[] = ["card", "leaderboard", "compare", "teams", "how"];

const DEPTH_KEYS: DepthKey[] = ["depth_FB", "depth_BR", "depth_OS"];
const PCT_KEYS = [...COMPONENT_KEYS, "Hitting+", "xwoba", "wrc_plus"] as const;
const PA_PRESETS = [10, 50, 150, 300, 500];
const DEFAULT_MIN_PA = 150;

const TABS: { key: Tab; label: string }[] = [
  { key: "card", label: "Player" },
  { key: "leaderboard", label: "Leaderboard" },
  { key: "compare", label: "Compare" },
  { key: "teams", label: "Teams" },
  { key: "how", label: "How it works" },
];

export default function Explorer({ data }: { data: SwingPlusData }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seasons = useMemo(() => [...data.seasons].sort((a, b) => b - a), [data.seasons]);

  const [tab, setTab] = useState<Tab>(() => {
    const q = searchParams.get("tab");
    return TAB_KEYS.includes(q as Tab) ? (q as Tab) : "card";
  });
  const [season, setSeason] = useState<number>(() => {
    const q = Number(searchParams.get("season"));
    return seasons.includes(q) ? q : seasons[0];
  });
  const [minPA, setMinPA] = useState<number>(() => {
    const q = Number(searchParams.get("minPA"));
    return Number.isFinite(q) && q > 0 ? q : DEFAULT_MIN_PA;
  });
  const [compareNames, setCompareNames] = useState<string[]>(() => {
    const q = searchParams.get("compare");
    return q ? q.split("|").filter(Boolean) : [];
  });
  const [teamFilter, setTeamFilter] = useState<string>(() => searchParams.get("team") ?? "");

  const seasonPlayers = useMemo(
    () => data.players.filter((p) => p.game_year === season),
    [data.players, season]
  );

  // The percentile baseline is always the qualified pool for the season, never the
  // PA-filtered view. Moving the filter changes who is visible, not what 100 means.
  const qualifiedSeasonPlayers = useMemo(
    () => seasonPlayers.filter((p) => p.qualified),
    [seasonPlayers]
  );

  const visiblePlayers = useMemo(
    () => seasonPlayers.filter((p) => p.pa >= minPA),
    [seasonPlayers, minPA]
  );

  const [pickedName, setPickedName] = useState<string | null>(() => {
    const q = searchParams.get("player");
    if (q) return q;
    const best = [...data.players]
      .filter((p) => p.game_year === seasons[0])
      .sort((a, b) => (b["Hitting+"] ?? -Infinity) - (a["Hitting+"] ?? -Infinity))[0];
    return best?.player_name ?? null;
  });

  const picked = useMemo(
    () => (pickedName ? seasonPlayers.find((p) => p.player_name === pickedName) ?? null : null),
    [seasonPlayers, pickedName]
  );

  // Percentile functions for every season, not just the selected one, so the year-over-year
  // table can color each season by that season's own qualified pool.
  const pctBySeason = useMemo(() => {
    const map: Record<number, ReturnType<typeof buildPercentiles<(typeof PCT_KEYS)[number]>>> = {};
    for (const s of seasons) {
      const qualified = data.players.filter((p) => p.game_year === s && p.qualified);
      map[s] = buildPercentiles(qualified, PCT_KEYS);
    }
    return map;
  }, [data.players, seasons]);

  const pct = pctBySeason[season];

  const playerHistory = useMemo(
    () => (pickedName ? data.players.filter((p) => p.player_name === pickedName) : []),
    [data.players, pickedName]
  );

  const leagueDepth = useMemo(() => {
    const out = {} as Record<DepthKey, number>;
    for (const k of DEPTH_KEYS) out[k] = leagueMean(qualifiedSeasonPlayers, k);
    return out;
  }, [qualifiedSeasonPlayers]);

  // The gap between a hitter's own breaking/offspeed depth and their own fastball depth
  // is what "fooled" and Timing+ actually grade, so the elite reference is the least-fooled
  // hitters' gap (10th percentile of that per-player difference), not the best raw depth.
  const eliteGap = useMemo(() => {
    return {
      depth_BR: pairedFieldPercentileValue(qualifiedSeasonPlayers, "depth_BR", "depth_FB", 10) ?? 0,
      depth_OS: pairedFieldPercentileValue(qualifiedSeasonPlayers, "depth_OS", "depth_FB", 10) ?? 0,
    };
  }, [qualifiedSeasonPlayers]);

  // Contact+ grades whiff_rate against exp_whiff (the expected whiff rate for the
  // location, count and pitch type actually swung at), not a flat rate, so the
  // meaningful quantity is that per-player gap. Elite is the 10th percentile of the
  // gap (least worse than expected), matching the Timing+ pattern.
  const leagueWhiffGap = useMemo(() => {
    const gaps = qualifiedSeasonPlayers
      .map((p) => (p.whiff_rate != null && p.exp_whiff != null ? p.whiff_rate - p.exp_whiff : null))
      .filter((v): v is number => v != null);
    return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : 0;
  }, [qualifiedSeasonPlayers]);
  const eliteWhiffGap = useMemo(
    () => pairedFieldPercentileValue(qualifiedSeasonPlayers, "whiff_rate", "exp_whiff", 10) ?? 0,
    [qualifiedSeasonPlayers]
  );

  // Bat speed and lift, both already expressed as deltas versus expected, so higher is
  // better on both axes and "elite" is the 90th percentile of each independently.
  const leagueBS = useMemo(() => leagueMean(qualifiedSeasonPlayers, "paBS"), [qualifiedSeasonPlayers]);
  const leagueAA = useMemo(() => leagueMean(qualifiedSeasonPlayers, "paAA"), [qualifiedSeasonPlayers]);
  const eliteBS = useMemo(
    () => fieldPercentileValue(qualifiedSeasonPlayers, "paBS", 90) ?? 0,
    [qualifiedSeasonPlayers]
  );
  const eliteAA = useMemo(
    () => fieldPercentileValue(qualifiedSeasonPlayers, "paAA", 90) ?? 0,
    [qualifiedSeasonPlayers]
  );

  // Reflect the current view in the URL so it can be bookmarked or shared. Guarded so it
  // only replaces when the query actually differs, since useSearchParams re-suspends the
  // Suspense boundary above on every navigation and an unguarded replace loops forever.
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "card") params.set("tab", tab);
    params.set("season", String(season));
    if (tab === "card" && pickedName) params.set("player", pickedName);
    if (minPA !== DEFAULT_MIN_PA) params.set("minPA", String(minPA));
    if (tab === "compare" && compareNames.length > 0) {
      params.set("compare", compareNames.join("|"));
    }
    if (tab === "leaderboard" && teamFilter) params.set("team", teamFilter);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      router.replace(`${pathname}?${next}`, { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, season, pickedName, minPA, compareNames, teamFilter]);

  const selectPlayer = useCallback((name: string) => {
    setPickedName(name);
    setTab("card");
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const selectSeason = useCallback((year: number) => {
    setSeason(year);
  }, []);

  return (
    <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-20 pt-0 sm:px-5">
      <header className="mb-6 pb-5 pt-8">
        <div className="flex flex-wrap items-baseline gap-3.5">
          <h1 className="text-[28px] font-bold tracking-tight sm:text-[32px]">
            Hitting<span className="text-[var(--accent)]">+</span>
          </h1>
        </div>
        <p className="mt-2 max-w-[52ch] text-[15px] text-[var(--dim)]">
          Four graded inputs, in the order a swing happens. Every component measures the swing itself, never the
          result.
        </p>
        <p className="mt-3 text-xs text-[var(--dimmer)]">
          {data.source} &middot; generated {data.generated}
        </p>
      </header>

      <div className="mb-5 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-3 shadow-[var(--panel-shadow)]">
        <div className="flex flex-wrap items-center gap-2.5">
          <nav className="flex gap-1" aria-label="View">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors ${
                  tab === t.key
                    ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                    : "border-transparent bg-transparent text-[var(--dim)] hover:text-[var(--text)]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>

          {tab === "card" && <SearchBox players={seasonPlayers} onSelect={selectPlayer} />}

          {tab !== "how" && (
            <label className="ml-auto flex items-center gap-2 text-xs font-medium text-[var(--dim)]">
              Season
              <select
                value={season}
                onChange={(e) => setSeason(Number(e.target.value))}
                className="rounded-lg border border-[var(--rule)] bg-white px-2.5 py-2 text-[13px] text-[var(--text)]"
              >
                {seasons.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>

        {tab === "leaderboard" && (
          <>
            <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-[var(--rule)] pt-3">
              <span className="text-xs font-medium text-[var(--dim)]">Min PA</span>
              <div className="flex gap-1" role="group" aria-label="Minimum plate appearances">
                {PA_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setMinPA(n)}
                    aria-pressed={minPA === n}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      minPA === n
                        ? "border-[var(--accent)] bg-[var(--accent)] text-white"
                        : "border-[var(--rule)] bg-white text-[var(--dim)] hover:text-[var(--text)]"
                    }`}
                  >
                    {n}+
                  </button>
                ))}
              </div>
              <span className="text-xs text-[var(--dimmer)]">{visiblePlayers.length} shown</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--dimmer)]">{PA_FILTER_NOTE}</p>
          </>
        )}
      </div>

      {tab === "card" &&
        (picked ? (
          <PlayerCard
            player={picked}
            pct={pct}
            leagueDepth={leagueDepth}
            eliteGap={eliteGap}
            leagueWhiffGap={leagueWhiffGap}
            eliteWhiffGap={eliteWhiffGap}
            leagueBS={leagueBS}
            leagueAA={leagueAA}
            eliteBS={eliteBS}
            eliteAA={eliteAA}
            history={playerHistory}
            pctBySeason={pctBySeason}
            onSelectSeason={selectSeason}
          />
        ) : (
          <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-7 py-11 text-center text-[var(--dim)] shadow-[var(--panel-shadow)]">
            <p className="mb-1.5 text-base font-semibold text-[var(--text)]">No hitter selected</p>
            <p>Search a name above, or pick one from the leaderboard.</p>
          </div>
        ))}

      {tab === "leaderboard" && (
        <Leaderboard
          players={visiblePlayers}
          pct={pct}
          onSelect={selectPlayer}
          minPA={minPA}
          season={season}
          teamFilter={teamFilter}
          onChangeTeamFilter={setTeamFilter}
        />
      )}

      {tab === "compare" && (
        <Compare
          players={seasonPlayers}
          searchPool={visiblePlayers}
          pct={pct}
          selected={compareNames}
          onChangeSelected={setCompareNames}
        />
      )}

      {tab === "teams" && (
        <Teams
          players={seasonPlayers}
          season={season}
          pct={pct}
          onSelectPlayer={selectPlayer}
        />
      )}

      {tab === "how" && <HowItWorks />}

      <footer className="mt-9 space-y-3 border-t border-[var(--rule)] pt-5 text-xs leading-relaxed text-[var(--dimmer)]">
        {FOOTER_COPY.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </footer>
    </div>
  );
}
