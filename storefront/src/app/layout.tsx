import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { ThemePreferenceSelect } from '../components/theme-preference'
import './globals.css'

export const metadata: Metadata = {
  title: { default: 'SportZone', template: '%s | SportZone' },
  description: 'SportZone — sports essentials for Bangladesh.',
}

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  return (
    // The blocking bootstrap changes only root appearance attributes before hydration.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script src="/theme-bootstrap.js" />
      </head>
      <body suppressHydrationWarning>
        <div className="mx-auto max-w-storefront px-6 pt-6">
          <ThemePreferenceSelect />
        </div>
        {children}
      </body>
    </html>
  )
}
