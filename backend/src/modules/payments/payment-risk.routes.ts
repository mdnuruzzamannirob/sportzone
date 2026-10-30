import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { paymentRiskService } from './payment-risk.service.js'
import { paymentRiskParams } from './payment-risk.schema.js'
export function paymentRiskRoutes(
  service: ReturnType<typeof paymentRiskService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    path = '/admin/payments/:paymentId/risk-decisions'
  router.options(path, security.cors('admin'))
  router.post(
    path,
    security.cors('admin'),
    security.require('admin', 'admin'),
    createSessionHttp(sessions).require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const { paymentId } = parseInput(paymentRiskParams, req.params)
      respond(
        res,
        await service.decide(
          readSessionCookie(req.get('Cookie'), 'admin'),
          paymentId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
