import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = { title: 'Account' }

export default function AccountPage() {
  return (
    <section aria-labelledby="account-title">
      <h1 id="account-title" className="text-3xl font-semibold">
        Your account
      </h1>
      <p className="mt-4 leading-relaxed text-text-muted">
        Account access is not available yet.
      </p>
      <Link href="/" className="mt-8 inline-block underline underline-offset-4">
        Back to SportZone
      </Link>
    </section>
  )
}
