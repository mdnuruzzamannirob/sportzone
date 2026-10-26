import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readContextCookie } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import type { checkoutQuoteService } from './checkout-quote.service.js'
export function checkoutRoutes(
  service: Pick<ReturnType<typeof checkoutQuoteService>, 'create'>,
  security: BrowserSecurity,
  throttle: RequestHandler,
) {
  const router = Router()
  router.options('/checkout/quotes', security.cors('storefront'))
  router.post(
    '/checkout/quotes',
    security.cors('storefront'),
    throttle,
    security.require('storefront', 'customer-or-context'),
    async (req, res) => {
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
    },
  )
  return router
}
