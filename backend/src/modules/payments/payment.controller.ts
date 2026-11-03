import type { RequestHandler } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import { paymentReturnParams, paymentReturnForm } from './collections/payment-callback.schema.js'
import type { createPaymentCallbackService } from './collections/payment-callback.service.js'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { PaymentInitiationCredentials } from '../auth/checkout-access.service.js'
import type { createPaymentInitiationService } from './attempts/payment-initiation.service.js'
import {
  paymentInitiationParams,
  paymentAttemptParams,
  paymentAttemptStatus,
} from './attempts/payment-initiation.schema.js'
import type { createPaymentMatchingService } from './collections/payment-matching.service.js'
import { matchingId } from './collections/payment-matching.schema.js'
import type { createPaymentMethodsService } from './payment-methods.service.js'
import type { createPaymentMonitorService } from './collections/payment-monitor.service.js'
import { paymentRiskParams } from './collections/payment-risk.schema.js'
import type { createPaymentRiskService } from './collections/payment-risk.service.js'

function createPaymentCallbackController(service: ReturnType<typeof createPaymentCallbackService>) {
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
  const postSslcommerzIpn: RequestHandler = async (req, res) => {
    if (Object.keys(req.query).length) {
      await service.malformed()
      throw new ApiError('INVALID_REQUEST')
    }
    await service.receive(req.body)
    res.status(200).type('text/plain').send('OK')
  }
  const getPaymentReturnsSslcommerz: RequestHandler = async (req, res, next) => {
    if (
      req.headers['transfer-encoding'] !== undefined ||
      Number(req.headers['content-length'] ?? 0) > 0
    ) {
      await service.malformed()
      throw new ApiError('INVALID_REQUEST')
    }
    await redirect(req, res, next)
  }
  return { postSslcommerzIpn, getPaymentReturnsSslcommerz }
}

function createPaymentInitiationController(
  service: ReturnType<typeof createPaymentInitiationService<PaymentInitiationCredentials>>,
  storefrontOrigin: string,
) {
  const credentials = (req: import('express').Request): PaymentInitiationCredentials => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((part) => part.trim().startsWith('sz_customer_sid=')),
    customerToken: readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const postOrdersPaymentAttempts: RequestHandler = async (req, res) => {
    if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
    parseInput(z.strictObject({}), req.query)
    const { orderId } = parseInput(paymentInitiationParams, req.params)
    respond(
      res,
      await service.initiate(credentials(req), orderId, req.body, req.get('Idempotency-Key')),
    )
  }
  const getOrdersPaymentAttempts: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    parseInput(z.undefined(), req.body)
    const { orderId, attemptId } = parseInput(paymentAttemptParams, req.params)
    respond(
      res,
      parseInput(paymentAttemptStatus, await service.read(credentials(req), orderId, attemptId)),
    )
  }
  return { postOrdersPaymentAttempts, getOrdersPaymentAttempts }
}

function createPaymentMatchingController(service: ReturnType<typeof createPaymentMatchingService>) {
  const postProviderReceiptsLink: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { intakeId } = parseInput(z.strictObject({ intakeId: matchingId }), req.params)
    respond(
      res,
      await service.link(
        readSessionCookie(req.get('Cookie'), 'admin'),
        intakeId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  const postPaymentCollectionsAllocate: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { collectionId } = parseInput(z.strictObject({ collectionId: matchingId }), req.params)
    const result = await service.allocate(
      readSessionCookie(req.get('Cookie'), 'admin'),
      collectionId,
      req.body,
      req.get('Idempotency-Key'),
      req.get('If-Match'),
    )
    if (!result) throw new Error('Missing allocation result')
    res.set('ETag', `"${result.revision}"`)
    respond(res, result)
  }
  return { postProviderReceiptsLink, postPaymentCollectionsAllocate }
}

function createPaymentMethodsController(service: ReturnType<typeof createPaymentMethodsService>) {
  const getCheckoutPaymentMethods: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const cookie = req.get('Cookie')
    respond(
      res,
      await service.read(
        {
          customerPresent: (cookie ?? '')
            .split(';')
            .some((part) => part.trim().startsWith('sz_customer_sid=')),
          customerToken: readSessionCookie(cookie, 'customer'),
          guestToken: readGuestCookie(cookie),
        },
        req.query,
      ),
    )
  }
  return { getCheckoutPaymentMethods }
}

function createPaymentMonitorController(service: ReturnType<typeof createPaymentMonitorService>) {
  const getAdminPayments: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.params)
    const { pagination, ...data } = await service.list(
      readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, data, 200, pagination)
  }
  const getPaymentDetail: RequestHandler = async (req, res) => {
    const { paymentId } = parseInput(paymentRiskParams, req.params)
    respond(
      res,
      await service.detail(readSessionCookie(req.get('Cookie'), 'admin'), paymentId, req.query),
    )
  }
  const postAction: RequestHandler = async (req, res) => {
    const { paymentId } = parseInput(paymentRiskParams, req.params)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.reconcile(
        readSessionCookie(req.get('Cookie'), 'admin'),
        paymentId,
        req.body,
        req.get('Idempotency-Key'),
      ),
      202,
    )
  }
  const getAdminProviderReceipts: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.receipts(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  return { getAdminPayments, getPaymentDetail, postAction, getAdminProviderReceipts }
}

function createPaymentRiskController(service: ReturnType<typeof createPaymentRiskService>) {
  const postPaymentsRiskDecisions: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { paymentId } = parseInput(paymentRiskParams, req.params)
    respond(
      res,
      await service.decide(
        readSessionCookie(req.get('Cookie'), 'admin'),
        paymentId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return { postPaymentsRiskDecisions }
}

export {
  createPaymentCallbackController,
  createPaymentInitiationController,
  createPaymentMatchingController,
  createPaymentMethodsController,
  createPaymentMonitorController,
  createPaymentRiskController,
}
