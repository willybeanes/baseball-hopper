"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SwingPlusData } from "@/lib/hitting-plus/types";
import { buildPercentiles } from "@/lib/hitting-plus/metrics";
import { PCT_KEYS } from "@/lib/hitting-plus/context";
import { FOOTER_COPY, PA_FILTER_NOTE } from "@/lib/hitting-plus/copy";
import SearchBox from "./SearchBox";
import Leaderboard from "./Leaderboard";
import Compare from "./Compare";
import HowItWorks from "./HowItWorks";
import Teams from "./Teams";

type Tab = "leaderboard" | "compare" | "teams" | "how";
const TAB_KEYS: Tab[] = ["leaderboard", "compare", "teams", "how"];
const DEFAULT_MIN_PA = 150;
const MAX_MIN_PA = 600;
/** Quick-pick stops under the slider. 502 is the batting-title line (3.1 PA x 162 games). */
const PA_STOPS = [
  { pa: 10, label: "10" },
  { pa: 50, label: "50" },
  { pa: 150, label: "150" },
  { pa: 300, label: "300" },
  { pa: 502, label: "Qual." },
];

const TABS: { key: Tab; label: string }[] = [
  { key: "leaderboard", label: "Leaderboard" },
  { key: "compare", label: "Compare" },
  { key: "teams", label: "Teams" },
  { key: "how", label: "How it works" },
];

/** Pitcher-hand split from the URL: "L" or "R", anything else means no split. */
function parseHand(q: string | null): string {
  return q === "L" || q === "R" ? q : "";
}

/**
 * Leaderboard, compare and team views. A single hitter opens on /player/<mlbam id>, so
 * `ids` maps stored names to MLBAM ids for every player link.
 */
export default function Explorer({ data, ids }: { data: SwingPlusData; ids: Record<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const seasons = useMemo(() => [...data.seasons].sort((a, b) => b - a), [data.seasons]);

  const [tab, setTab] = useState<Tab>(() => {
    const q = searchParams.get("tab");
    return TAB_KEYS.includes(q as Tab) ? (q as Tab) : "leaderboard";
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
  const [rookieOnly, setRookieOnly] = useState<boolean>(() => searchParams.get("rookie") === "1");
  const [hand, setHand] = useState<string>(() => parseHand(searchParams.get("hand")));

  const seasonPlayers = useMemo(
    () => data.players.filter((p) => p.game_year === season),
    [data.players, season]
  );

  const visiblePlayers = useMemo(
    () => seasonPlayers.filter((p) => p.pa >= minPA),
    [seasonPlayers, minPA]
  );

  const rookieNames = useMemo(() => {
    const result = new Set<string>();
    // Prefer FanGraphs' rookie flag; fall back to first season in the dataset for players
    // the flag could not be joined to.
    const firstSeason = new Map<string, number>();
    for (const p of data.players) {
      const cur = firstSeason.get(p.player_name);
      if (cur === undefined || p.game_year < cur) firstSeason.set(p.player_name, p.game_year);
    }
    for (const p of data.players) {
      if (p.game_year !== season) continue;
      if (p.rookie ?? firstSeason.get(p.player_name) === season) result.add(p.player_name);
    }
    return result;
  }, [data.players, season]);

  // The percentile baseline is always the qualified pool for the season, never the
  // PA-filtered view. Moving the filter changes who is visible, not what 100 means.
  const pct = useMemo(
    () => buildPercentiles(seasonPlayers.filter((p) => p.qualified), PCT_KEYS),
    [seasonPlayers]
  );

  // Sync state from URL when the user navigates back/forward. The guard in the state→URL
  // effect below means this won't loop: after this sets state, that effect will see
  // next === searchParams.toString() and skip the navigation.
  useEffect(() => {
    const q = searchParams.get("tab");
    setTab(TAB_KEYS.includes(q as Tab) ? (q as Tab) : "leaderboard");
    const s = Number(searchParams.get("season"));
    if (seasons.includes(s)) setSeason(s);
    const m = Number(searchParams.get("minPA"));
    setMinPA(Number.isFinite(m) && m > 0 ? m : DEFAULT_MIN_PA);
    const c = searchParams.get("compare");
    setCompareNames(c ? c.split("|").filter(Boolean) : []);
    setTeamFilter(searchParams.get("team") ?? "");
    setRookieOnly(searchParams.get("rookie") === "1");
    setHand(parseHand(searchParams.get("hand")));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Reflect the current view in the URL so it can be bookmarked or shared. Guarded so it
  // only fires when the query actually differs, since useSearchParams re-suspends the
  // Suspense boundary above on every navigation and an unguarded replace loops forever.
  // Tab changes push a new history entry so the back button works; filter-only changes
  // (season, minPA, team) replace so they don't spam the history stack.
  const prevTabRef = useRef(tab);
  useEffect(() => {
    const params = new URLSearchParams();
    if (tab !== "leaderboard") params.set("tab", tab);
    params.set("season", String(season));
    if (minPA !== DEFAULT_MIN_PA) params.set("minPA", String(minPA));
    if (tab === "compare" && compareNames.length > 0) {
      params.set("compare", compareNames.join("|"));
    }
    if (tab === "leaderboard" && teamFilter) params.set("team", teamFilter);
    if (tab === "leaderboard" && rookieOnly) params.set("rookie", "1");
    if (tab === "leaderboard" && hand) params.set("hand", hand);
    const next = params.toString();
    if (next !== searchParams.toString()) {
      const tabChanged = prevTabRef.current !== tab;
      prevTabRef.current = tab;
      if (tabChanged) {
        router.push(`${pathname}?${next}`, { scroll: false });
      } else {
        router.replace(`${pathname}?${next}`, { scroll: false });
      }
    } else {
      prevTabRef.current = tab;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, season, minPA, compareNames, teamFilter, rookieOnly, hand]);

  const selectPlayer = useCallback(
    (name: string) => {
      const id = ids[name];
      if (id) router.push(`/player/${id}?season=${season}`);
    },
    [ids, season, router]
  );

  // Old shared links (?player=… or ?tab=card) pointed at the Player tab, which now lives
  // on the player page.
  useEffect(() => {
    const legacyTab = searchParams.get("tab");
    const name = searchParams.get("player");
    if (legacyTab && legacyTab !== "card") return;
    const id = name ? ids[name] : undefined;
    if (id) {
      const s = searchParams.get("season");
      router.replace(`/player/${id}${s ? `?season=${s}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

          {tab !== "how" && <SearchBox players={seasonPlayers} onSelect={selectPlayer} />}

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
              <div className="relative mb-5 w-48 sm:w-72">
                <input
                  type="range"
                  min={1}
                  max={MAX_MIN_PA}
                  step={1}
                  value={Math.min(minPA, MAX_MIN_PA)}
                  onChange={(e) => setMinPA(Number(e.target.value))}
                  aria-label="Minimum plate appearances"
                  className="block h-1.5 w-full cursor-pointer accent-[var(--accent)]"
                />
                {/* Stops sit on the track, inset by half the thumb width so they line up with the thumb centre. */}
                {PA_STOPS.map(({ pa, label }) => (
                  <button
                    key={pa}
                    type="button"
                    onClick={() => setMinPA(pa)}
                    aria-pressed={minPA === pa}
                    aria-label={`Minimum ${pa} plate appearances`}
                    style={{ left: `calc(8px + (100% - 16px) * ${(pa - 1) / (MAX_MIN_PA - 1)})` }}
                    className="group absolute top-[3px] -translate-x-1/2 -translate-y-1/2"
                  >
                    <span
                      className={`block h-3 w-3 rounded-full border-2 transition-colors ${
                        minPA === pa
                          ? "border-white bg-[var(--accent)] ring-1 ring-[var(--accent)]"
                          : "border-[var(--dimmer)] bg-white group-hover:border-[var(--accent)]"
                      }`}
                    />
                    <span
                      className={`absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap text-[10px] leading-none ${
                        minPA === pa ? "font-semibold text-[var(--accent)]" : "text-[var(--dimmer)]"
                      }`}
                    >
                      {label}
                    </span>
                  </button>
                ))}
              </div>
              <span className="min-w-[3.5rem] text-xs font-semibold tabular-nums text-[var(--text)]">
                {minPA}+ PA
              </span>
              <span className="text-xs text-[var(--dimmer)]">{visiblePlayers.length} shown</span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--dimmer)]">{PA_FILTER_NOTE}</p>
          </>
        )}
      </div>

      {tab === "leaderboard" && (
        <Leaderboard
          players={visiblePlayers}
          pct={pct}
          onSelect={selectPlayer}
          minPA={minPA}
          season={season}
          teamFilter={teamFilter}
          onChangeTeamFilter={setTeamFilter}
          rookieOnly={rookieOnly}
          onChangeRookieOnly={setRookieOnly}
          hand={hand}
          onChangeHand={setHand}
          rookieNames={rookieNames}
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
