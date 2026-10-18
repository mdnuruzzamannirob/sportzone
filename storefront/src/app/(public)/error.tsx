'use client'

import Link from 'next/link'
import { Button } from '../../components/ui/button'

export default function PublicError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section aria-labelledby="error-title" role="alert">
    <h1 id="error-title" className="text-3xl">This page could not load</h1>
    <p className="mt-4 text-text-muted">Try again, or return to the home page.</p>
    <div className="mt-6 flex flex-wrap gap-4">
      <Button type="button" onPress={reset}>Try again</Button>
      <Link href="/" className="inline-flex min-h-control items-center underline">Back to SportZone</Link>
    </div>
  </section>
}
