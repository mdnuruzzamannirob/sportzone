import { credentialsController } from './credentials.controller.js'
import { localAuthRateLimit } from '../sessions/auth-throttle.service.js'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import type { CustomerService } from './credentials.service.js'
import { logoutProtection } from '../sessions/browser-security.service.js'
import type { SessionService } from '../sessions/session.service.js'

function customerRoutes(
  service: CustomerService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const router = Router()
  const controller = credentialsController(service, security, sessions)
  const endpoints = ['/auth/register', '/auth/login', '/auth/logout', '/auth/session']
  for (const path of endpoints) router.options(path, security.cors('storefront'))
  const context = security.require('storefront', 'context')
  const cors = security.cors('storefront')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  router.post('/auth/register', cors, limit, context, noQuery, controller.register)
  router.post('/auth/login', cors, limit, context, noQuery, controller.login)
  router.get('/auth/session', cors, noQuery, controller.current)
  router.post('/auth/logout', cors, limit, logoutProtection(security), noQuery, controller.logout)
  return router
}

export { logoutProtection } from '../sessions/browser-security.service.js'
export { customerRoutes }
