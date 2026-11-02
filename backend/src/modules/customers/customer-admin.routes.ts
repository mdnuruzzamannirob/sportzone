import { Router } from 'express'
import { z } from 'zod'
import type { customerAdminService } from '../auth/customer-admin.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'

// Explicit local/test composition; the complete customer/history/deletion workflow remains gated.
export function customerAdminRoutes(
  service: ReturnType<typeof customerAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  const params = z.strictObject({ customerId: z.string().regex(/^[a-f0-9]{24}$/) })
  for (const path of [
    '/admin/customers',
    '/admin/customers/:customerId',
    '/admin/customers/:customerId/status-decisions',
  ])
    router.options(path, cors)
  for (const kind of ['orders', 'claims', 'refunds'] as const) {
    const path = `/admin/customers/:customerId/${kind}`
    router.options(path, cors)
    router.get(path, cors, http.require('admin'), async (req, res) => {
      parseInput(z.undefined(), req.body)
      const result = await service.history(
        readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(params, req.params).customerId,
        kind,
        req.query,
      )
      respond(res, result.items, 200, result.pagination)
    })
  }
  router.options('/admin/customers/:customerId/deletion-request', cors)
  router.get(
    '/admin/customers/:customerId/deletion-request',
    cors,
    http.require('admin'),
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.privacy(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(params, req.params).customerId,
        ),
      )
    },
  )
  router.options('/admin/customers/:customerId/deletion-decisions', cors)
  router.post(
    '/admin/customers/:customerId/deletion-decisions',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.decidePrivacy(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(params, req.params).customerId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  router.get('/admin/customers', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/admin/customers/:customerId', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.detail(
        readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(params, req.params).customerId,
      ),
    )
  })
  router.post(
    '/admin/customers/:customerId/status-decisions',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.decideStatus(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(params, req.params).customerId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
