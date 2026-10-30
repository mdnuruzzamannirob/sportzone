import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { paymentMonitorService } from './payment-monitor.service.js'
import { paymentRiskParams } from './payment-risk.schema.js'
export function paymentMonitorRoutes(
  service: ReturnType<typeof paymentMonitorService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    http = createSessionHttp(sessions),
    root = '/admin/payments',
    detail = `${root}/:paymentId`,
    reconcile = `${detail}/reconcile`
  for (const path of [root, detail, reconcile]) router.options(path, security.cors('admin'))
  router.get(root, security.cors('admin'), http.require('admin'), async (req, res) => {
    parseInput(z.strictObject({}), req.params)
    const { pagination, ...data } = await service.list(
      readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, data, 200, pagination)
  })
  router.get(detail, security.cors('admin'), http.require('admin'), async (req, res) => {
    const { paymentId } = parseInput(paymentRiskParams, req.params)
    respond(
      res,
      await service.detail(readSessionCookie(req.get('Cookie'), 'admin'), paymentId, req.query),
    )
  })
  router.post(
    reconcile,
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      const { paymentId } = parseInput(paymentRiskParams, req.params)
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.reconcile(
          readSessionCookie(req.get('Cookie'), 'admin'),
          paymentId,
          req.body,
          req.get('Idempotency-Key'),
        ),
        202,
      )
    },
  )
  return router
}
