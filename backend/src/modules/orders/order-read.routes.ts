import { Router, type Request } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { orderReadService } from './order-read.service.js'
import { orderId } from './order.schema.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
export function orderReadRoutes(
  service: ReturnType<typeof orderReadService>,
  security: BrowserSecurity,
) {
  const router = Router(),
    cors = security.cors('storefront')
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
  })
  for (const path of ['/orders', '/orders/:orderId', '/orders/:orderId/status'])
    router.options(path, cors)
  router.get('/orders', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.params)
    const { items, pagination } = await service.list(
      readSessionCookie(req.get('Cookie'), 'customer'),
      req.query,
    )
    respond(res, items, 200, pagination)
  })
  for (const [path, status] of [
    ['/orders/:orderId', false],
    ['/orders/:orderId/status', true],
  ] as const)
    router.get(path, cors, async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.query)
      const params = parseInput(z.strictObject({ orderId }), req.params)
      respond(res, await service.read(credentials(req), params.orderId, status))
    })
  return router
}
