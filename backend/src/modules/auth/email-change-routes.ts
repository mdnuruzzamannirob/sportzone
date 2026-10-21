import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../common/middleware/validation.js'
import { respond } from '../../common/responses.js'
import type { BrowserSecurity } from './browser-security.js'
import { localAuthRateLimit } from './rate-limit.js'
import type { EmailChangeService } from './email-change.js'
import { createSessionHttp, readSessionCookie } from './session-http.js'
import type { SessionService } from './sessions.js'
export function emailChangeRoutes(
  service: EmailChangeService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const router = Router(),
    cookies = createSessionHttp(sessions)
  const cors = security.cors('storefront'),
    guard = security.require('storefront', 'customer')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of ['/me/email-changes', '/me/email-changes/confirm'])
    router.options(path, cors)
  router.post(
    '/me/email-changes',
    cors,
    limit,
    guard,
    noQuery,
    async (req, res) => {
      respond(
        res,
        await service.request(
          req.body,
          readSessionCookie(req.get('Cookie'), 'customer'),
        ),
      )
    },
  )
  router.post(
    '/me/email-changes/confirm',
    cors,
    limit,
    guard,
    noQuery,
    async (req, res) => {
      const account = await service.confirm(
        req.body,
        readSessionCookie(req.get('Cookie'), 'customer'),
      )
      cookies.clearCookie(res, 'customer')
      respond(res, account)
    },
  )
  return router
}
