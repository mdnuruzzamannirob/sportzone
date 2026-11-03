import { createCustomerController, createCustomerAdminController } from './customer.controller.js'
import type { BrowserRouteAccess, CustomerAdministration } from '../auth/auth.public.js'
import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import type { CustomerService } from './customer.service.js'

function createCustomerRoutes(service: CustomerService, security: BrowserRouteAccess) {
  const router = Router()
  const controller = createCustomerController(service, security.readToken)
  const paths = [
    '/me',
    '/me/addresses',
    '/me/addresses/:addressId',
    '/me/addresses/:addressId/default',
    '/me/deletion-requests',
  ]
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of paths) {
    router.options(path, security.cors)
  }
  router.use('/me', security.cors, security.requireBrowser, security.requireSession, noQuery)
  router.get('/me', controller.read)
  router.patch('/me', controller.patch)
  router.get('/me/addresses', controller.list)
  router.post('/me/addresses', controller.add)
  router.patch('/me/addresses/:addressId', controller.edit)
  router.delete('/me/addresses/:addressId', controller.remove)
  router.post('/me/addresses/:addressId/default', controller.setDefault)
  router.post('/me/deletion-requests', controller.requestDeletion)
  return router
}

// Explicit local/test composition; the complete customer/history/deletion workflow remains gated.
function createCustomerAdminRoutes(service: CustomerAdministration, security: BrowserRouteAccess) {
  const router = Router()
  const cors = security.cors
  const controller = createCustomerAdminController(service, security.readToken)
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
export { createCustomerRoutes, createCustomerAdminRoutes }
