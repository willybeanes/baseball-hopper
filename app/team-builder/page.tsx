import type { Metadata } from 'next'
import { Suspense } from 'react'
import TeamBuilderApp from './TeamBuilderApp'

export const metadata: Metadata = {
  title: 'Team Builder — Baseball Hopper',
  description: "Every team's 2027 roster as it stands today: who's signed, who has an option, who's headed to arbitration, and what it all costs against the luxury tax.",
}

export default function TeamBuilderPage() {
  return (
    <Suspense>
      <TeamBuilderApp />
    </Suspense>
  )
}
