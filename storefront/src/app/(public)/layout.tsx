import type { ReactNode } from 'react'
import { StorefrontShell } from '../../components/storefront-shell'

export default function PublicLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <StorefrontShell>{children}</StorefrontShell>
}
