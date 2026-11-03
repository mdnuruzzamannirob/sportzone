import { type RequestHandler, Router } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import type { ClaimEvidenceMultipart } from '../media/media.public.js'
import { createReturnController, createReturnHistoryController } from './return.controller.js'
import type {
  createReturnHistoryService,
  createReturnLifecycleService,
  createReturnOperationsService,
  createReturnPhysicalService,
} from './return.service.js'

// Shared current-session reads; root composition owns environment admission.
function createReturnHistoryRoutes(
  service: ReturnType<typeof createReturnHistoryService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createReturnHistoryController(service, sessionHttp)

  const router = Router(),
    cors = security.cors('storefront'),
    adminCors = security.cors('admin'),
    http = sessionHttp

  for (const path of ['/me/claims', '/orders/:orderId/claims', '/claims/:claimId'])
    router.options(path, cors)
  for (const path of ['/admin/claims', '/admin/claims/:claimId']) router.options(path, adminCors)
  router.get('/me/claims', cors, controller.getMeClaims)
  router.get('/admin/claims', adminCors, http.require('admin'), controller.getAdminClaims)
  router.get('/admin/claims/:claimId', adminCors, http.require('admin'), controller.getAdminClaim)
  router.get('/orders/:orderId/claims', cors, controller.getOrdersClaims)
  router.get('/claims/:claimId', cors, controller.getClaims)
  return router
}

function createReturnRoutes(
  operations: ReturnType<typeof createReturnOperationsService>,
  lifecycle: ReturnType<typeof createReturnLifecycleService>,
  physical: ReturnType<typeof createReturnPhysicalService>,
  history: ReturnType<typeof createReturnHistoryService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
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
  claimEvidenceMultipart: ClaimEvidenceMultipart,
) {
  const controller = createReturnController(
    operations,
    lifecycle,
    physical,
    history,
    sessionHttp,
    maxBytes,
    adminEvidence,
    claimEvidenceMultipart,
  )

  const router = Router(),
    customer = security.cors('storefront'),
    admin = security.cors('admin'),
    http = sessionHttp

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
  router.get('/orders/:orderId/claim-eligibility', customer, controller.getOrdersClaimEligibility)
  router.post('/orders/:orderId/claims', customer, customerMutation, controller.postOrdersClaims)
  router.post(
    '/orders/:orderId/claims/evidence-uploads',
    customer,
    customerMutation,
    async (req, _res, next) => {
      await operations.authorize(controller.readCredentials(req), controller.parseOrderId(req))
      next()
    },
    uploadThrottle,
    controller.postClaimsEvidenceUploads,
  )
  router.get('/orders/:orderId/claims/evidence/:assetId', customer, controller.getClaimsEvidence)
  for (const path of [
    '/admin/claims/:claimId/review',
    '/admin/claims/:claimId/receipt',
    '/admin/claims/:claimId/inspection',
    '/admin/claims/:claimId/complete',
    '/admin/claims/:claimId/evidence/:assetId',
  ])
    router.options(path, admin)

  router.post(
    '/admin/claims/:claimId/review',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postClaimsReview,
  )
  router.post(
    '/admin/claims/:claimId/receipt',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postClaimsReceipt,
  )
  router.post(
    '/admin/claims/:claimId/inspection',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postClaimsInspection,
  )
  router.post(
    '/admin/claims/:claimId/complete',
    admin,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postClaimsComplete,
  )
  router.get(
    '/admin/claims/:claimId/evidence/:assetId',
    admin,
    http.require('admin'),
    controller.getAdminClaimEvidence,
  )
  return router
}

export { createReturnHistoryRoutes, createReturnRoutes }
