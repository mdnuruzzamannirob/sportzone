import { Router, type Request } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { returnHistoryService } from './return-history.service.js'
import { claimId } from './return.schema.js'
// Explicit local/test composition only; full history/refund operations remain gated.
export function returnHistoryRoutes(
  service: ReturnType<typeof returnHistoryService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('storefront'),
    adminCors = security.cors('admin'),
    http = createSessionHttp(sessions)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
  })
  for (const path of ['/orders/:orderId/claims', '/claims/:claimId']) router.options(path, cors)
  for (const path of ['/admin/claims', '/admin/claims/:claimId']) router.options(path, adminCors)
  router.get('/admin/claims', adminCors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.adminList(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/admin/claims/:claimId', adminCors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.adminDetail(
        readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ claimId }), req.params).claimId,
      ),
    )
  })
  router.get('/orders/:orderId/claims', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.list(
        credentials(req),
        parseInput(z.strictObject({ orderId: claimId }), req.params).orderId,
      ),
    )
  })
  router.get('/claims/:claimId', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.detail(
        credentials(req),
        parseInput(z.strictObject({ claimId }), req.params).claimId,
      ),
    )
  })
  return router
}
