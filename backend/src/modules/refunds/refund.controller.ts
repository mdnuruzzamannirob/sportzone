import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'
import type { createRefundReservationService } from './obligations/refund-reservation.service.js'
import type { createRefundHistoryService } from './refund-history.service.js'
import type { createRefundOperationsService } from './refund-operations.service.js'

function createRefundHistoryController(
  service: ReturnType<typeof createRefundHistoryService>,
  cookies: SessionCookies,
) {
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const credentials = (req: Request) => ({
    customerPresent: (req.get('Cookie') ?? '')
      .split(';')
      .some((p) => p.trim().startsWith('sz_customer_sid=')),
    customerToken: cookies.readSessionCookie(req.get('Cookie'), 'customer'),
    guestToken: cookies.readGuestCookie(req.get('Cookie')),
  })
  const getMeRefunds: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.mine(credentials(req), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const getOrdersRefunds: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const params = parseInput(z.strictObject({ orderId: id }), req.params)
    respond(res, await service.list(credentials(req), params.orderId))
  }
  const getRefunds: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.query)
    const params = parseInput(z.strictObject({ refundId: id }), req.params)
    respond(res, await service.detail(credentials(req), params.refundId))
  }
  return { getMeRefunds, getOrdersRefunds, getRefunds }
}

function createRefundRequestController(
  service: Pick<ReturnType<typeof createRefundReservationService>, 'request'>,
  origin: string,
  cookies: SessionCookies,
) {
  const postOrdersRefundRequests: RequestHandler = async (req, res) => {
    if (req.get('Origin') !== origin) throw new ApiError('CSRF_INVALID')
    parseInput(z.strictObject({}), req.query)
    const { orderId } = parseInput(
      z.strictObject({ orderId: z.string().regex(/^[a-f0-9]{24}$/) }),
      req.params,
    )
    const cookie = req.get('Cookie')
    respond(
      res,
      await service.request(
        {
          customerPresent: (cookie ?? '')
            .split(';')
            .some((value) => value.trim().startsWith('sz_customer_sid=')),
          customerToken: cookies.readSessionCookie(cookie, 'customer'),
          guestToken: cookies.readGuestCookie(cookie),
          csrfToken: req.get('X-CSRF-Token'),
        },
        orderId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return { postOrdersRefundRequests }
}

function createRefundController(
  service: ReturnType<typeof createRefundOperationsService>,
  cookies: SessionCookies,
) {
  const token = (cookie: string | undefined) => cookies.readSessionCookie(cookie, 'admin')
  const params = z.strictObject({
    refundId: z.string().regex(/^[a-f0-9]{24}$/),
  })
  const getAdminRefunds: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(token(req.get('Cookie')), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const getAdminRefunds2: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    parseInput(z.undefined(), req.body)
    respond(
      res,
      await service.detail(token(req.get('Cookie')), parseInput(params, req.params).refundId),
    )
  }
  const postAdminRefundGroups: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.group(token(req.get('Cookie')), req.body, req.get('Idempotency-Key')),
      201,
    )
  }
  const postRefundsPayoutAttempts: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.payout(
        token(req.get('Cookie')),
        parseInput(params, req.params).refundId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  const postAction =
    (suffix: 'reconcile' | 'manual-confirmations' | 'review'): RequestHandler =>
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await (suffix === 'reconcile'
          ? service.reconcile(
              token(req.get('Cookie')),
              parseInput(params, req.params).refundId,
              req.body,
              req.get('Idempotency-Key'),
            )
          : suffix === 'manual-confirmations'
            ? service.confirmManual(
                token(req.get('Cookie')),
                parseInput(params, req.params).refundId,
                req.body,
                req.get('Idempotency-Key'),
              )
            : service.review(
                token(req.get('Cookie')),
                parseInput(params, req.params).refundId,
                req.body,
                req.get('Idempotency-Key'),
              )),
      )
    }
  return {
    getAdminRefunds,
    getAdminRefunds2,
    postAdminRefundGroups,
    postRefundsPayoutAttempts,
    postAction,
  }
}

export { createRefundController, createRefundHistoryController, createRefundRequestController }
