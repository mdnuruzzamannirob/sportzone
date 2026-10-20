'use client'

import { Card, CardContent } from '@heroui/react'
import { Link } from './link'
import { PagePanel } from './page-panel'
import { LoadingState } from './feedback'

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
    <Card className="rounded-card border border-border bg-surface p-6">
      <CardContent>
        <LoadingState label="Loading page…" />
        <p className="mt-2 text-sm text-text-muted">Please wait.</p>
      </CardContent>
    </Card>
  )
}
