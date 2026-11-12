"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VoterIndexRow } from "@/lib/voters";

type Filter = "all" | "hof" | "awards" | "both";
type Sort = "name" | "hof" | "names";

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function span(years: number[]) {
  if (!years.length) return "";
  return years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;
}

export default function VoterList({ rows }: { rows: VoterIndexRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("name");

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const out = rows.filter((r) => {
      if (filter === "hof" && !r.hofYears.length) return false;
      if (filter === "awards" && !r.awardBallots) return false;
      if (filter === "both" && !(r.hofYears.length && r.awardBallots)) return false;
      if (!needle) return true;
      return fold(`${r.name} ${r.outlet ?? ""} ${r.chapter ?? ""}`).includes(needle);
    });
    if (sort === "hof") out.sort((a, b) => b.hofYears.length - a.hofYears.length || a.name.localeCompare(b.name));
    if (sort === "names") out.sort((a, b) => (b.avgNames ?? -1) - (a.avgNames ?? -1));
    return out;
  }, [rows, q, filter, sort]);

  const chip = (on: boolean) =>
    `rounded-full border px-3 py-1 text-[12px] font-medium transition-colors ${
      on
        ? "border-[var(--text)] bg-[var(--text)] text-[var(--panel)]"
        : "border-[var(--panel-border)] bg-[var(--panel)] text-[var(--dim)] hover:text-[var(--text)]"
    }`;

  return (
    <section className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] px-5 py-5 shadow-[var(--panel-shadow)] sm:px-7">
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a voter, outlet or chapter"
          aria-label="Search voters"
          className="w-full rounded-lg border border-[var(--panel-border)] bg-[var(--bg)] px-3 py-2 text-[14px] text-[var(--text)] placeholder:text-[var(--dim)] focus:border-[var(--dim)] focus:outline-none sm:w-80"
        />
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Ballot type">
          {(
            [
              ["all", "All"],
              ["hof", "Hall of Fame"],
              ["awards", "Awards"],
              ["both", "Both"],
            ] as [Filter, string][]
          ).map(([k, label]) => (
            <button key={k} type="button" className={chip(filter === k)} onClick={() => setFilter(k)} aria-pressed={filter === k}>
              {label}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-[12px] text-[var(--dim)]">
          Sort
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="rounded-md border border-[var(--panel-border)] bg-[var(--panel)] px-2 py-1 text-[13px] text-[var(--text)]"
          >
            <option value="name">Last name</option>
            <option value="hof">Most HOF ballots</option>
            <option value="names">Most names per HOF ballot</option>
          </select>
        </label>
      </div>

      <p className="mt-3 text-[12px] text-[var(--dim)]">
        {shown.length.toLocaleString()} {shown.length === 1 ? "voter" : "voters"}
      </p>

      <div className="-mx-1 mt-2 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--dim)]">
              <th className="py-2 pr-3 text-left font-medium">Voter</th>
              <th className="py-2 pr-3 text-left font-medium">Outlet</th>
              <th className="py-2 pr-3 text-left font-medium">Public HOF ballots</th>
              <th className="py-2 pr-3 text-right font-medium">Names / ballot</th>
              <th className="py-2 text-left font-medium">Award ballots</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--panel-border)]">
            {shown.slice(0, 150).map((r) => (
              <tr key={r.slug}>
                <td className="py-2 pr-3">
                  <Link href={`/voter/${r.slug}`} className="font-semibold text-[var(--text)] hover:underline">
                    {r.name}
                  </Link>
                </td>
                <td className="py-2 pr-3 text-[var(--dim)]">
                  {r.outlet}
                  {r.chapter && <span className="text-[var(--dimmer)]"> · {r.chapter}</span>}
                </td>
                <td className="whitespace-nowrap py-2 pr-3">
                  {r.hofYears.length ? (
                    <>
                      {r.hofYears.length} <span className="text-[var(--dim)]">({span(r.hofYears)})</span>
                    </>
                  ) : (
                    <span className="text-[var(--dim)]">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right">{r.avgNames != null ? r.avgNames.toFixed(1) : <span className="text-[var(--dim)]">—</span>}</td>
                <td className="whitespace-nowrap py-2">
                  {r.awardBallots ? (
                    <>
                      {r.awardBallots} <span className="text-[var(--dim)]">({span(r.awardYears)})</span>
                    </>
                  ) : (
                    <span className="text-[var(--dim)]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length > 150 && (
          <p className="mt-3 text-[12px] text-[var(--dim)]">Showing the first 150. Search to narrow the list.</p>
        )}
      </div>
    </section>
  );
}
