"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { VoterIndexRow } from "@/lib/voters";

type Filter = "all" | "hof" | "awards" | "both";
type SortKey = "name" | "outlet" | "hof" | "names" | "awards" | "war";

const lastName = (n: string) => n.split(" ").slice(-1)[0];

/** Value to sort on; null always sorts last. */
const sortValue: Record<SortKey, (r: VoterIndexRow) => string | number | null> = {
  name: (r) => fold(`${lastName(r.name)} ${r.name}`),
  outlet: (r) => (r.outlet ? fold(r.outlet) : null),
  hof: (r) => (r.hofYears.length ? r.hofYears.length : null),
  names: (r) => r.avgNames,
  awards: (r) => (r.awardBallots ? r.awardBallots : null),
  war: (r) => r.warMatch,
};
const TEXT_KEYS: SortKey[] = ["name", "outlet"];

const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();

function span(years: number[]) {
  if (!years.length) return "";
  return years.length === 1 ? `${years[0]}` : `${years[0]}–${years[years.length - 1]}`;
}

export default function VoterList({ rows }: { rows: VoterIndexRow[] }) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const onSort = (key: SortKey) =>
    setSort((cur) => (cur.key === key ? { key, dir: cur.dir === 1 ? -1 : 1 } : { key, dir: TEXT_KEYS.includes(key) ? 1 : -1 }));

  const shown = useMemo(() => {
    const needle = fold(q.trim());
    const out = rows.filter((r) => {
      if (filter === "hof" && !r.hofYears.length) return false;
      if (filter === "awards" && !r.awardBallots) return false;
      if (filter === "both" && !(r.hofYears.length && r.awardBallots)) return false;
      if (!needle) return true;
      return fold(`${r.name} ${r.outlet ?? ""} ${r.chapter ?? ""}`).includes(needle);
    });
    const get = sortValue[sort.key];
    const byName = sortValue.name;
    out.sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb));
      return c * sort.dir || String(byName(a)).localeCompare(String(byName(b)));
    });
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
      </div>

      <p className="mt-3 text-[12px] text-[var(--dim)]">
        {shown.length.toLocaleString()} {shown.length === 1 ? "voter" : "voters"}
      </p>

      <div className="-mx-1 mt-2 overflow-x-auto px-1">
        <table className="w-full min-w-[640px] border-collapse text-[13px] tabular-nums">
          <thead>
            <tr className="border-b border-[var(--rule)] text-[11px] font-medium text-[var(--dim)]">
              <SortHeader k="name" label="Voter" sort={sort} onSort={onSort} />
              <SortHeader k="outlet" label="Outlet" sort={sort} onSort={onSort} />
              <SortHeader k="hof" label="Public HOF ballots" sort={sort} onSort={onSort} />
              <SortHeader k="names" label="Names / ballot" sort={sort} onSort={onSort} right />
              <SortHeader k="awards" label="Award ballots" sort={sort} onSort={onSort} />
              <SortHeader k="war" label="WAR match" sort={sort} onSort={onSort} right last title="Points-weighted fWAR of their award ballots vs. the WAR ballot" />
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
                <td className="whitespace-nowrap py-2 pr-3">
                  {r.awardBallots ? (
                    <>
                      {r.awardBallots} <span className="text-[var(--dim)]">({span(r.awardYears)})</span>
                    </>
                  ) : (
                    <span className="text-[var(--dim)]">—</span>
                  )}
                </td>
                <td className="py-2 text-right">
                  {r.warMatch != null ? (
                    <span title={r.warVsField != null ? `${r.warVsField >= 0 ? "+" : "−"}${Math.abs(Math.round(r.warVsField * 100))} pts vs. median voter` : undefined}>
                      {Math.round(r.warMatch * 100)}%
                    </span>
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

function SortHeader({
  k,
  label,
  sort,
  onSort,
  right,
  last,
  title,
}: {
  k: SortKey;
  label: string;
  sort: { key: SortKey; dir: 1 | -1 };
  onSort: (k: SortKey) => void;
  right?: boolean;
  last?: boolean;
  title?: string;
}) {
  const active = sort.key === k;
  return (
    <th
      className={`py-2 font-medium ${last ? "" : "pr-3"} ${right ? "text-right" : "text-left"}`}
      aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
      title={title}
    >
      <button
        type="button"
        onClick={() => onSort(k)}
        className={`inline-flex items-center gap-1 transition-colors hover:text-[var(--text)] ${active ? "text-[var(--text)]" : ""}`}
      >
        {label}
        <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
          {active && sort.dir === -1 ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}
