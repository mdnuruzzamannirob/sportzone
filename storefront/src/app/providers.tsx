'use client'

import type { ReactNode } from 'react'
import { IdentityProvider } from '../features/auth/identity-provider'

export function AppProviders({ children }: { children: ReactNode }) {
  return <IdentityProvider>{children}</IdentityProvider>
}
