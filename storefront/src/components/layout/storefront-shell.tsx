import { Link } from '../ui/link'
import type { ReactNode } from 'react'
import { NetworkStatus } from './network-status'
import { StorefrontHeader } from './storefront-header'

export const supportLinks = [
  ['Contact', '/contact'],
  ['Customer support', '/support'],
  ['Shipping', '/policies/shipping'],
  ['Cancellation', '/policies/cancellation'],
  ['Returns and refunds', '/policies/returns-refunds'],
  ['Privacy', '/policies/privacy'],
  ['Terms', '/policies/terms'],
] as const

export function StorefrontShell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 sm:px-6">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <StorefrontHeader />
      <NetworkStatus />
      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 py-12 sm:py-16">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-sm text-foreground">
        <p>SportZone · Made for your next game.</p>
        <nav
          aria-label="Support and policies"
          className="mt-4 flex flex-wrap gap-x-6 gap-y-2"
        >
          {supportLinks.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              className="inline-flex  items-center"
            >
              {label}
            </Link>
          ))}
        </nav>
      </footer>
    </div>
  )
}
