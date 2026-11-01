import { Router, type Request } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { cancellationService } from './cancellation.service.js'
import { orderId } from './order.schema.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { ApiError } from '../../shared/errors/app-error.js'

// Explicit local assembly only; all ownership/state/funding decisions stay in Orders services.
export function cancellationRoutes(
  service: ReturnType<typeof cancellationService>,
  security: BrowserSecurity,
  sessions: SessionService,
  storefrontOrigin: string,
) {
  const router = Router(),
    customerCors = security.cors('storefront'),
    adminCors = security.cors('admin'),
    http = createSessionHttp(sessions)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const params = z.strictObject({ orderId })
  router.options('/orders/:orderId/cancellation-requests', customerCors)
  router.get('/orders/:orderId/cancellation-requests', customerCors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.list(credentials(req), parseInput(params, req.params).orderId))
  })
  router.post('/orders/:orderId/cancellation-requests', customerCors, async (req, res) => {
    if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.request(
        credentials(req),
        parseInput(params, req.params).orderId,
        req.body,
        req.get('Idempotency-Key'),
      ),
      201,
    )
  })
  router.options('/admin/cancellation-requests', adminCors)
  router.get('/admin/cancellation-requests', adminCors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.adminList(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.options('/admin/cancellation-requests/:requestId/decision', adminCors)
  router.post(
    '/admin/cancellation-requests/:requestId/decision',
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const id = parseInput(z.strictObject({ requestId: orderId }), req.params).requestId
      respond(
        res,
        await service.decide(
          readSessionCookie(req.get('Cookie'), 'admin'),
          id,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
