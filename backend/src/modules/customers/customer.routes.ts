import { profileController } from './customer.controller.js'
import type { BrowserRouteAccess } from '../auth/auth.public.js'
import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import type { ProfileService } from './customer.service.js'

function profileRoutes(service: ProfileService, security: BrowserRouteAccess) {
  const router = Router()
  const controller = profileController(service, security.readToken)
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

export { profileRoutes }
