import { Card } from '../../../components/ui/index'
import { Link } from '../../../components/ui/link'
import { AdminShell } from '../../../components/layout/admin-shell'

// No session authority exists yet. Only public navigation metadata and this denied state
// may render; no management screen or client flag can establish authenticated access.
export default function AdminAccessBoundary() {
  return (
    <AdminShell
      title="Admin access unavailable"
      actions={<Link to="/login">Go to administrator sign-in</Link>}
    >
      <Card className="max-w-2xl">
        <Card.Content>
          <p className="text-muted">
            Administrator sign-in is required. Access is not available yet.
          </p>
        </Card.Content>
      </Card>
    </AdminShell>
  )
}
