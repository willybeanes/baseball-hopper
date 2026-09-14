import type { Metadata } from 'next'
import { Suspense } from 'react'
import ManagerHookApp from './ManagerHookApp'

export const metadata: Metadata = {
  title: 'Manager Hook Efficiency — Baseball Hopper',
  description: 'How well did managers pull their starters? Hook Efficiency ranks managers by actual vs. peak-possible Game Score v2 across every start.',
}

export default function ManagerHookPage() {
  return (
    <Suspense>
      <ManagerHookApp />
    </Suspense>
  )
}
