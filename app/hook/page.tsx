import type { Metadata } from 'next'
import { Suspense } from 'react'
import HookApp from './HookApp'

export const metadata: Metadata = {
  title: 'Hook Efficiency — Baseball Hopper',
  description: 'Game Score v2 leaderboard and managerial hook efficiency — when did managers pull pitchers vs. when they should have?',
}

export default function HookPage() {
  return (
    <Suspense>
      <HookApp />
    </Suspense>
  )
}
