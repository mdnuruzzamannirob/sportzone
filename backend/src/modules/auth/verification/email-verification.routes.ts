import { createEmailVerificationController } from './email-verification.controller.js'
import { Router, type RequestHandler } from 'express'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import type { createEmailVerificationService } from './email-verification.service.js'

function createEmailVerificationRoutes(
  service: ReturnType<typeof createEmailVerificationService>,
  security: BrowserSecurity,
  throttle: RequestHandler,
) {
  const controller = createEmailVerificationController()

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
      controller.postAction(action),
    )
  }
  return router
}

export { createEmailVerificationRoutes }
