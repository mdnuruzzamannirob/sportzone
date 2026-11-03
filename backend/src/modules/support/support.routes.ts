import { Router, type Request } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { CustomerAccountAccess } from '../auth/auth.public.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { createAuthThrottle } from '../auth/sessions/auth-throttle.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readContextCookie } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { notificationAdminService } from '../notifications/notification-admin.service.js'
import type { deliveryExceptionService } from '../orders/delivery-exception.service.js'
import type { complaintService } from './complaint.service.js'

export function supportRoutes(
  deps: {
    complaints: ReturnType<typeof complaintService>
    exceptions: ReturnType<typeof deliveryExceptionService>
    notifications: ReturnType<typeof notificationAdminService>
    customers: CustomerAccountAccess
  },
  security: BrowserSecurity,
  sessions: SessionService,
  throttle: ReturnType<typeof createAuthThrottle>,
  storefrontOrigin: string,
) {
  const router = Router(),
    cors = security.cors('storefront'),
    adminCors = security.cors('admin'),
    http = createSessionHttp(sessions),
    id = z.string().regex(/^[a-f0-9]{24}$/)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    guestPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('sz_guest_order_sid=')),
    contextToken: readContextCookie(req.get('Cookie'), 'storefront'),
    csrfToken: req.get('X-CSRF-Token'),
  })
  for (const path of ['/complaints', '/me/complaints', '/orders/:orderId/complaints'])
    router.options(path, cors)
  router.post(
    '/complaints',
    cors,
    throttle.middleware('customer', 'complaint'),
    async (req, res, next) => {
      if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
      const creds = credentials(req)
      if (creds.customerPresent || (!req.body?.orderId && !creds.guestPresent))
        return security.require('storefront', 'customer-or-context')(req, res, next)
      next()
    },
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.complaints.intake(credentials(req), req.body, req.get('Idempotency-Key')),
        201,
      )
    },
  )
  router.get('/me/complaints', cors, http.require('customer'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await deps.complaints.mine(
      readSessionCookie(req.get('Cookie'), 'customer'),
      req.query,
      deps.customers,
    )
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/orders/:orderId/complaints', cors, async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.complaints.list(
        credentials(req),
        parseInput(z.strictObject({ orderId: id }), req.params).orderId,
      ),
    )
  })
  router.options('/admin/complaints/:complaintId', adminCors)
  router.get(
    '/admin/complaints/:complaintId',
    adminCors,
    http.require('admin'),
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.complaints.adminDetail(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(z.strictObject({ complaintId: id }), req.params).complaintId,
        ),
      )
    },
  )
  const paths = [
    '/admin/complaints/:complaintId/resolve',
    '/admin/orders/:orderId/delivery-exceptions',
    '/admin/delivery-exceptions/:exceptionId/resolve',
    '/admin/notifications',
    '/admin/notifications/:notificationId/retry',
  ] as const
  for (const path of paths) router.options(path, adminCors)
  router.post(
    paths[0],
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.complaints.resolve(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(z.strictObject({ complaintId: id }), req.params).complaintId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  router.get(paths[1], adminCors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await deps.exceptions.list(
        readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ orderId: id }), req.params).orderId,
      ),
    )
  })
  router.post(
    paths[1],
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.exceptions.create(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(z.strictObject({ orderId: id }), req.params).orderId,
          req.body,
          req.get('Idempotency-Key'),
        ),
        201,
      )
    },
  )
  router.post(
    paths[2],
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.exceptions.resolve(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(z.strictObject({ exceptionId: id }), req.params).exceptionId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  router.get(paths[3], adminCors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await deps.notifications.list(
      readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  })
  router.post(
    paths[4],
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await deps.notifications.retry(
          readSessionCookie(req.get('Cookie'), 'admin'),
          parseInput(z.strictObject({ notificationId: id }), req.params).notificationId,
          req.body,
          req.get('Idempotency-Key'),
        ),
      )
    },
  )
  return router
}
