import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { readContextCookie } from '../sessions/browser-security.service.js'
import { localAuthRateLimit } from '../sessions/auth-throttle.service.js'
import type { RecoveryService } from './password-recovery.service.js'
import { createSessionHttp, readSessionCookie } from '../sessions/session.http.js'
import type { SessionService } from '../sessions/session.service.js'

export function recoveryRoutes(
  service: RecoveryService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const router = Router(),
    cookies = createSessionHttp(sessions)
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
      async (req, res) => {
        respond(
          res,
          await action(
            req.body,
            readContextCookie(req.get('Cookie'), 'storefront') ?? '',
            req.get('X-CSRF-Token') ?? '',
          ),
        )
      },
    )
  }
  router.post(
    '/me/password-change',
    cors,
    limit,
    security.require('storefront', 'customer'),
    noQuery,
    async (req, res) => {
      const result = await service.change(
        req.body,
        readSessionCookie(req.get('Cookie'), 'customer'),
      )
      cookies.setCookie(res, result.issued)
      respond(res, { changed: true, csrfToken: result.issued.csrfToken })
    },
  )
  return router
}
