import { createSupportReadController, createSupportController } from './support.controller.js'
import { Router, type Request } from 'express'
import {
  type BrowserSecurity,
  readContextCookie,
} from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { createComplaintService } from './support.service.js'
import { ApiError } from '../../shared/errors/app-error.js'
import type { CustomerAccountAccess } from '../auth/auth.public.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { createAuthThrottle } from '../auth/sessions/auth-throttle.service.js'

// Local/test composition only. Other support mutations and operational queues remain gated.
function createSupportReadRoutes(
  complaints: Pick<ReturnType<typeof createComplaintService>, 'adminList'>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const controller = createSupportReadController(complaints)

  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  for (const path of ['/admin/complaints']) router.options(path, cors)
  router.get('/admin/complaints', cors, http.require('admin'), controller.getAdminComplaints)

  return router
}

function createSupportRoutes(
  deps: {
    complaints: ReturnType<typeof createComplaintService>
    customers: CustomerAccountAccess
  },
  security: BrowserSecurity,
  sessions: SessionService,
  throttle: ReturnType<typeof createAuthThrottle>,
  storefrontOrigin: string,
) {
  const controller = createSupportController(deps)

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
    controller.postComplaints,
  )
  router.get('/me/complaints', cors, http.require('customer'), controller.getMeComplaints)
  router.get('/orders/:orderId/complaints', cors, controller.getOrdersComplaints)
  router.options('/admin/complaints/:complaintId', adminCors)
  router.get(
    '/admin/complaints/:complaintId',
    adminCors,
    http.require('admin'),
    controller.getAdminComplaints,
  )
  const paths = ['/admin/complaints/:complaintId/resolve'] as const
  for (const path of paths) router.options(path, adminCors)
  router.post(
    paths[0],
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postComplaintsResolve,
  )

  return router
}

export { createSupportReadRoutes, createSupportRoutes }
