import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { AdminLoading } from '../components/layout/admin-loading'
import { NotFound } from '../components/layout/not-found'
import { PublicLayout } from '../components/layout/public-layout'
import { Authentication } from '../features/auth/components/authentication'
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
          <Route path="login" element={<Authentication mode="login" />} />
          <Route
            path="forgot-password"
            element={<Authentication mode="forgot-password" />}
          />
          <Route
            path="reset-password"
            element={<Authentication mode="reset-password" />}
          />
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
