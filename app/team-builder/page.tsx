import type { Metadata } from 'next'
import { Suspense } from 'react'
import { TEAM_NAMES } from '@/lib/team-builder/teams'
import TeamBuilderApp from './TeamBuilderApp'

const DESCRIPTION =
  "Every team's 2027 roster as it stands today. Decline options, sign free agents, make trades and call up prospects, and watch payroll, the luxury tax, projected WAR and the projected record move."

// Shared links preview with the team's name, and say when the link carries someone's moves.
export async function generateMetadata({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }): Promise<Metadata> {
  const params = await searchParams
  const name = TEAM_NAMES[String(params.team ?? '').toUpperCase()]
  const title = name ? `${name}: 2027 Team Builder — Baseball Hopper` : '2027 Team Builder — Baseball Hopper'
  const description = name && params.m
    ? `A 2027 ${name} roster built on Baseball Hopper: the moves, the payroll and luxury tax, projected WAR and the projected record.`
    : DESCRIPTION
  return {
    title,
    description,
    openGraph: { title, description, type: 'website', siteName: 'Baseball Hopper' },
    twitter: { card: 'summary', title, description },
  }
}

export default function TeamBuilderPage() {
  return (
    <Suspense>
      <TeamBuilderApp />
    </Suspense>
  )
}
