// Projected WAR and playing time from FanGraphs, through fg-proxy (which holds the login cookie
// FanGraphs requires). Keyed by MLBAM id; two-way players get hitting and pitching WAR added.

const FG_PROXY = 'https://fg-proxy.vercel.app/api/fg-gamelog'

export interface Projection { war: number; pa?: number; ip?: number; sp?: boolean } // sp: projected mostly as a starter

interface FgRow { xMLBAMID?: number | null; WAR?: number | null; PA?: number | null; IP?: number | null; G?: number | null; GS?: number | null }

async function fetchSide(system: string, stats: 'bat' | 'pit'): Promise<FgRow[]> {
  const url = `${FG_PROXY}?path=/api/projections&type=${encodeURIComponent(system)}&stats=${stats}&pos=all&team=0&players=0&lg=all`
  const r = await fetch(url, { signal: AbortSignal.timeout(60_000) })
  if (!r.ok) throw new Error(`Projections (${system}, ${stats}) returned HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`)
  const rows = (await r.json()) as FgRow[]
  if (!Array.isArray(rows) || rows.length < 500) throw new Error(`Projections (${system}, ${stats}) came back with ${Array.isArray(rows) ? rows.length : 0} rows`)
  return rows
}

export async function fetchProjections(system: string): Promise<Record<number, Projection>> {
  const [bat, pit] = await Promise.all([fetchSide(system, 'bat'), fetchSide(system, 'pit')])
  const out: Record<number, Projection> = {}
  const round = (n: number, d: number) => Math.round(n * 10 ** d) / 10 ** d
  for (const r of bat) {
    if (!r.xMLBAMID || r.WAR == null) continue
    out[r.xMLBAMID] = { war: round(r.WAR, 2), pa: Math.round(r.PA ?? 0) }
  }
  for (const r of pit) {
    if (!r.xMLBAMID || r.WAR == null) continue
    const prev = out[r.xMLBAMID]
    const sp = (r.GS ?? 0) >= (r.G ?? 0) / 2 && (r.GS ?? 0) > 0
    out[r.xMLBAMID] = { ...prev, war: round((prev?.war ?? 0) + r.WAR, 2), ip: round(r.IP ?? 0, 1), ...(sp ? { sp } : {}) }
  }
  return out
}
