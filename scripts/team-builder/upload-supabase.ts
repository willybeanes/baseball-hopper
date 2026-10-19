// Uploads the Team Builder snapshot (public/data/team-builder) to the public `team-builder`
// bucket in Supabase Storage, where the page reads it. Serving it from there means a data
// refresh no longer needs a Vercel redeploy (see scripts/vercel-ignore.sh).
//
//   SUPABASE_URL=… SUPABASE_SERVICE_KEY=… bun scripts/team-builder/upload-supabase.ts

import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'

const DIR = join(import.meta.dir, '../../public/data/team-builder')
const BUCKET = 'team-builder'
// Browsers and Supabase's CDN may reuse a file for 5 minutes after a refresh.
const CACHE_SECONDS = 300

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_KEY
if (!url || !key) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
  process.exit(1)
}
const auth = { Authorization: `Bearer ${key}`, apikey: key }

function jsonFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return jsonFiles(path)
    return name.endsWith('.json') ? [path] : []
  })
}

// Create the bucket on first run; "already exists" is fine.
const made = await fetch(`${url}/storage/v1/bucket`, {
  method: 'POST',
  headers: { ...auth, 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true }),
})
if (!made.ok) {
  const text = await made.text()
  if (!/already exists|Duplicate/i.test(text)) {
    console.error(`Could not create bucket: ${made.status} ${text}`)
    process.exit(1)
  }
}

const files = jsonFiles(DIR)
let failed = 0
await Promise.all(
  files.map(async (path) => {
    const name = relative(DIR, path)
    const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        ...auth,
        'Content-Type': 'application/json',
        'Cache-Control': `max-age=${CACHE_SECONDS}`,
        'x-upsert': 'true',
      },
      body: readFileSync(path),
    })
    if (!res.ok) {
      failed++
      console.error(`${name}: ${res.status} ${await res.text()}`)
    }
  }),
)
console.log(`Uploaded ${files.length - failed} of ${files.length} files to ${BUCKET}.`)
if (failed) process.exit(1)
