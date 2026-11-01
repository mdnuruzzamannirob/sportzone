import { Router } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { orderReadService } from './order-read.service.js'
import type { orderLifecycleService } from './order-lifecycle.service.js'
import type { codCollectionService } from '../payments/cod-collection.service.js'
import { orderId } from './order.schema.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'

export function orderAdminRoutes(
  reads: Pick<ReturnType<typeof orderReadService>, 'adminRead' | 'adminList'>,
  lifecycle: ReturnType<typeof orderLifecycleService>,
  cash: ReturnType<typeof codCollectionService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  const token = (cookie: string | undefined) => readSessionCookie(cookie, 'admin')
  for (const path of [
    '/admin/orders',
    '/admin/orders/:orderId',
    '/admin/orders/:orderId/fulfillment-transitions',
    '/admin/payments/:paymentId/cod-collections',
  ])
    router.options(path, cors)
  router.get('/admin/orders', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await reads.adminList(token(req.get('Cookie')), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/admin/orders/:orderId', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const { orderId: id } = parseInput(z.strictObject({ orderId }), req.params)
    respond(res, await reads.adminRead(token(req.get('Cookie')), id))
  })
  router.post(
    '/admin/orders/:orderId/fulfillment-transitions',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const { orderId: id } = parseInput(z.strictObject({ orderId }), req.params)
      await lifecycle.transition(token(req.get('Cookie')), id, req.body, req.get('Idempotency-Key'))
      respond(res, await reads.adminRead(token(req.get('Cookie')), id))
    },
  )
  router.post(
    '/admin/payments/:paymentId/cod-collections',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const { paymentId } = parseInput(z.strictObject({ paymentId: orderId }), req.params)
      respond(
        res,
        await cash.collect(
          token(req.get('Cookie')),
          paymentId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
