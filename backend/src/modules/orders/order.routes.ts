import { Router } from 'express'
import type { BrowserSecurity, SessionCookies, SessionHttp } from '../auth/auth.public.js'
import type { CodCollectionService } from '../payments/payment.public.js'

import type { createCancellationService } from './cancellation.service.js'
import type { createDeliveryExceptionService } from './delivery-exception.service.js'
import {
  createCancellationController,
  createDeliveryExceptionController,
  createOrderAdminController,
  createOrderReadController,
} from './order.controller.js'
import type { createOrderLifecycleService } from './order-lifecycle.service.js'
import type { createOrderReadService } from './order-read.service.js'

// Explicit local assembly only; all ownership/state/funding decisions stay in Orders services.
function createCancellationRoutes(
  service: ReturnType<typeof createCancellationService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
  storefrontOrigin: string,
) {
  const controller = createCancellationController(service, storefrontOrigin, sessionHttp)

  const router = Router(),
    customerCors = security.cors('storefront'),
    adminCors = security.cors('admin'),
    http = sessionHttp

  router.options('/orders/:orderId/cancellation-requests', customerCors)
  router.get(
    '/orders/:orderId/cancellation-requests',
    customerCors,
    controller.getOrdersCancellationRequests,
  )
  router.post(
    '/orders/:orderId/cancellation-requests',
    customerCors,
    controller.postOrdersCancellationRequests,
  )
  router.options('/admin/cancellation-requests', adminCors)
  router.get(
    '/admin/cancellation-requests',
    adminCors,
    http.require('admin'),
    controller.getAdminCancellationRequests,
  )
  router.options('/admin/cancellation-requests/:requestId/decision', adminCors)
  router.post(
    '/admin/cancellation-requests/:requestId/decision',
    adminCors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postCancellationRequestsDecision,
  )
  return router
}

function createOrderAdminRoutes(
  reads: Pick<ReturnType<typeof createOrderReadService>, 'adminRead' | 'adminList'>,
  lifecycle: ReturnType<typeof createOrderLifecycleService>,
  cash: CodCollectionService,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createOrderAdminController(reads, lifecycle, cash, sessionHttp)

  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp

  for (const path of [
    '/admin/orders',
    '/admin/orders/:orderId',
    '/admin/orders/:orderId/fulfillment-transitions',
    '/admin/payments/:paymentId/cod-collections',
  ])
    router.options(path, cors)
  router.get('/admin/orders', cors, http.require('admin'), controller.getAdminOrders)
  router.get('/admin/orders/:orderId', cors, http.require('admin'), controller.getAdminOrders2)
  router.post(
    '/admin/orders/:orderId/fulfillment-transitions',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postOrdersFulfillmentTransitions,
  )
  router.post(
    '/admin/payments/:paymentId/cod-collections',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postPaymentsCodCollections,
  )
  return router
}

function createOrderReadRoutes(
  service: Pick<
    ReturnType<typeof createOrderReadService>,
    'list' | 'read' | 'deliveryEvents' | 'payments'
  >,
  security: BrowserSecurity,
  cookies: SessionCookies,
) {
  const controller = createOrderReadController(service, cookies)

  const router = Router(),
    cors = security.cors('storefront')

  for (const path of [
    '/orders',
    '/orders/:orderId',
    '/orders/:orderId/status',
    '/orders/:orderId/delivery-events',
    '/orders/:orderId/payments',
  ])
    router.options(path, cors)
  router.get('/orders', cors, controller.getOrders)
  for (const [path, status] of [
    ['/orders/:orderId', false],
    ['/orders/:orderId/status', true],
  ] as const)
    router.get(path, cors, controller.getAction(status))
  for (const [path, method] of [
    ['/orders/:orderId/delivery-events', 'deliveryEvents'],
    ['/orders/:orderId/payments', 'payments'],
  ] as const)
    router.get(path, cors, controller.getOrderEvents(method))
  return router
}

function createDeliveryExceptionRoutes(
  service: ReturnType<typeof createDeliveryExceptionService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp,
    controller = createDeliveryExceptionController(service, sessionHttp)
  for (const path of [
    '/admin/orders/:orderId/delivery-exceptions',
    '/admin/delivery-exceptions/:exceptionId/resolve',
  ])
    router.options(path, cors)
  router.get(
    '/admin/orders/:orderId/delivery-exceptions',
    cors,
    http.require('admin'),
    controller.list,
  )
  router.post(
    '/admin/orders/:orderId/delivery-exceptions',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.create,
  )
  router.post(
    '/admin/delivery-exceptions/:exceptionId/resolve',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.resolve,
  )
  return router
}

export {
  createCancellationRoutes,
  createDeliveryExceptionRoutes,
  createOrderAdminRoutes,
  createOrderReadRoutes,
}
