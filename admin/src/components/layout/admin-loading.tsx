import { Card, Spinner } from '../ui/index'

export function AdminLoading() {
  return (
    <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl p-6">
      <Card role="status" aria-live="polite">
        <Spinner aria-hidden="true" />
        <p>Loading administration…</p>
      </Card>
    </main>
  )
}
