import { Button } from '../components/ui/button'
import { Card, Spinner } from '@heroui/react'
import { lazy, Suspense } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router'
import { Link } from '../components/ui/link'
import { ThemePreferenceSelect } from '../components/theme-preference'
const AdminAccessBoundary = lazy(
  () => import('../components/admin/admin-access-boundary'),
)

function PublicLayout() {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto min-h-dvh max-w-xl px-6 py-16"
    >
      <div className="mb-6">
        <ThemePreferenceSelect />
      </div>
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
      <Route
        path="app/*"
        element={
          <Suspense
            fallback={
              <main id="main-content" tabIndex={-1} className="mx-auto max-w-xl p-6">
                <Card role="status" aria-live="polite">
                  <Spinner aria-hidden="true" />
                  <p>Loading administration…</p>
                </Card>
              </main>
            }
          >
            <AdminAccessBoundary />
          </Suspense>
        }
      />
    </Routes>
  )
}
