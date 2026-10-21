import type { ReactNode } from 'react'
import type { Metadata } from 'next'
import { AppearanceMenu } from '../../components/layout/appearance-menu'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const metadata: Metadata = { robots: { index: false, follow: false } }
export default function AuthLayout({children}:{children:ReactNode}) { return <main id="main-content" className="mx-auto min-h-dvh max-w-xl px-6 py-12"><AppearanceMenu/>{children}</main> }
