import { Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { refundOperationsService } from './refund-operations.service.js'

export function refundRoutes(
  service: ReturnType<typeof refundOperationsService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  const token = (cookie: string | undefined) => readSessionCookie(cookie, 'admin')
  const params = z.strictObject({
    refundId: z.string().regex(/^[a-f0-9]{24}$/),
  })
  for (const path of [
    '/admin/refunds',
    '/admin/refunds/:refundId',
    '/admin/refund-groups',
    '/admin/refunds/:refundId/payout-attempts',
  ])
    router.options(path, cors)
  router.get('/admin/refunds', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req.get('Cookie')), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/admin/refunds/:refundId', cors, http.require('admin'), async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    parseInput(z.undefined(), req.body)
    respond(
      res,
      await service.detail(token(req.get('Cookie')), parseInput(params, req.params).refundId),
    )
  })
  router.post(
    '/admin/refund-groups',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.group(token(req.get('Cookie')), req.body, req.get('Idempotency-Key')),
      )
    },
  )
  router.post(
    '/admin/refunds/:refundId/payout-attempts',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.payout(
          token(req.get('Cookie')),
          parseInput(params, req.params).refundId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
