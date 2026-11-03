import { type RequestHandler, Router } from 'express'
import type { BrowserSecurity, SessionCookies } from '../auth/auth.public.js'
import { createCheckoutController } from './checkout.controller.js'
import type { createCheckoutIntentService, createCheckoutQuoteService } from './checkout.service.js'

function createCheckoutRoutes(
  service: Pick<ReturnType<typeof createCheckoutQuoteService>, 'create'>,
  security: BrowserSecurity,
  throttle: RequestHandler,
  submission: Pick<ReturnType<typeof createCheckoutIntentService>, 'submitWithOutcome'> | undefined,
  cookies: SessionCookies,
) {
  const controller = createCheckoutController(service, cookies)

  const router = Router()
  router.options('/checkout/quotes', security.cors('storefront'))
  router.post(
    '/checkout/quotes',
    security.cors('storefront'),
    throttle,
    security.require('storefront', 'customer-or-context'),
    controller.postCheckoutQuotes,
  )
  if (submission) {
    router.options('/checkout/orders', security.cors('storefront'))
    router.post(
      '/checkout/orders',
      security.cors('storefront'),
      throttle,
      security.require('storefront', 'customer-or-context'),
      controller.postCheckoutOrders(submission),
    )
  }
  return router
}

export { createCheckoutRoutes }
