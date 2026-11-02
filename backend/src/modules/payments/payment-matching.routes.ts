import { Router } from 'express'
import { z } from 'zod'
import type { paymentMatchingService } from './payment-matching.service.js'
import { matchingId } from './payment-matching.schema.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
export function paymentMatchingRoutes(
  service: ReturnType<typeof paymentMatchingService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    current = createSessionHttp(sessions).require('admin')
  const link = '/admin/provider-receipts/:intakeId/link',
    allocate = '/admin/payment-collections/:collectionId/allocate'
  for (const path of [link, allocate]) router.options(path, cors)
  router.post(link, cors, security.require('admin', 'admin'), current, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { intakeId } = parseInput(z.strictObject({ intakeId: matchingId }), req.params)
    respond(
      res,
      await service.link(
        readSessionCookie(req.get('Cookie'), 'admin'),
        intakeId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  })
  router.post(allocate, cors, security.require('admin', 'admin'), current, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { collectionId } = parseInput(z.strictObject({ collectionId: matchingId }), req.params)
    const result = await service.allocate(
      readSessionCookie(req.get('Cookie'), 'admin'),
      collectionId,
      req.body,
      req.get('Idempotency-Key'),
      req.get('If-Match'),
    )
    if (!result) throw new Error('Missing allocation result')
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  })
  return router
}
