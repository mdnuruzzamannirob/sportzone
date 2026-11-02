import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { refundReservationService } from './refund-reservation.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { ApiError } from '../../shared/errors/app-error.js'
export function refundRequestRoutes(
  service: Pick<ReturnType<typeof refundReservationService>, 'request'>,
  security: BrowserSecurity,
  throttle: RequestHandler,
  origin: string,
) {
  const router = Router(),
    cors = security.cors('storefront'),
    path = '/orders/:orderId/refund-requests'
  router.options(path, cors)
  router.post(path, cors, throttle, async (req, res) => {
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
          customerToken: readSessionCookie(cookie, 'customer'),
          guestToken: readGuestCookie(cookie),
          csrfToken: req.get('X-CSRF-Token'),
        },
        orderId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  })
  return router
}
