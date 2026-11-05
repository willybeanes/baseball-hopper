// Loads the Team Builder snapshot. The daily refresh uploads it to Supabase Storage, so new data
// doesn't need a redeploy; the copy built into the site (same files, as of the last deploy) is
// the fallback.

const DATA = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/team-builder`
const LOCAL_DATA = '/data/team-builder'

export async function loadJson<T>(path: string): Promise<T> {
  try {
    const r = await fetch(`${DATA}/${path}`)
    if (r.ok) return (await r.json()) as T
  } catch {
    // fall through to the built-in copy
  }
  const r = await fetch(`${LOCAL_DATA}/${path}`)
  if (!r.ok) throw new Error(`${path}: ${r.status}`)
  return (await r.json()) as T
}
