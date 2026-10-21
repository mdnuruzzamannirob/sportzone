'use client'

import { Card, CardContent } from './primitives'
import { Link } from './link'
import { PagePanel } from './page-panel'
import { LoadingState } from './feedback'

export function MissingPage() {
  return (
    <PagePanel id="missing-title" title="Page not found">
      <p className="text-muted">This page could not be found.</p>
      <Link href="/">Back to SportZone</Link>
    </PagePanel>
  )
}

export function LoadingPage() {
  return (
    <Card className="bg-surface">
      <CardContent>
        <LoadingState label="Loading page…" />
        <p className="mt-2 text-sm text-muted">Please wait.</p>
      </CardContent>
    </Card>
  )
}
