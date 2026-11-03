import express, { type RequestHandler, Router } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import type {
  BrowserSecurity,
  PaymentInitiationCredentials,
  SessionCookies,
  SessionHttp,
} from '../auth/auth.public.js'
import type { createPaymentInitiationService } from './attempts/payment-initiation.service.js'
import { paymentReturnForm, paymentReturnParams } from './collections/payment-callback.schema.js'
import type { createPaymentCallbackService } from './collections/payment-callback.service.js'
import type { createPaymentMatchingService } from './collections/payment-matching.service.js'
import type { createPaymentMonitorService } from './collections/payment-monitor.service.js'
import type { createPaymentRiskService } from './collections/payment-risk.service.js'
import {
  createPaymentCallbackController,
  createPaymentInitiationController,
  createPaymentMatchingController,
  createPaymentMethodsController,
  createPaymentMonitorController,
  createPaymentRiskController,
} from './payment.controller.js'
import type { createPaymentMethodsService } from './payment-methods.service.js'

function createPaymentCallbackRoutes(
  service: ReturnType<typeof createPaymentCallbackService>,
  throttle: RequestHandler,
) {
  const controller = createPaymentCallbackController(service)

  const router = Router({ caseSensitive: true, strict: true }),
    form = express.urlencoded({ extended: false, limit: 8192, parameterLimit: 64, inflate: false })
  const protection: RequestHandler = (_req, res, next) => {
    res.set('Referrer-Policy', 'no-referrer')
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    )
    next()
  }
  const parse: RequestHandler = (req, res, next) => {
    if (
      req.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/x-www-form-urlencoded'
    ) {
      void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
      return
    }
    form(req, res, (error?: unknown) => {
      if (error) {
        void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
        return
      }
      if (Object.values(req.body ?? {}).some((value) => typeof value !== 'string')) {
        void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
        return
      }
      next()
    })
  }
  router.post('/webhooks/sslcommerz/ipn', protection, throttle, parse, controller.postSslcommerzIpn)
  const redirect: RequestHandler = async (req, res) => {
    const result = paymentReturnParams.safeParse(req.params)
    if (
      !result.success ||
      req.originalUrl.length > 8192 ||
      (req.method === 'POST' && !paymentReturnForm.safeParse(req.body ?? {}).success)
    ) {
      await service.malformed()
      throw new ApiError('INVALID_REQUEST')
    }
    res.status(303).set('Location', service.redirect(result.data.result)).end()
  }
  router.post('/payment-returns/sslcommerz/:result', protection, throttle, parse, redirect)
  router.get(
    '/payment-returns/sslcommerz/:result',
    protection,
    throttle,
    controller.getPaymentReturnsSslcommerz,
  )
  return router
}

function createPaymentInitiationRoutes(
  service: ReturnType<typeof createPaymentInitiationService<PaymentInitiationCredentials>>,
  security: BrowserSecurity,
  throttle: RequestHandler,
  storefrontOrigin: string,
  cookies: SessionCookies,
) {
  const controller = createPaymentInitiationController(service, storefrontOrigin, cookies)

  const router = Router(),
    cors = security.cors('storefront')

  router.options('/orders/:orderId/payment-attempts', cors)
  router.options('/orders/:orderId/payment-attempts/:attemptId', cors)
  router.post(
    '/orders/:orderId/payment-attempts',
    cors,
    throttle,
    controller.postOrdersPaymentAttempts,
  )
  router.get(
    '/orders/:orderId/payment-attempts/:attemptId',
    cors,
    throttle,
    controller.getOrdersPaymentAttempts,
  )
  return router
}

function createPaymentMatchingRoutes(
  service: ReturnType<typeof createPaymentMatchingService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createPaymentMatchingController(service, sessionHttp)

  const router = Router(),
    cors = security.cors('admin'),
    current = sessionHttp.require('admin')
  const link = '/admin/provider-receipts/:intakeId/link',
    allocate = '/admin/payment-collections/:collectionId/allocate'
  for (const path of [link, allocate]) router.options(path, cors)
  router.post(
    link,
    cors,
    security.require('admin', 'admin'),
    current,
    controller.postProviderReceiptsLink,
  )
  router.post(
    allocate,
    cors,
    security.require('admin', 'admin'),
    current,
    controller.postPaymentCollectionsAllocate,
  )
  return router
}

function createPaymentMethodsRoutes(
  service: ReturnType<typeof createPaymentMethodsService>,
  origins: readonly string[],
  cookies: SessionCookies,
) {
  const controller = createPaymentMethodsController(service, cookies)

  const router = Router()
  const cors: RequestHandler = (req, res, next) => {
    res.vary('Origin')
    const origin = req.get('Origin')
    if (origin && !origins.includes(origin)) throw new ApiError('FORBIDDEN')
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin)
      res.set('Access-Control-Allow-Credentials', 'true')
    }
    if (req.method === 'OPTIONS') {
      const headers = (req.get('Access-Control-Request-Headers') ?? '')
        .split(',')
        .map((v) => v.trim().toLowerCase())
        .filter(Boolean)
      res.vary('Access-Control-Request-Headers')
      res.vary('Access-Control-Request-Method')
      if (
        !origin ||
        !['GET', 'HEAD'].includes(req.get('Access-Control-Request-Method') ?? '') ||
        headers.some((v) => v !== 'content-type')
      )
        throw new ApiError('FORBIDDEN')
      res.set('Access-Control-Allow-Methods', 'GET, HEAD')
      res.set('Access-Control-Allow-Headers', 'Content-Type')
      res.status(204).end()
      return
    }
    next()
  }
  router.options('/checkout/payment-methods', cors)
  router.get('/checkout/payment-methods', cors, controller.getCheckoutPaymentMethods)
  return router
}

function createPaymentMonitorRoutes(
  service: ReturnType<typeof createPaymentMonitorService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createPaymentMonitorController(service, sessionHttp)

  const router = Router(),
    http = sessionHttp,
    root = '/admin/payments',
    detail = `${root}/:paymentId`,
    reconcile = `${detail}/reconcile`
  for (const path of [root, detail, reconcile]) router.options(path, security.cors('admin'))
  router.get(root, security.cors('admin'), http.require('admin'), controller.getAdminPayments)
  router.get(detail, security.cors('admin'), http.require('admin'), controller.getPaymentDetail)
  router.post(
    reconcile,
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postAction,
  )
  router.options('/admin/provider-receipts', security.cors('admin'))
  router.get(
    '/admin/provider-receipts',
    security.cors('admin'),
    http.require('admin'),
    controller.getAdminProviderReceipts,
  )
  return router
}

function createPaymentRiskRoutes(
  service: ReturnType<typeof createPaymentRiskService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createPaymentRiskController(service, sessionHttp)

  const router = Router(),
    path = '/admin/payments/:paymentId/risk-decisions'
  router.options(path, security.cors('admin'))
  router.post(
    path,
    security.cors('admin'),
    security.require('admin', 'admin'),
    sessionHttp.require('admin'),
    controller.postPaymentsRiskDecisions,
  )
  return router
}

export {
  createPaymentCallbackRoutes,
  createPaymentInitiationRoutes,
  createPaymentMatchingRoutes,
  createPaymentMethodsRoutes,
  createPaymentMonitorRoutes,
  createPaymentRiskRoutes,
}
