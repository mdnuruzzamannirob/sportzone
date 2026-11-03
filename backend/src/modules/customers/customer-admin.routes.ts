import { customerAdminController } from './customer.controller.js'
import type { BrowserRouteAccess, CustomerAdministration } from '../auth/auth.public.js'
import { Router } from 'express'

// Explicit local/test composition; the complete customer/history/deletion workflow remains gated.
function customerAdminRoutes(service: CustomerAdministration, security: BrowserRouteAccess) {
  const router = Router()
  const cors = security.cors
  const controller = customerAdminController(service, security.readToken)
  for (const path of [
    '/admin/customers',
    '/admin/customers/:customerId',
    '/admin/customers/:customerId/status-decisions',
  ])
    router.options(path, cors)
  for (const kind of ['orders', 'claims', 'refunds'] as const) {
    const path = `/admin/customers/:customerId/${kind}`
    router.options(path, cors)
    router.get(path, cors, security.requireSession, controller.history(kind))
  }
  router.options('/admin/customers/:customerId/deletion-request', cors)
  router.get(
    '/admin/customers/:customerId/deletion-request',
    cors,
    security.requireSession,
    controller.privacy,
  )
  router.options('/admin/customers/:customerId/deletion-decisions', cors)
  router.post(
    '/admin/customers/:customerId/deletion-decisions',
    cors,
    security.requireBrowser,
    security.requireSession,
    controller.decidePrivacy,
  )
  router.get('/admin/customers', cors, security.requireSession, controller.list)
  router.get('/admin/customers/:customerId', cors, security.requireSession, controller.detail)
  router.post(
    '/admin/customers/:customerId/status-decisions',
    cors,
    security.requireBrowser,
    security.requireSession,
    controller.decideStatus,
  )
  return router
}

export { customerAdminRoutes }
