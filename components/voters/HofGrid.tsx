"use client";

import Link from "next/link";
import s from "./voters.module.css";

export interface HofGridRow {
  name: string;
  id: number | null;
  inducted: "BBWAA" | "Committee" | null;
  /** One character per year: Y voted for, N on ballot but left off, B blank ballot, . not on ballot. */
  marks: string;
}

/** Candidate-by-year grid of one voter's public HOF ballots. Client component so the page
 *  ships the compact rows once instead of a second copy of every rendered cell. */
export default function HofGrid({ years, counts, rows }: { years: number[]; counts: number[]; rows: HofGridRow[] }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={s.grid}>
        <thead>
          <tr>
            <th>Candidate</th>
            {years.map((y) => (
              <th key={y}>{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td>
                {r.id ? (
                  <Link href={`/player/${r.id}`} className="hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  r.name
                )}
                {r.inducted && (
                  <span className={s.tag} title={r.inducted === "BBWAA" ? "Elected by the BBWAA" : "Elected by an era committee"}>
                    {r.inducted === "BBWAA" ? "HOF" : "HOF (era cmte.)"}
                  </span>
                )}
              </td>
              {[...r.marks].map((m, i) => (
                <td key={i}>
                  {m === "Y" ? (
                    <span className={s.y} role="img" aria-label="voted for" />
                  ) : m === "N" ? (
                    <span className={s.n} role="img" aria-label="left off" />
                  ) : m === "B" ? (
                    <span className={s.tag}>—</span>
                  ) : (
                    <span className={s.off}>·</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td>Names on ballot</td>
            {counts.map((c, i) => (
              <td key={years[i]}>{c}</td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
