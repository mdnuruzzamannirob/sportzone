import { credentialsController } from './credentials.controller.js'
import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import { readContextCookie, type BrowserSecurity } from '../sessions/browser-security.service.js'
import { localAuthRateLimit } from '../sessions/auth-throttle.service.js'
import type { CustomerService } from './credentials.service.js'
import type { RecoveryService } from '../recovery/password-recovery.service.js'
import { createSessionHttp } from '../sessions/session.http.js'
import { logoutProtection } from '../sessions/browser-security.service.js'
import type { SessionService } from '../sessions/session.service.js'
function adminRoutes(
  credentials: CustomerService,
  recovery: RecoveryService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const router = Router(),
    cookies = createSessionHttp(sessions),
    cors = security.cors('admin')
  const controller = credentialsController(credentials, security, sessions, 'admin')
  const context = security.require('admin', 'context')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of ['login', 'session', 'logout', 'password-resets', 'password-resets/confirm'])
    router.options(`/admin/auth/${path}`, cors)
  const material = (req: import('express').Request) => ({
    context: readContextCookie(req.get('Cookie'), 'admin') ?? '',
    csrf: req.get('X-CSRF-Token') ?? '',
  })
  router.post('/admin/auth/login', cors, limit, context, noQuery, controller.login)
  router.get('/admin/auth/session', cors, cookies.require('admin'), noQuery, controller.current)
  router.post(
    '/admin/auth/logout',
    cors,
    limit,
    logoutProtection(security, 'admin', 'admin'),
    noQuery,
    controller.logout,
  )
  for (const [path, action] of [
    ['password-resets', recovery.request],
    ['password-resets/confirm', recovery.confirm],
  ] as const)
    router.post(`/admin/auth/${path}`, cors, limit, context, noQuery, async (req, res) => {
      const input = material(req)
      respond(res, await action(req.body, input.context, input.csrf))
    })
  return router
}

export { adminRoutes }
