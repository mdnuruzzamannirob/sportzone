import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import { type BrowserSecurity, readContextCookie } from '../sessions/browser-security.service.js'
import {
  guestAccepted,
  guestExchangeView,
  guestLogoutView,
  guestSessionView,
} from './guest-access.schema.js'
import type { createGuestAccessService } from './guest-access.service.js'
import { type GuestSessions, readGuestCookie } from './guest-session.service.js'

function createGuestAccessController(
  service: ReturnType<typeof createGuestAccessService>,
  sessions: GuestSessions,
  security: BrowserSecurity,
) {
  const postGuestAccessChallenges: RequestHandler = async (req, res) => {
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
  }
  const postGuestAccessSessions: RequestHandler = async (req, res) => {
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
  }
  const getGuestAccessSession: RequestHandler = async (req, res) => {
    respond(
      res,
      await sessions.owned(readGuestCookie(req.get('Cookie')), undefined, async (scope) =>
        parseInput(guestSessionView, {
          orderId: scope.orderId,
          expiresAt: scope.expiresAt.toISOString(),
        }),
      ),
    )
  }
  const postGuestAccessLogout: RequestHandler = async (req, res) => {
    parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
    await sessions.logout(readGuestCookie(req.get('Cookie')))
    const context = await security.issueContext(
      'storefront',
      readContextCookie(req.get('Cookie'), 'storefront'),
    )
    res.clearCookie('sz_guest_order_sid', sessions.cookiePolicy)
    security.setContextCookie(res, 'storefront', context)
    respond(res, parseInput(guestLogoutView, { revoked: true, csrfToken: context.csrfToken }))
  }
  return {
    postGuestAccessChallenges,
    postGuestAccessSessions,
    getGuestAccessSession,
    postGuestAccessLogout,
  }
}

export { createGuestAccessController }
