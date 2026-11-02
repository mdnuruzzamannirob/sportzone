import { Router } from 'express'
import { z } from 'zod'
import type { couponPreviewService } from './coupon.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readContextCookie } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
export function couponPreviewRoutes(
  service: ReturnType<typeof couponPreviewService>,
  security: BrowserSecurity,
) {
  const router = Router(),
    cors = security.cors('storefront')
  router.options('/coupons/preview', cors)
  router.post(
    '/coupons/preview',
    cors,
    security.require('storefront', 'customer-or-context'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      const cookie = req.get('Cookie')
      respond(
        res,
        await service.preview(
          {
            customerPresent: (cookie ?? '')
              .split(';')
              .some((value) => value.trim().startsWith('sz_customer_sid=')),
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
