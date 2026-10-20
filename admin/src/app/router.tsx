import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { PublicLayout } from '../components/layout/public-layout'
import { NotFound } from '../components/layout/not-found'
import { AdminLoading } from '../components/layout/admin-loading'
import { SignInUnavailable } from '../features/auth/pages/sign-in-unavailable'
import { RouteErrorBoundary } from './route-error-boundary'

const AdminAccessBoundary = lazy(
  () => import('../features/auth/components/admin-access-boundary'),
)

export function AppRoutes() {
  return (
    <RouteErrorBoundary>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Navigate to="/login" replace />} />
          <Route path="login" element={<SignInUnavailable />} />
          <Route path="*" element={<NotFound />} />
        </Route>
        <Route
          path="app/*"
          element={
            <Suspense fallback={<AdminLoading />}>
              <AdminAccessBoundary />
            </Suspense>
          }
        />
      </Routes>
    </RouteErrorBoundary>
  )
}
