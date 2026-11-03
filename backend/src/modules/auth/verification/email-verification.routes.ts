import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { readContextCookie } from '../sessions/browser-security.service.js'
import type { createEmailVerificationService } from './email-verification.service.js'
function emailVerificationRoutes(
  service: ReturnType<typeof createEmailVerificationService>,
  security: BrowserSecurity,
  throttle: RequestHandler,
) {
  const router = Router(),
    cors = security.cors('storefront')
  for (const [path, action] of [
    ['/auth/email-verifications', service.request],
    ['/auth/email-verifications/confirm', service.confirm],
  ] as const) {
    router.options(path, cors)
    router.post(
      path,
      cors,
      throttle,
      security.require('storefront', 'context'),
      async (req, res) => {
        parseInput(z.strictObject({}), req.query)
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
  return router
}

export { emailVerificationRoutes }
