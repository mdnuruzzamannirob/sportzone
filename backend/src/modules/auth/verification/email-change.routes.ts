import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { localAuthRateLimit } from '../sessions/auth-throttle.service.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import type { SessionService } from '../sessions/session.service.js'
import { createEmailChangeController } from './email-change.controller.js'
import type { EmailChangeService } from './email-change.service.js'

function createEmailChangeRoutes(
  service: EmailChangeService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const controller = createEmailChangeController(service, sessions)

  const router = Router()
  const cors = security.cors('storefront'),
    guard = security.require('storefront', 'customer')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of ['/me/email-changes', '/me/email-changes/confirm']) router.options(path, cors)
  router.post('/me/email-changes', cors, limit, guard, noQuery, controller.postMeEmailChanges)
  router.post(
    '/me/email-changes/confirm',
    cors,
    limit,
    guard,
    noQuery,
    controller.postEmailChangesConfirm,
  )
  return router
}

export { createEmailChangeRoutes }
