import Link from 'next/link'

export function MissingPage() {
  return (
    <section aria-labelledby="missing-title">
      <h1 id="missing-title" className="text-3xl">
        Page not found
      </h1>
      <p className="mt-4 text-text-muted">This page could not be found.</p>
      <Link
        href="/"
        className="mt-6 inline-flex min-h-control items-center underline"
      >
        Back to SportZone
      </Link>
    </section>
  )
}

export function LoadingPage() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-card border border-border bg-surface p-6"
    >
      <p>Loading page…</p>
      <p className="mt-2 text-sm text-text-muted">Please wait.</p>
    </div>
  )
}
