import { Card } from '@heroui/react'
import { Link } from '../ui/link'
import { AdminShell } from './admin-shell'

// No session authority exists yet. Only public navigation metadata and this denied state
// may render; no management screen or client flag can establish authenticated access.
export default function AdminAccessBoundary() {
  return (
    <AdminShell
      title="Admin access unavailable"
      actions={<Link to="/login">Go to administrator sign-in</Link>}
    >
      <Card className="max-w-2xl rounded-card border border-border p-6 sm:p-8">
        <Card.Content>
          <p className="text-text-muted">
            Administrator sign-in is required. Access is not available yet.
          </p>
        </Card.Content>
      </Card>
    </AdminShell>
  )
}
