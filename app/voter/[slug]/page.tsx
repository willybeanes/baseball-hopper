import type { Metadata } from "next";
import Link from "next/link";
import { Fragment, type ReactNode } from "react";
import { notFound } from "next/navigation";
import HofGrid, { type HofGridRow } from "@/components/voters/HofGrid";
import {
  allVoterSlugs,
  getVoter,
  AWARD_NAMES,
  awardResult,
  hofYear,
  type AwardBallot,
  type AwardCode,
  type HofBallot,
  type VoterProfile,
} from "@/lib/voters";

// Every voter page is built at deploy time from static JSON: no ISR writes, no runtime fetches.
export const dynamicParams = false;
export function generateStaticParams() {
  return allVoterSlugs().map((slug) => ({ slug }));
}

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = getVoter((await params).slug);
  if (!v) return { title: "Voter — Baseball Hopper" };
  return {
    title: `${v.name} — Voter Profile — Baseball Hopper`,
    description: `Every public Hall of Fame and BBWAA award ballot from BBWAA voter ${v.name}${v.outlet ? ` (${v.outlet})` : ""}.`,
  };
}

const TRACKER_URL = "https://1drv.ms/x/c/f2e5d8fc5199dfaf/EdbgAklsFj9NofGNQYqyGHkBwQRlbI_-6kBfDDfmGjR0eQ";
const PANEL =
  "rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--panel-shadow)] sm:px-7";
const H2 = "text-[15px] font-semibold tracking-tight text-[var(--text)]";
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)}%`);

function PlayerName({ id, name }: { id: number | null; name: string }) {
  return id ? (
    <Link href={`/player/${id}`} className="hover:underline">
      {name}
    </Link>
  ) : (
    <>{name}</>
  );
}

/** A page panel whose heading toggles it open and closed (native <details>, open by default). */
function Panel({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <details open className={`group ${PANEL}`}>
      <summary className="-my-1 flex cursor-pointer list-none items-center justify-between gap-3 rounded-md py-1 [&::-webkit-details-marker]:hidden">
        <h2 className={H2}>{title}</h2>
        <svg
          aria-hidden
          viewBox="0 0 16 16"
          className="h-4 w-4 shrink-0 text-[var(--dim)] transition-transform duration-150 group-open:rotate-180"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6l4 4 4-4" />
        </svg>
      </summary>
      {children}
    </details>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[11px] font-medium text-[var(--dim)]">{label}</dt>
      <dd className="mt-0.5 text-[20px] font-semibold tabular-nums tracking-tight text-[var(--text)]">{value}</dd>
      {sub && <dd className="text-[11px] text-[var(--dim)]">{sub}</dd>}
    </div>
  );
}

function yearSpan(years: number[]) {
  if (!years.length) return "";
  const s = [...new Set(years)].sort();
  return s.length === 1 ? `${s[0]}` : `${s[0]}–${s[s.length - 1]}`;
}

// ── Hall of Fame ──────────────────────────────────────────────────────────────

function HofGridSection({ ballots }: { ballots: HofBallot[] }) {
  const years = ballots.map((b) => b.year).sort((a, b) => a - b);
  const byYear = new Map(ballots.map((b) => [b.year, b]));
  // Every candidate on a ballot this voter made public, in order of first appearance.
  const cands = new Map<string, { id: number | null; first: number; inducted: HofGridRow["inducted"]; yes: number; on: number; peak: number }>();
  for (const y of years) {
    for (const c of hofYear(y)?.candidates ?? []) {
      const e = cands.get(c.name) ?? { id: c.id, first: y, inducted: c.inducted, yes: 0, on: 0, peak: 0 };
      e.on += 1;
      e.peak = Math.max(e.peak, c.publicShare ?? 0);
      if (byYear.get(y)?.votes.includes(c.name)) e.yes += 1;
      cands.set(c.name, e);
    }
  }
  // Rows: anyone this voter backed, plus serious candidates (inducted, or 20%+ of public ballots) they passed on.
  const rows: HofGridRow[] = [...cands.entries()]
    .filter(([, c]) => c.yes > 0 || (c.on > 1 && (c.inducted || c.peak >= 0.2)))
    .sort((a, b) => b[1].yes - a[1].yes || a[1].first - b[1].first || a[0].localeCompare(b[0]))
    .map(([name, c]) => ({
      name,
      id: c.id,
      inducted: c.inducted,
      marks: years
        .map((y) => {
          const b = byYear.get(y)!;
          if (!hofYear(y)?.candidates.some((x) => x.name === name)) return ".";
          if (b.blank) return "B";
          return b.votes.includes(name) ? "Y" : "N";
        })
        .join(""),
    }));
  const counts = years.map((y) => byYear.get(y)!.count);
  return <HofGrid years={years} counts={counts} rows={rows} />;
}

function HofYearList({ ballots }: { ballots: HofBallot[] }) {
  return (
    <ul className="mt-4 divide-y divide-[var(--panel-border)] text-[13px]">
      {[...ballots].reverse().map((b) => {
        const y = hofYear(b.year);
        return (
          <li key={b.year} className="grid grid-cols-[52px_1fr] gap-3 py-2.5">
            <span className="font-semibold tabular-nums">{b.year}</span>
            <div>
              <p className="text-[var(--text)]">
                {b.blank ? (
                  <span className="text-[var(--dim)]">Blank ballot</span>
                ) : (
                  b.votes.map((n, i) => {
                    const c = y?.candidates.find((x) => x.name === n);
                    const rare = b.rare.includes(n);
                    return (
                      <span key={n}>
                        {i > 0 && ", "}
                        <span className={rare ? "font-semibold text-[var(--accent)]" : undefined} title={rare ? "Under 5% of public ballots" : undefined}>
                          <PlayerName id={c?.id ?? null} name={n} />
                        </span>
                      </span>
                    );
                  })
                )}
              </p>
              <p className="mt-0.5 text-[11px] text-[var(--dim)]">
                {b.blank ? "0 names" : `${b.count} ${b.count === 1 ? "name" : "names"}`}
                {b.electees > 0 && ` · backed ${b.electeesBacked} of ${b.electees} elected`}
                {b.released && ` · made public ${new Date(b.released + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`}
                {b.source && ` · via ${b.source}`}
                {b.url && (
                  <>
                    {" · "}
                    <a href={b.url} className="underline hover:text-[var(--text)]" target="_blank" rel="noreferrer">
                      source
                    </a>
                  </>
                )}
                {b.note && ` · ${b.note}`}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── BBWAA awards ──────────────────────────────────────────────────────────────

const AWARD_ORDER: AwardCode[] = ["mvp", "cy", "roy", "reliever", "mgr"];

// WAR-alignment shading, same convention as Team Builder's WAR figures: brand red for good,
// the cool blue for poor, deepening with strength; the text stays dark so contrast holds.
const tint = (tone: "good" | "bad", strength: number) =>
  tone === "good"
    ? `color-mix(in srgb, var(--accent) ${Math.round(10 + strength * 30)}%, transparent)`
    : `color-mix(in srgb, var(--cool) ${Math.round(18 + strength * 42)}%, transparent)`;

/** A pick's shade: red when on the WAR ballot (deeper the higher his WAR rank), none just outside it,
 *  blue when well outside (past twice the ballot length, or not in the eligible pool at all). */
function pickTint(warRank: number | null | undefined, places: number): string | undefined {
  if (!warRank) return tint("bad", 1);
  if (warRank <= places) return tint("good", 1 - (warRank - 1) / places);
  const ratio = warRank / places;
  if (ratio <= 2) return undefined;
  return tint("bad", Math.min(1, (ratio - 2) / 3));
}

function AwardTable({ ballots }: { ballots: AwardBallot[] }) {
  const places = Math.max(...ballots.map((b) => b.places));
  const isMgr = ballots[0]?.award === "mgr";
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={`w-full border-collapse text-[13px] ${places > 5 ? "min-w-[860px]" : "min-w-[560px]"}`}>
        <thead>
          <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--dim)]">
            <th className="sticky left-0 z-10 bg-[var(--panel)] py-2 pr-3 text-left font-medium">Year</th>
            {Array.from({ length: places }, (_, i) => (
              <th key={i} className="px-1.5 py-2 text-left font-medium">
                {i + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--panel-border)]">
          {[...ballots].reverse().map((b) => {
            const result = awardResult(b.award, b.year, b.league);
            return (
              <Fragment key={`${b.year}${b.league}`}>
              <tr className="align-top" style={result?.warBallot ? { borderBottomWidth: 0 } : undefined}>
                <td className="sticky left-0 z-10 whitespace-nowrap bg-[var(--panel)] py-2 pr-3">
                  <a href={result?.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                    {b.year} {b.league}
                  </a>
                  <div className="text-[11px] text-[var(--dim)]">{b.outlet}</div>
                  {b.warMatch != null && (
                    <div
                      className="mt-1 text-[11px] tabular-nums text-[var(--dim)]"
                      title={`Points-weighted fWAR of this ballot compared with the WAR ballot${
                        result?.medianWarMatch != null ? ` (median voter ${pct(result.medianWarMatch)})` : ""
                      }`}
                    >
                      <span className="font-semibold text-[var(--text)]">{pct(b.warMatch)}</span>{" "}
                      WAR match
                    </div>
                  )}
                </td>
                {Array.from({ length: places }, (_, i) => {
                  const p = b.picks.find((x) => x.rank === i + 1);
                  if (!p) return <td key={i} className="px-1.5 py-2 text-[var(--dim)]">{i < b.places ? "—" : ""}</td>;
                  const solo = p.mentions === 1;
                  return (
                    <td key={i} className="px-1.5 py-2">
                      <div className={`leading-tight ${solo ? "font-semibold" : ""}`}>
                        {isMgr ? p.name : <PlayerName id={p.id} name={p.name} />}
                      </div>
                      <div className="text-[11px] tabular-nums text-[var(--dim)]" title={`Finished ${p.finalRank} in the final vote`}>
                        {solo ? <span className="font-semibold text-[var(--text)]">only voter · </span> : ""}
                        <span className={Math.abs(p.finalRank - p.rank) >= Math.max(2, Math.round(b.places / 3)) ? "font-semibold text-[var(--text)]" : undefined}>
                          finished {p.finalRank}
                        </span>
                      </div>
                      {p.war != null && (
                        <div className="mt-0.5 text-[11px] tabular-nums" title={`${p.war.toFixed(1)} fWAR${p.warRank ? `, #${p.warRank} among eligible players` : ", not in the eligible pool"}`}>
                          <span className="-mx-0.5 whitespace-nowrap rounded px-1 py-px text-[var(--text)]" style={{ backgroundColor: pickTint(p.warRank, b.places) }}>
                            {p.war.toFixed(1)}{p.warRank ? ` · #${p.warRank}` : ""}
                          </span>
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
              {result?.warBallot && (
                <tr>
                  <td className="sticky left-0 z-10 bg-[var(--panel)] pb-2.5 pr-3 align-top text-[11px] font-medium text-[var(--dim)]">WAR ballot</td>
                  {result.warBallot.map((w) => {
                    const picked = b.picks.some((p) => p.id === w.id);
                    return (
                      <td key={w.id} className="px-1.5 pb-2.5 align-top text-[11px] leading-tight text-[var(--dim)]">
                        <span className={picked ? "text-[var(--text)]" : undefined}>{w.name}</span>
                        <span className="tabular-nums"> {w.war.toFixed(1)}</span>
                      </td>
                    );
                  })}
                </tr>
              )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

function Header({ v }: { v: VoterProfile }) {
  const hofYears = v.hof.map((b) => b.year);
  const awardLabel = v.awards.length ? `${v.awards.length} (${yearSpan(v.awards.map((b) => b.year))})` : "";
  const facts: [string, string | null][] = [
    ["Outlet", v.outlet && (v.outletYear && v.outletYear < 2025 ? `${v.outlet} (as of ${v.outletYear})` : v.outlet)],
    ["Chapter", v.chapter],
    ["Public HOF ballots", hofYears.length ? `${hofYears.length} (${yearSpan(hofYears)})` : null],
    ["Award ballots", awardLabel || null],
  ];
  return (
    <header>
      <Link href="/voters" className="text-[12px] text-[var(--dim)] hover:text-[var(--text)]">
        ← All voters
      </Link>
      <h1 className="mt-2 text-[26px] font-bold tracking-tight text-[var(--text)]">{v.name}</h1>
      {v.aliases.length > 0 && <p className="text-[12px] text-[var(--dim)]">Also listed as {v.aliases.join(", ")}</p>}
      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-[13px]">
        {facts
          .filter(([, val]) => val)
          .map(([k, val]) => (
            <div key={k} className="flex items-baseline gap-1.5">
              <dt className="text-[11px] font-medium text-[var(--dim)]">{k}</dt>
              <dd className="text-[var(--text)]">{val}</dd>
            </div>
          ))}
      </dl>
    </header>
  );
}

export default async function VoterPage({ params }: Props) {
  const v = getVoter((await params).slug);
  if (!v) notFound();
  const h = v.summary.hof;
  const m = v.summary.awards;
  const byAward = AWARD_ORDER.map((c) => [c, v.awards.filter((b) => b.award === c)] as const).filter(([, bs]) => bs.length);

  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-5 px-4 pb-20 pt-8 sm:px-5">
      <Header v={v} />

      {(h || m) && (
        <Panel title={<>Tendencies</>}>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            {h && (
              <>
                <Stat label="Names per HOF ballot" value={h.avgNames.toFixed(1)} sub={h.peerAvgNames ? `public ballots avg ${h.peerAvgNames.toFixed(1)}` : undefined} />
                <Stat label="Full 10-name ballots" value={`${h.fullBallots} of ${h.ballots - h.blank}`} sub={h.blank ? `${h.blank} blank` : undefined} />
                <Stat label="Backed that year’s electees" value={pct(h.electeeRate)} sub="share of BBWAA electees on ballot" />
              </>
            )}
            {m && (
              <>
                <Stat label="1st-place vote won the award" value={`${m.firstMatches} of ${m.ballots}`} sub="all BBWAA awards" />
                <Stat label="Picks no one else made" value={`${m.soloPicks}`} sub={`across ${m.ballots} award ${m.ballots === 1 ? "ballot" : "ballots"}`} />
                {m.warMatch != null && (
                  <Stat
                    label="WAR match"
                    value={pct(m.warMatch)}
                    sub={
                      m.warVsField != null
                        ? `${m.warVsField >= 0 ? "+" : "−"}${Math.abs(Math.round(m.warVsField * 100))} pts vs. median voter${m.warPercentile != null ? ` · ahead of ${m.warPercentile}% of voters` : ""}`
                        : undefined
                    }
                  />
                )}
              </>
            )}
          </dl>
        </Panel>
      )}

      {v.hof.length > 0 && (
        <Panel title={<>Hall of Fame ballots</>}>
          <p className="mb-4 mt-1 max-w-[56ch] text-[12px] leading-relaxed text-[var(--dim)]">
            Filled dot: voted for. Open dot: on the ballot but left off. Lists everyone this voter backed, plus inducted or 20%+ candidates they passed on. Public ballots from Ryan Thibodaux&rsquo;s{" "}
            <a href={TRACKER_URL} className="underline hover:text-[var(--text)]" target="_blank" rel="noreferrer">
              BBHOF Tracker
            </a>
            . Names in red got under 5% of public ballots.
          </p>
          <HofGridSection ballots={v.hof} />
          <HofYearList ballots={v.hof} />
        </Panel>
      )}

      {byAward.map(([code, bs], i) => {
        const st = m?.byAward[code];
        return (
          <Panel key={code} title={<>{AWARD_NAMES[code]} ballots</>}>
            <p className="mb-4 mt-1 max-w-[56ch] text-[12px] leading-relaxed text-[var(--dim)]">
              {st && (
                <>
                  Picked the winner first on {st.firstMatches} of {st.ballots} {st.ballots === 1 ? "ballot" : "ballots"}.{" "}
                  {st.warMatch != null && <>Average WAR match {pct(st.warMatch)}.{" "}</>}
                </>
              )}
              {i === 0 && (
                <>
                  Each pick shows where {code === "mgr" ? "that manager" : "the player"} finished in the final vote, in bold when well off this voter&rsquo;s spot; &ldquo;only voter&rdquo; marks picks no one else made. Under each pick: his fWAR and fWAR rank among eligible players, shaded when he&rsquo;s on the WAR ballot and blue when he&rsquo;s well outside it. Ballots from{" "}
                  <a href="https://bbwaa.com" className="underline hover:text-[var(--text)]" target="_blank" rel="noreferrer">
                    bbwaa.com
                  </a>
                  . WAR ballot: the top players in FanGraphs WAR among those eligible (all players for MVP, pitchers for Cy Young, FanGraphs-flagged rookies for Rookie of the Year, relievers for Reliever of the Year). WAR match: the ballot&rsquo;s fWAR, weighted by award points, as a share of the WAR ballot&rsquo;s.
                </>
              )}
            </p>
            <AwardTable ballots={bs} />
          </Panel>
        );
      })}

      {v.similar.length > 0 && (
        <Panel title={<>Votes most like {v.name.split(" ")[0]}&rsquo;s</>}>
          <p className="mt-1 text-[12px] text-[var(--dim)]">Share of Hall of Fame yes/no calls that match, on candidates both voters had on the same ballot.</p>
          <ul className="mt-3 divide-y divide-[var(--panel-border)] text-[13px]">
            {v.similar.map((s) => (
              <li key={s.slug} className="flex items-baseline justify-between py-2">
                <Link href={`/voter/${s.slug}`} className="hover:underline">
                  {s.name}
                </Link>
                <span className="tabular-nums text-[var(--dim)]">
                  <span className="font-semibold text-[var(--text)]">{pct(s.agree)}</span> of {s.shared}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </main>
  );
}
