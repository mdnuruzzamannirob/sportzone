import { Router, type Request, type RequestHandler } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type {
  createReturnHistoryService,
  createReturnLifecycleService,
  createReturnOperationsService,
  createReturnPhysicalService,
} from './return.service.js'
import { claimId, claimInspectionInput, claimCompleteInput } from './return.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { claimEvidenceMultipart } from '../media/media.controller.js'

// Shared current-session reads; root composition owns environment admission.
function createReturnHistoryRoutes(
  service: ReturnType<typeof createReturnHistoryService>,
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
  for (const path of ['/me/claims', '/orders/:orderId/claims', '/claims/:claimId'])
    router.options(path, cors)
  for (const path of ['/admin/claims', '/admin/claims/:claimId']) router.options(path, adminCors)
  router.get('/me/claims', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.mine(credentials(req), req.query)
    respond(res, result.items, 200, result.pagination)
  })
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

function createReturnRoutes(
  operations: ReturnType<typeof createReturnOperationsService>,
  lifecycle: ReturnType<typeof createReturnLifecycleService>,
  physical: ReturnType<typeof createReturnPhysicalService>,
  history: ReturnType<typeof createReturnHistoryService>,
  security: BrowserSecurity,
  sessions: SessionService,
  storefrontOrigin: string,
  maxBytes: number,
  uploadThrottle: RequestHandler,
  adminEvidence: (
    token: string | undefined,
    claim: string,
    asset: string,
  ) => Promise<{
    url: string
  }>,
) {
  const router = Router(),
    customer = security.cors('storefront'),
    admin = security.cors('admin'),
    http = createSessionHttp(sessions)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const emptyQuery = (req: Request) => parseInput(z.strictObject({}), req.query)
  const order = (req: Request) =>
    parseInput(z.strictObject({ orderId: claimId }), req.params).orderId
  const claim = (req: Request) => parseInput(z.strictObject({ claimId }), req.params).claimId
  const customerMutation: RequestHandler = (req, _res, next) => {
    if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
    next()
  }
  for (const path of [
    '/orders/:orderId/claim-eligibility',
    '/orders/:orderId/claims',
    '/orders/:orderId/claims/evidence-uploads',
    '/orders/:orderId/claims/evidence/:assetId',
  ])
    router.options(path, customer)
  router.get('/orders/:orderId/claim-eligibility', customer, async (req, res) => {
    emptyQuery(req)
    parseInput(z.undefined(), req.body)
    respond(res, await operations.eligibility(credentials(req), order(req)))
  })
  router.post('/orders/:orderId/claims', customer, customerMutation, async (req, res) => {
    emptyQuery(req)
    respond(
      res,
      await operations.submit(credentials(req), order(req), req.body, req.get('Idempotency-Key')),
      201,
    )
  })
  router.post(
    '/orders/:orderId/claims/evidence-uploads',
    customer,
    customerMutation,
    async (req, _res, next) => {
      await operations.authorize(credentials(req), order(req))
      next()
    },
    uploadThrottle,
    async (req, res) => {
      const parsed = await claimEvidenceMultipart(req, maxBytes)
      respond(res, await operations.upload(credentials(req), order(req), parsed.input, parsed.file))
    },
  )
  router.get('/orders/:orderId/claims/evidence/:assetId', customer, async (req, res) => {
    emptyQuery(req)
    parseInput(z.undefined(), req.body)
    const p = parseInput(z.strictObject({ orderId: claimId, assetId: claimId }), req.params)
    respond(res, await operations.privateEvidence(credentials(req), p.orderId, p.assetId))
  })
  for (const path of [
    '/admin/claims/:claimId/review',
    '/admin/claims/:claimId/receipt',
    '/admin/claims/:claimId/inspection',
    '/admin/claims/:claimId/complete',
    '/admin/claims/:claimId/evidence/:assetId',
  ])
    router.options(path, admin)
  const actor = (req: Request) => readSessionCookie(req.get('Cookie'), 'admin')
  router.post(
    '/admin/claims/:claimId/review',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      emptyQuery(req)
      respond(
        res,
        await operations.review(actor(req), claim(req), req.body, req.get('Idempotency-Key')),
      )
    },
  )
  router.post(
    '/admin/claims/:claimId/receipt',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      emptyQuery(req)
      respond(
        res,
        await operations.receive(actor(req), claim(req), req.body, req.get('Idempotency-Key')),
      )
    },
  )
  router.post(
    '/admin/claims/:claimId/inspection',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      emptyQuery(req)
      const input = parseInput(claimInspectionInput, req.body)
      const id = claim(req)
      await physical.inspect(
        actor(req),
        id,
        { items: input.items, reason: input.notes ?? 'Inspection recorded' },
        req.get('Idempotency-Key'),
      )
      respond(res, await history.adminDetail(actor(req), id))
    },
  )
  router.post(
    '/admin/claims/:claimId/complete',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      emptyQuery(req)
      const input = parseInput(claimCompleteInput, req.body),
        id = claim(req)
      await lifecycle.transition(
        actor(req),
        id,
        {
          to: 'completed',
          reason: input.reason ?? 'Claim inspection/review complete',
        },
        req.get('Idempotency-Key'),
      )
      respond(res, await history.adminDetail(actor(req), id))
    },
  )
  router.get(
    '/admin/claims/:claimId/evidence/:assetId',
    admin,
    http.require('admin'),
    async (req, res) => {
      emptyQuery(req)
      parseInput(z.undefined(), req.body)
      const p = parseInput(z.strictObject({ claimId, assetId: claimId }), req.params)
      respond(res, await adminEvidence(actor(req), p.claimId, p.assetId))
    },
  )
  return router
}

export { createReturnHistoryRoutes, createReturnRoutes }
