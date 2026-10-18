import type { Metadata } from 'next'
import { PagePanel } from '../../../components/page-panel'
import { Link } from '../../../components/ui/link'

export const metadata: Metadata = { title: 'Account' }

export default function AccountPage() {
  return (
    <PagePanel id="account-title" title="Your account">
      <p className="leading-relaxed text-text-muted">
        Account access is not available yet.
      </p>
      <Link href="/">Back to SportZone</Link>
    </PagePanel>
  )
}
