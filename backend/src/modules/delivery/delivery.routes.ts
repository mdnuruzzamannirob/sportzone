import { ApiError } from '../../shared/errors/app-error.js'
import { Router, type RequestHandler } from 'express'
import { createDeliveryController, createDeliveryAreasController } from './delivery.controller.js'
import type { DeliveryService } from './delivery.service.js'
import type { DeliveryAreasAccess } from './delivery.public.js'

interface DeliveryRouteSecurity {
  cors: RequestHandler
  requireBrowser: RequestHandler
  requireSession: RequestHandler
  readToken: (header: string | undefined) => string | undefined
}

function createDeliveryRoutes(service: DeliveryService, security: DeliveryRouteSecurity) {
  const router = Router()
  const controller = createDeliveryController(service, security.readToken)
  for (const path of [
    '/admin/delivery/zones',
    '/admin/delivery/zones/:zoneId',
    '/admin/delivery/charges',
    '/admin/delivery/charges/:chargeId/activate',
    '/admin/delivery/charges/:chargeId/deactivate',
    '/admin/delivery/charges/:chargeId/supersede',
  ])
    router.options(path, security.cors)
  router.use(
    '/admin/delivery',
    security.cors,
    security.requireBrowser,
    security.requireSession,
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )
  router.get('/admin/delivery/zones', controller.zones)
  router.get('/admin/delivery/charges', controller.charges)
  router.post('/admin/delivery/zones', controller.createZone)
  router.patch('/admin/delivery/zones/:zoneId', controller.patchZone)
  router.post('/admin/delivery/charges', controller.createCharge)
  for (const action of ['activate', 'deactivate', 'supersede'] as const)
    router.post(`/admin/delivery/charges/:chargeId/${action}`, controller.transition(action))
  return router
}

function createDeliveryAreaRoutes(read: DeliveryAreasAccess, origins: readonly string[]) {
  const router = Router()
  const cors: RequestHandler = (req, res, next) => {
    res.vary('Origin')
    const origin = req.get('Origin')
    if (origin && !origins.includes(origin)) throw new ApiError('FORBIDDEN')
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Access-Control-Allow-Credentials', 'true')
    }
    if (req.method === 'OPTIONS') {
      res.vary('Access-Control-Request-Headers')
      res.vary('Access-Control-Request-Method')
      const headers = (req.get('Access-Control-Request-Headers') ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
      if (
        !origin ||
        !['GET', 'HEAD'].includes(req.get('Access-Control-Request-Method') ?? '') ||
        headers.some((v) => v !== 'content-type')
      )
        throw new ApiError('FORBIDDEN')
      res.set('Access-Control-Allow-Methods', 'GET, HEAD')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
      res.status(204).end()
      return
    }
    next()
  }
  router.options('/delivery/areas', cors)
  router.get('/delivery/areas', cors, createDeliveryAreasController(read))
  return router
}

export { createDeliveryRoutes, createDeliveryAreaRoutes }
export type { DeliveryRouteSecurity }
