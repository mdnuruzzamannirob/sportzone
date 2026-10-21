import { Component, type ReactNode } from 'react'
import { Button } from '../components/ui/button'
import { Notice } from '../components/ui/feedback'

export class RouteErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl px-6 py-16">
        <h1 className="mb-6 text-3xl font-semibold">Administration could not load</h1>
        <Notice tone="error" title="Try loading the page again">
          <p>Check your connection, then reload to try again.</p>
          <Button onPress={() => window.location.reload()}>Reload page</Button>
        </Notice>
      </main>
    )
  }
}
