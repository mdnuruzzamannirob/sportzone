import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import type { guestAccessService } from './guest-access.service.js'
import type { GuestSessions } from './guest-session.service.js'
import { readGuestCookie } from './guest-session.service.js'
import {
  guestAccepted,
  guestExchangeView,
  guestSessionView,
  guestLogoutView,
} from './guest-access.schema.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { readContextCookie } from '../sessions/browser-security.service.js'
import { requireGuestCsrf } from '../sessions/browser-security.routes.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
export function guestAccessRoutes(
  service: ReturnType<typeof guestAccessService>,
  sessions: GuestSessions,
  security: BrowserSecurity,
  throttle: RequestHandler,
) {
  const router = Router(),
    cors = security.cors('storefront')
  const emptyQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of [
    '/guest-access/challenges',
    '/guest-access/sessions',
    '/guest-access/session',
    '/guest-access/logout',
  ])
    router.options(path, cors)
  router.post(
    '/guest-access/challenges',
    cors,
    throttle,
    security.require('storefront', 'context'),
    emptyQuery,
    async (req, res) => {
      respond(
        res,
        parseInput(
          guestAccepted,
          await service.request(
            req.body,
            readContextCookie(req.get('Cookie'), 'storefront') ?? '',
            req.get('X-CSRF-Token') ?? '',
          ),
        ),
      )
    },
  )
  router.post(
    '/guest-access/sessions',
    cors,
    throttle,
    security.require('storefront', 'context'),
    emptyQuery,
    async (req, res) => {
      const result = await service.exchange(
        req.body,
        readContextCookie(req.get('Cookie'), 'storefront') ?? '',
        req.get('X-CSRF-Token') ?? '',
        readGuestCookie(req.get('Cookie')),
      )
      res.cookie('sz_guest_order_sid', result.token, {
        ...sessions.cookiePolicy,
        expires: result.expiresAt,
        maxAge: Math.max(0, result.expiresAt.getTime() - Date.now()),
      })
      respond(
        res,
        parseInput(guestExchangeView, {
          orderId: result.orderId,
          expiresAt: result.expiresAt.toISOString(),
          csrfToken: result.csrfToken,
        }),
      )
    },
  )
  router.get('/guest-access/session', cors, throttle, emptyQuery, async (req, res) => {
    respond(
      res,
      await sessions.owned(readGuestCookie(req.get('Cookie')), undefined, async (scope) =>
        parseInput(guestSessionView, {
          orderId: scope.orderId,
          expiresAt: scope.expiresAt.toISOString(),
        }),
      ),
    )
  })
  const guestGuard = requireGuestCsrf(security, sessions)
  const logoutGuard: RequestHandler = async (req, res, next) => {
    if (
      await security.verifyContext(
        'storefront',
        readContextCookie(req.get('Cookie'), 'storefront'),
        req.get('X-CSRF-Token'),
      )
    )
      await security.require('storefront', 'context')(req, res, next)
    else await guestGuard(req, res, next)
  }
  router.post('/guest-access/logout', cors, throttle, logoutGuard, emptyQuery, async (req, res) => {
    parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
    await sessions.logout(readGuestCookie(req.get('Cookie')))
    const context = await security.issueContext(
      'storefront',
      readContextCookie(req.get('Cookie'), 'storefront'),
    )
    res.clearCookie('sz_guest_order_sid', sessions.cookiePolicy)
    security.setContextCookie(res, 'storefront', context)
    respond(res, parseInput(guestLogoutView, { revoked: true, csrfToken: context.csrfToken }))
  })
  return router
}
