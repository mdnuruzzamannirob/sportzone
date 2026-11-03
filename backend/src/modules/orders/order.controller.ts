import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { resourceId as orderId } from '../../shared/validation.js'
import type { SessionCookies } from '../auth/auth.public.js'
import type { CodCollectionService } from '../payments/payment.public.js'

import type { createCancellationService } from './cancellation.service.js'
import type { createDeliveryExceptionService } from './delivery-exception.service.js'

import type { createOrderLifecycleService } from './order-lifecycle.service.js'
import type { createOrderReadService } from './order-read.service.js'

function createCancellationController(
  service: ReturnType<typeof createCancellationService>,
  storefrontOrigin: string,
  cookies: SessionCookies,
) {
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: cookies.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: cookies.readGuestCookie(req.get('Cookie')),
    csrfToken: req.get('X-CSRF-Token'),
  })
  const params = z.strictObject({ orderId })
  const getOrdersCancellationRequests: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(res, await service.list(credentials(req), parseInput(params, req.params).orderId))
  }
  const postOrdersCancellationRequests: RequestHandler = async (req, res) => {
    if (req.get('Origin') !== storefrontOrigin) throw new ApiError('CSRF_INVALID')
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.request(
        credentials(req),
        parseInput(params, req.params).orderId,
        req.body,
        req.get('Idempotency-Key'),
      ),
      201,
    )
  }
  const getAdminCancellationRequests: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.adminList(
      cookies.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  const postCancellationRequestsDecision: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const id = parseInput(z.strictObject({ requestId: orderId }), req.params).requestId
    respond(
      res,
      await service.decide(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        id,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return {
    getOrdersCancellationRequests,
    postOrdersCancellationRequests,
    getAdminCancellationRequests,
    postCancellationRequestsDecision,
  }
}

function createOrderAdminController(
  reads: Pick<ReturnType<typeof createOrderReadService>, 'adminRead' | 'adminList'>,
  lifecycle: ReturnType<typeof createOrderLifecycleService>,
  cash: CodCollectionService,
  cookies: SessionCookies,
) {
  const token = (cookie: string | undefined) => cookies.readSessionCookie(cookie, 'admin')
  const getAdminOrders: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await reads.adminList(token(req.get('Cookie')), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const getAdminOrders2: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const { orderId: id } = parseInput(z.strictObject({ orderId }), req.params)
    respond(res, await reads.adminRead(token(req.get('Cookie')), id))
  }
  const postOrdersFulfillmentTransitions: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { orderId: id } = parseInput(z.strictObject({ orderId }), req.params)
    await lifecycle.transition(token(req.get('Cookie')), id, req.body, req.get('Idempotency-Key'))
    respond(res, await reads.adminRead(token(req.get('Cookie')), id))
  }
  const postPaymentsCodCollections: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const { paymentId } = parseInput(z.strictObject({ paymentId: orderId }), req.params)
    respond(
      res,
      await cash.collect(token(req.get('Cookie')), paymentId, req.body, req.get('Idempotency-Key')),
    )
  }
  return {
    getAdminOrders,
    getAdminOrders2,
    postOrdersFulfillmentTransitions,
    postPaymentsCodCollections,
  }
}

function createOrderReadController(
  service: Pick<
    ReturnType<typeof createOrderReadService>,
    'list' | 'read' | 'deliveryEvents' | 'payments'
  >,
  cookies: SessionCookies,
) {
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: cookies.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: cookies.readGuestCookie(req.get('Cookie')),
  })
  const getOrders: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.params)
    const { items, pagination } = await service.list(
      cookies.readSessionCookie(req.get('Cookie'), 'customer'),
      req.query,
    )
    respond(res, items, 200, pagination)
  }
  const getAction =
    (status: boolean): RequestHandler =>
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.query)
      const params = parseInput(z.strictObject({ orderId }), req.params)
      respond(res, await service.read(credentials(req), params.orderId, status))
    }
  const getOrderEvents =
    (method: 'deliveryEvents' | 'payments'): RequestHandler =>
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.query)
      const params = parseInput(z.strictObject({ orderId }), req.params)
      respond(res, await service[method](credentials(req), params.orderId))
    }
  return { getOrders, getAction, getOrderEvents }
}

function createDeliveryExceptionController(
  service: ReturnType<typeof createDeliveryExceptionService>,
  cookies: SessionCookies,
) {
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const list: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.list(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ orderId: id }), req.params).orderId,
      ),
    )
  }
  const create: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.create(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ orderId: id }), req.params).orderId,
        req.body,
        req.get('Idempotency-Key'),
      ),
      201,
    )
  }
  const resolve: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.resolve(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ exceptionId: id }), req.params).exceptionId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return { list, create, resolve }
}

export {
  createCancellationController,
  createDeliveryExceptionController,
  createOrderAdminController,
  createOrderReadController,
}
