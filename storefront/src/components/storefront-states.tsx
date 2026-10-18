'use client'

import { Card, CardContent, Spinner } from '@heroui/react'
import { Link } from './ui/link'
import { PagePanel } from './page-panel'

export function MissingPage() {
  return (
    <PagePanel id="missing-title" title="Page not found">
      <p className="text-text-muted">This page could not be found.</p>
      <Link href="/">Back to SportZone</Link>
    </PagePanel>
  )
}

export function LoadingPage() {
  return (
    <Card
      role="status"
      aria-live="polite"
      className="rounded-card border border-border bg-surface p-6"
    >
      <CardContent className="flex flex-row items-center gap-4">
        <Spinner aria-hidden="true" />
        <div>
          <p>Loading page…</p>
          <p className="mt-2 text-sm text-text-muted">Please wait.</p>
        </div>
      </CardContent>
    </Card>
  )
}
