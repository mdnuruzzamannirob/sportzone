import { Router, type Request } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { refundHistoryService } from './refund-history.service.js'

export function refundHistoryRoutes(
  service: ReturnType<typeof refundHistoryService>,
  security: BrowserSecurity,
) {
  const router = Router(),
    cors = security.cors('storefront'),
    id = z.string().regex(/^[a-f0-9]{24}$/)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
  })
  for (const path of ['/me/refunds', '/orders/:orderId/refunds', '/refunds/:refundId'])
    router.options(path, cors)
  router.get('/me/refunds', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.mine(credentials(req), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/orders/:orderId/refunds', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const params = parseInput(z.strictObject({ orderId: id }), req.params)
    respond(res, await service.list(credentials(req), params.orderId))
  })
  router.get('/refunds/:refundId', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const params = parseInput(z.strictObject({ refundId: id }), req.params)
    respond(res, await service.detail(credentials(req), params.refundId))
  })
  return router
}
