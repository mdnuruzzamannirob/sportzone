import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { PaymentInitiationCredentials } from '../auth/checkout-access.service.js'
import type { paymentInitiationService } from './payment-initiation.service.js'
import {
  paymentInitiationParams,
  paymentAttemptParams,
  paymentAttemptStatus,
} from './payment-initiation.schema.js'
export function paymentInitiationRoutes(
  service: ReturnType<typeof paymentInitiationService<PaymentInitiationCredentials>>,
  security: BrowserSecurity,
  throttle: RequestHandler,
  storefrontOrigin: string,
) {
  const router = Router(),
    cors = security.cors('storefront')
  const credentials = (req: import('express').Request): PaymentInitiationCredentials => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  router.options('/orders/:orderId/payment-attempts', cors)
  router.options('/orders/:orderId/payment-attempts/:attemptId', cors)
  router.post('/orders/:orderId/payment-attempts', cors, throttle, async (req, res) => {
    if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
    parseInput(z.strictObject({}), req.query)
    const { orderId } = parseInput(paymentInitiationParams, req.params)
    respond(
      res,
      await service.initiate(credentials(req), orderId, req.body, req.get('Idempotency-Key')),
    )
  })
  router.get('/orders/:orderId/payment-attempts/:attemptId', cors, throttle, async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    parseInput(z.undefined(), req.body)
    const { orderId, attemptId } = parseInput(paymentAttemptParams, req.params)
    respond(
      res,
      parseInput(paymentAttemptStatus, await service.read(credentials(req), orderId, attemptId)),
    )
  })
  return router
}
