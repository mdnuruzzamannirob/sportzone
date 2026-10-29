import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { readGuestCookie } from '../auth/guest-access/guest-session.service.js'
import type { paymentMethodsService } from './payment-methods.service.js'
export function paymentMethodsRoutes(
  service: ReturnType<typeof paymentMethodsService>,
  origins: readonly string[],
) {
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
  router.get('/checkout/payment-methods', cors, async (req, res) => {
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
  })
  return router
}
