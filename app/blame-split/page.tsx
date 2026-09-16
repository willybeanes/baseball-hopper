import type { Metadata } from 'next'
import { Suspense } from 'react'
import BlameSplitApp from './BlameSplitApp'

export const metadata: Metadata = {
  title: 'Blame Split — Baseball Hopper',
  description: 'In one-run losses, how much is the bullpen to blame vs. the lineup? Team-level breakdown using inning-by-inning linescore data.',
}

export default function BlameSplitPage() {
  return (
    <Suspense>
      <BlameSplitApp />
    </Suspense>
  )
}
