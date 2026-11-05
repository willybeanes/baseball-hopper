import type { Metadata } from 'next'
import { Suspense } from 'react'
import SimulateApp from './SimulateApp'

const TITLE = 'Simulate the 2027 offseason — Baseball Hopper'
const DESCRIPTION =
  "Set every team's plan for the winter (all in, contend, buy and sell, rebuild or tank), make your own moves, and see the trades, signings and projected 2027 standings that come out of it."

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, type: 'website', siteName: 'Baseball Hopper' },
  twitter: { card: 'summary', title: TITLE, description: DESCRIPTION },
}

export default function SimulatePage() {
  return (
    <Suspense>
      <SimulateApp />
    </Suspense>
  )
}
