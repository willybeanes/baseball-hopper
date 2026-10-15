import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { createClient } from "@supabase/supabase-js";
import type { HHPSLeaderboardRow } from "@/lib/hhps";
import { headshotUrl, hhpsUrl } from "@/lib/player";
import { fetchPlayerProfile, type PlayerProfile, type SeasonLine } from "@/lib/player-profile";
import { getPlayerHittingPlus } from "@/lib/hitting-plus/data";
import PlayerHittingPlus from "@/components/hitting-plus/PlayerHittingPlus";
import SwingMap from "@/components/hhps/SwingMap";

// Statically cached per player; season picks happen client-side via ?season=.
export const revalidate = 1800;
export async function generateStaticParams() {
  return [];
}

interface Props {
  params: Promise<{ mlbamId: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { mlbamId } = await params;
  const player = await fetchPlayerProfile(Number(mlbamId));
  if (!player) return { title: "Player — Baseball Hopper" };
  return {
    title: `${player.displayName} — Baseball Hopper`,
    description: `Stats, Hitting+ grades and swing data for ${player.displayName}${player.team ? ` (${player.team})` : ""} across every Balls & Sticks tool.`,
  };
}

/** 3D-map rows (all / vs R / vs L) for the latest season that has a map. Empty when there's none. */
async function fetchHhpsRows(mlbam: number, side: "hitter" | "pitcher"): Promise<HHPSLeaderboardRow[]> {
  try {
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
    const { data, error } = await sb
      .from(side === "pitcher" ? "hhps_pitcher_leaderboard" : "hhps_leaderboard")
      .select("*")
      .eq("mlbam", mlbam)
      .in("split", ["A", "R", "L"])
      .order("season", { ascending: false })
      .limit(6);
    if (error || !data?.length) return [];
    const latest = data[0].season;
    return (data as HHPSLeaderboardRow[]).filter((r) => r.season === latest);
  } catch {
    return [];
  }
}

// ── Stat tables ────────────────────────────────────────────────────────────────

type Col = { label: string; title?: string; get: (s: Record<string, string | number | undefined>) => string };

const num = (k: string) => (s: Record<string, string | number | undefined>) =>
  s[k] == null ? "—" : String(s[k]);
const rate = (k: string, denom: string) => (s: Record<string, string | number | undefined>) => {
  const n = Number(s[k]);
  const d = Number(s[denom]);
  return d > 0 ? `${((100 * n) / d).toFixed(1)}%` : "—";
};

const HITTING_COLS: Col[] = [
  { label: "G", title: "Games", get: num("gamesPlayed") },
  { label: "PA", title: "Plate appearances", get: num("plateAppearances") },
  { label: "HR", title: "Home runs", get: num("homeRuns") },
  { label: "R", title: "Runs", get: num("runs") },
  { label: "RBI", get: num("rbi") },
  { label: "SB", title: "Stolen bases", get: num("stolenBases") },
  { label: "BB%", title: "Walk rate", get: rate("baseOnBalls", "plateAppearances") },
  { label: "K%", title: "Strikeout rate", get: rate("strikeOuts", "plateAppearances") },
  { label: "AVG", get: num("avg") },
  { label: "OBP", get: num("obp") },
  { label: "SLG", get: num("slg") },
  { label: "OPS", get: num("ops") },
];

const PITCHING_COLS: Col[] = [
  { label: "G", title: "Games", get: num("gamesPitched") },
  { label: "GS", title: "Games started", get: num("gamesStarted") },
  { label: "IP", title: "Innings pitched", get: num("inningsPitched") },
  { label: "W-L", get: (s) => `${s.wins ?? 0}-${s.losses ?? 0}` },
  { label: "SV", title: "Saves", get: num("saves") },
  { label: "ERA", get: num("era") },
  { label: "WHIP", get: num("whip") },
  { label: "K%", title: "Strikeout rate", get: rate("strikeOuts", "battersFaced") },
  { label: "BB%", title: "Walk rate", get: rate("baseOnBalls", "battersFaced") },
  { label: "K/9", get: num("strikeoutsPer9Inn") },
  { label: "HR/9", get: num("homeRunsPer9") },
  { label: "SO", title: "Strikeouts", get: num("strikeOuts") },
];

function StatTable({
  title,
  cols,
  seasons,
  career,
}: {
  title: string;
  cols: Col[];
  seasons: SeasonLine[];
  career: Record<string, string | number | undefined> | null;
}) {
  return (
    <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--panel-shadow)] sm:px-7">
      <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-[var(--text)]">{title}</h2>
      <div className="-mx-5 overflow-x-auto px-5 sm:-mx-7 sm:px-7">
        <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--dim)]">
              <th className="sticky left-0 bg-[var(--panel)] py-2 pr-3 text-left font-medium">Season</th>
              <th className="py-2 pr-3 text-left font-medium">Team</th>
              {cols.map((c) => (
                <th key={c.label} title={c.title} className="px-2 py-2 text-right font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--panel-border)]">
            {seasons.map((r) => (
              <tr key={r.season}>
                <td className="sticky left-0 bg-[var(--panel)] py-2 pr-3 font-semibold">{r.season}</td>
                <td className="py-2 pr-3 text-[var(--dim)]">{r.team}</td>
                {cols.map((c) => (
                  <td key={c.label} className="px-2 py-2 text-right">
                    {c.get(r.stat)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {career && seasons.length > 1 && (
            <tfoot>
              <tr className="border-t border-[var(--rule)] font-semibold">
                <td className="sticky left-0 bg-[var(--panel)] py-2 pr-3">Career</td>
                <td className="py-2 pr-3 font-normal text-[var(--dim)]">
                  {seasons.length} {seasons.length === 1 ? "season" : "seasons"}
                </td>
                {cols.map((c) => (
                  <td key={c.label} className="px-2 py-2 text-right">
                    {c.get(career)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}

// ── Header ─────────────────────────────────────────────────────────────────────

function Facts({ player }: { player: PlayerProfile }) {
  const facts: [string, string | null][] = [
    ["B/T", player.bats && player.throws ? `${player.bats}/${player.throws}` : null],
    ["Age", player.age != null ? String(player.age) : null],
    ["Ht/Wt", player.height ? `${player.height}${player.weight ? `, ${player.weight} lb` : ""}` : null],
    ["Born", player.born],
    ["Debut", player.debut],
    ["Draft", player.draft],
  ];
  return (
    <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
      {facts
        .filter(([, v]) => v)
        .map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1.5">
            <dt className="text-[11px] font-medium text-[var(--dim)]">{k}</dt>
            <dd className="text-[var(--text)]">{v}</dd>
          </div>
        ))}
    </dl>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default async function PlayerPage({ params }: Props) {
  const { mlbamId } = await params;
  const id = Number(mlbamId);

  if (!mlbamId || isNaN(id)) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-[var(--dim)]">Invalid player ID.</p>
      </main>
    );
  }

  const player = await fetchPlayerProfile(id);

  if (!player) {
    return (
      <main className="max-w-3xl mx-auto px-6 py-16 text-center">
        <p className="text-[var(--dim)]">
          Player not found. Check the MLBAM id or try searching a tool directly.
        </p>
        <Link href="/" className="mt-4 inline-block text-sm underline text-[var(--dim)] hover:text-[var(--text)]">
          ← Back to Baseball Hopper
        </Link>
      </main>
    );
  }

  const showHitting = !player.isPitcher && player.hitting.seasons.length > 0;
  const showPitching = (player.isPitcher || player.isTwoWay) && player.pitching.seasons.length > 0;
  const mapSide = player.isPitcher ? "pitcher" : "hitter";
  const [hp, mapRows] = await Promise.all([
    player.isPitcher ? null : getPlayerHittingPlus(id),
    fetchHhpsRows(id, mapSide),
  ]);
  const mapSeason = mapRows[0]?.season;
  const latestSeason = Math.max(
    ...player.hitting.seasons.map((s) => s.season),
    ...player.pitching.seasons.map((s) => s.season),
    new Date().getFullYear() - 1,
  );

  const mapHref =
    mapSide === "pitcher"
      ? `/hhps/pitchers?player=${id}&outcome=whiff&mode=swing`
      : hhpsUrl(id, { outcome: "hard", mode: "contact" });

  const compareTab = player.isPitcher ? "pitcher" : "hitter";
  const tools = [
    {
      label: "Percentile Compare",
      description: `Open ${player.displayName.split(" ")[0]} as Player A and add a second player`,
      href: `/compare?${new URLSearchParams({ tab: compareTab, a: player.displayName, yearA: String(latestSeason) })}`,
    },
    ...(player.isPitcher || player.isTwoWay
      ? [
          { label: "Battery Splits", description: "Pitcher–catcher pairings and ERA/FIP/Stuff+ splits", href: "/battery" },
          { label: "Stuff Splits", description: "Pitch-quality grades by pitch type and batter hand", href: "/stuff/platoon" },
        ]
      : []),
    ...(!player.isPitcher
      ? [{ label: "Hitting+ leaderboard", description: "Where this swing ranks against every qualified hitter", href: `/hitting-plus?tab=leaderboard&season=${hp?.history.at(-1)?.game_year ?? latestSeason}` }]
      : []),
  ];

  const subtitle = [
    player.number ? `#${player.number}` : null,
    player.positionName ?? player.position,
    player.teamName ?? (player.active ? null : "Inactive"),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <main className="mx-auto w-full max-w-[1080px] px-4 pb-20 pt-8 sm:px-5">
      {/* Header */}
      <header className="flex flex-wrap items-start gap-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={headshotUrl(id)}
          alt=""
          width={96}
          height={96}
          className="h-24 w-24 shrink-0 rounded-full border border-[var(--panel-border)] bg-[var(--track)] object-cover"
          style={{ objectPosition: "50% 15%" }}
        />
        <div className="min-w-0 flex-1">
          <h1 className="text-[28px] font-bold leading-tight tracking-tight sm:text-[34px]">{player.displayName}</h1>
          {subtitle && <p className="mt-1 text-sm text-[var(--dim)]">{subtitle}</p>}
          <Facts player={player} />
        </div>
      </header>

      <div className="mt-8 space-y-6">
        {hp && (
          <Suspense fallback={null}>
            <PlayerHittingPlus history={hp.history} pools={hp.pools} />
          </Suspense>
        )}

        {showHitting && (
          <StatTable title="Batting" cols={HITTING_COLS} seasons={player.hitting.seasons} career={player.hitting.career} />
        )}
        {showPitching && (
          <StatTable title="Pitching" cols={PITCHING_COLS} seasons={player.pitching.seasons} career={player.pitching.career} />
        )}

        {mapSeason && (
          <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--panel-shadow)] sm:px-7">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text)]">
                {mapSide === "pitcher" ? "Whiff map" : "Hard-hit map"}
              </h2>
              <Link href={mapHref} className="text-xs font-medium text-[var(--accent)] hover:underline">
                Open in 3D {mapSide === "pitcher" ? "Pitch" : "Swing"} Explorer →
              </Link>
            </div>
            <p className="mt-1 text-xs text-[var(--dim)]">
              {mapSide === "pitcher" ? "Where hitters swing through his pitches" : "Where he makes hard contact, per ball in play"}{" "}
              · {mapSeason} · each cube is 3 inches · drag to rotate
            </p>
            <div className="-mx-5 sm:-mx-7">
              <SwingMap mlbam={id} season={mapSeason} side={mapSide} rows={mapRows} />
            </div>
          </section>
        )}

        <section>
          <h2 className="mb-3 text-[15px] font-semibold tracking-tight text-[var(--text)]">More on this player</h2>
          <ul className="divide-y divide-[var(--rule)] border-y border-[var(--rule)]">
            {tools.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="group flex items-baseline justify-between gap-4 py-3">
                  <span>
                    <span className="text-sm font-semibold group-hover:text-[var(--accent)]">{t.label}</span>
                    <span className="ml-2 text-xs text-[var(--dim)]">{t.description}</span>
                  </span>
                  <span aria-hidden className="text-[var(--dimmer)] group-hover:text-[var(--accent)]">→</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-[11px] text-[var(--dimmer)]">MLBAM id {id} · Stats from the MLB Stats API</p>
        </section>
      </div>
    </main>
  );
}
