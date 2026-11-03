import type { RequestHandler } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import type { createCheckoutIntentService, createCheckoutQuoteService } from './checkout.service.js'
import { checkoutSubmitInput } from './checkout.schema.js'
import { checkoutSubmitResult } from './checkout-intent.schema.js'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readContextCookie } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'

function createCheckoutController(
  service: Pick<ReturnType<typeof createCheckoutQuoteService>, 'create'>,
) {
  const postCheckoutQuotes: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    const cookie = req.get('Cookie')
    const customerPresent = (cookie ?? '')
      .split(';')
      .some((value) => value.trim().startsWith('sz_customer_sid='))
    respond(
      res,
      await service.create(
        {
          customerPresent,
          customerToken: readSessionCookie(cookie, 'customer'),
          contextToken: readContextCookie(cookie, 'storefront'),
          csrfToken: req.get('X-CSRF-Token'),
        },
        req.body,
      ),
    )
  }
  const postCheckoutOrders =
    (
      submission: Pick<ReturnType<typeof createCheckoutIntentService>, 'submitWithOutcome'>,
    ): RequestHandler =>
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const input = parseInput(checkoutSubmitInput, req.body)
      // Online submission is activated by its owning payment integration, never by this COD flag.
      if (input.method !== 'cod') throw new ApiError('BUSINESS_RULE_VIOLATION')
      const cookie = req.get('Cookie'),
        customerPresent = (cookie ?? '')
          .split(';')
          .some((value) => value.trim().startsWith('sz_customer_sid='))
      const result = await submission.submitWithOutcome(
        {
          customerPresent,
          customerToken: readSessionCookie(cookie, 'customer'),
          contextToken: readContextCookie(cookie, 'storefront'),
          csrfToken: req.get('X-CSRF-Token'),
        },
        input,
        req.get('Idempotency-Key'),
      )
      const {
        id,
        orderNumber,
        fulfillmentStatus,
        paymentStatus,
        finalTotalPoisha,
        currency,
        placedAt,
        fulfillmentHold,
      } = result.order
      respond(
        res,
        parseInput(checkoutSubmitResult, {
          order: {
            id,
            orderNumber,
            fulfillmentStatus,
            paymentStatus,
            finalTotalPoisha,
            currency,
            placedAt,
            ...(fulfillmentHold ? { fulfillmentHold } : {}),
          },
        }),
        result.replayed ? 200 : 201,
      )
    }
  return { postCheckoutQuotes, postCheckoutOrders }
}

export { createCheckoutController }
