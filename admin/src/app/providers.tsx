import { IdentityProvider } from '../features/auth/identity-provider'
import type { ReactNode } from 'react'
import { BrowserRouter } from 'react-router'

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <IdentityProvider>
      <BrowserRouter>{children}</BrowserRouter>
    </IdentityProvider>
  )
}
