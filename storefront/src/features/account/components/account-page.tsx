import { PagePanel } from '../../../components/ui/page-panel'
import { Link } from '../../../components/ui/link'

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
