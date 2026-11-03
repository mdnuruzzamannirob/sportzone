import { type RequestHandler, Router } from 'express'
import type { BrowserSecurity, SessionCookies, SessionHttp } from '../auth/auth.public.js'
import type { createRefundReservationService } from './obligations/refund-reservation.service.js'
import {
  createRefundController,
  createRefundHistoryController,
  createRefundRequestController,
} from './refund.controller.js'
import type { createRefundHistoryService } from './refund-history.service.js'

import type { createRefundOperationsService } from './refund-operations.service.js'

function createRefundHistoryRoutes(
  service: ReturnType<typeof createRefundHistoryService>,
  security: BrowserSecurity,
  cookies: SessionCookies,
) {
  const controller = createRefundHistoryController(service, cookies)

  const router = Router(),
    cors = security.cors('storefront')

  for (const path of ['/me/refunds', '/orders/:orderId/refunds', '/refunds/:refundId'])
    router.options(path, cors)
  router.get('/me/refunds', cors, controller.getMeRefunds)
  router.get('/orders/:orderId/refunds', cors, controller.getOrdersRefunds)
  router.get('/refunds/:refundId', cors, controller.getRefunds)
  return router
}

function createRefundRequestRoutes(
  service: Pick<ReturnType<typeof createRefundReservationService>, 'request'>,
  security: BrowserSecurity,
  throttle: RequestHandler,
  origin: string,
  cookies: SessionCookies,
) {
  const controller = createRefundRequestController(service, origin, cookies)

  const router = Router(),
    cors = security.cors('storefront'),
    path = '/orders/:orderId/refund-requests'
  router.options(path, cors)
  router.post(path, cors, throttle, controller.postOrdersRefundRequests)
  return router
}

function createRefundRoutes(
  service: ReturnType<typeof createRefundOperationsService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createRefundController(service, sessionHttp)

  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp

  for (const path of [
    '/admin/refunds',
    '/admin/refunds/:refundId',
    '/admin/refund-groups',
    '/admin/refunds/:refundId/payout-attempts',
    '/admin/refunds/:refundId/reconcile',
    '/admin/refunds/:refundId/manual-confirmations',
    '/admin/refunds/:refundId/review',
  ])
    router.options(path, cors)
  router.get('/admin/refunds', cors, http.require('admin'), controller.getAdminRefunds)
  router.get('/admin/refunds/:refundId', cors, http.require('admin'), controller.getAdminRefunds2)
  router.post(
    '/admin/refund-groups',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postAdminRefundGroups,
  )
  router.post(
    '/admin/refunds/:refundId/payout-attempts',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postRefundsPayoutAttempts,
  )
  for (const suffix of ['reconcile', 'manual-confirmations', 'review'] as const) {
    router.post(
      `/admin/refunds/:refundId/${suffix}`,
      cors,
      security.require('admin', 'admin'),
      http.require('admin'),
      controller.postAction(suffix),
    )
  }
  return router
}

export { createRefundHistoryRoutes, createRefundRequestRoutes, createRefundRoutes }
