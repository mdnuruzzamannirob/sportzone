'use client'

import { Alert } from '../../components/ui/index'
import { Link } from '../../components/ui/link'
import { Button } from '../../components/ui/button'

export default function PublicError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <Alert
      aria-labelledby="error-title"
      role="alert"
      className=" border border-border p-6"
    >
      <Alert.Content>
        <h1 id="error-title" className="text-3xl">
          This page could not load
        </h1>
        <p className="mt-4 text-muted">Try again, or return to the home page.</p>
        <div className="mt-6 flex flex-wrap gap-4">
          <Button type="button" onPress={reset}>
            Try again
          </Button>
          <Link href="/" className="inline-flex  items-center">
            Back to SportZone
          </Link>
        </div>
      </Alert.Content>
    </Alert>
  )
}
