import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemePreferenceSelect } from '../../components/theme-preference'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const metadata: Metadata = { robots: { index: false, follow: false } }

// Cache isolation is a presentation boundary. Express will enforce sessions and ownership.
export default function PrivateLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <main id="main-content" className="mx-auto min-h-dvh max-w-3xl px-6 py-16">
      <details className="mb-8 text-sm"><summary className="min-h-control cursor-pointer py-3">Appearance</summary><ThemePreferenceSelect /></details>
      {children}
    </main>
  )
}
