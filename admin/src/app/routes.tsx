import { Button } from '../components/ui/button'
import { Card } from '@heroui/react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { Link } from '../components/ui/link'

function PublicLayout() {
  return (
    <main id="main-content" className="mx-auto min-h-dvh max-w-xl px-6 py-16">
      <Card className="rounded-card border border-border p-6 sm:p-8">
        <Card.Content>
          <Outlet />
        </Card.Content>
      </Card>
    </main>
  )
}

function SignInUnavailable() {
  return (
    <>
      <p className="text-sm text-text-muted">SportZone Admin</p>
      <h1 className="mt-4 text-3xl font-semibold">Administrator access</h1>
      <p className="mt-4 text-text-muted">Sign-in is not available yet.</p>
      <Button isDisabled className="mt-6">
        Sign in
      </Button>
    </>
  )
}

// No session authority exists in the scaffold. Never mount management screens here until
// Express-backed session verification and backend authorization are implemented.
function AdminAccessBoundary() {
  return (
    <main id="main-content" className="mx-auto min-h-dvh max-w-xl px-6 py-16">
      <Card className="rounded-card border border-border p-6 sm:p-8">
        <Card.Content>
          <h1 className="text-3xl font-semibold">Admin access unavailable</h1>
          <p className="mt-4 text-text-muted">
            Administrator sign-in is required. Access is not available yet.
          </p>
          <Link to="/login" className="mt-6 inline-block">
            Go to administrator sign-in
          </Link>
        </Card.Content>
      </Card>
    </main>
  )
}

function NotFound() {
  return (
    <>
      <h1 className="text-3xl font-semibold">Page not found</h1>
      <Link to="/login" className="mt-6 inline-block">
        Go to administrator sign-in
      </Link>
    </>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route index element={<Navigate to="/login" replace />} />
        <Route path="login" element={<SignInUnavailable />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route path="app/*" element={<AdminAccessBoundary />} />
    </Routes>
  )
}
