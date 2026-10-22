import type { Metadata } from 'next'
import { PagePanel } from '../ui/page-panel'

export const unavailableMetadata: Metadata = { robots: { index: false, follow: false } }

export function UnavailablePage({ title }: { title: string }) {
  return (
    <PagePanel id="destination-title" title={title}>
      <p className="max-w-prose text-muted">This page is not available yet.</p>
    </PagePanel>
  )
}
