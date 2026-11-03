import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { localAuthRateLimit } from '../sessions/auth-throttle.service.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import type { SessionService } from '../sessions/session.service.js'
import { createRecoveryController } from './password-recovery.controller.js'
import type { RecoveryService } from './password-recovery.service.js'

function createRecoveryRoutes(
  service: RecoveryService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const controller = createRecoveryController(service, sessions)

  const router = Router()
  const cors = security.cors('storefront')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of [
    '/auth/password-resets',
    '/auth/password-resets/confirm',
    '/me/password-change',
  ])
    router.options(path, cors)
  for (const [path, action] of [
    ['/auth/password-resets', service.request],
    ['/auth/password-resets/confirm', service.confirm],
  ] as const) {
    router.post(
      path,
      cors,
      limit,
      security.require('storefront', 'context'),
      noQuery,
      controller.recoverPassword(action),
    )
  }
  router.post(
    '/me/password-change',
    cors,
    limit,
    security.require('storefront', 'customer'),
    noQuery,
    controller.postMePasswordChange,
  )
  return router
}

export { createRecoveryRoutes }
