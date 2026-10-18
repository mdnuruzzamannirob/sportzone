import Link from 'next/link'
import type { ReactNode } from 'react'

export default function PublicLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-storefront flex-col px-6">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <header className="py-8">
        <Link href="/" className="text-xl font-semibold tracking-tight text-text">
          SportZone
          <span aria-hidden="true" className="text-brand">
            .
          </span>
        </Link>
      </header>
      <main
        id="main-content"
        tabIndex={-1}
        className="flex flex-1 items-center py-16"
      >
        {children}
      </main>
      <footer className="py-6 text-sm text-text-muted">
        Made for your next game.
      </footer>
    </div>
  )
}
