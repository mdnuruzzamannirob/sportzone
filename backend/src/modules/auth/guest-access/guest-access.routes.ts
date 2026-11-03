import { type RequestHandler, Router } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { requireGuestCsrf } from '../sessions/browser-security.routes.js'
import { type BrowserSecurity, readContextCookie } from '../sessions/browser-security.service.js'
import { createGuestAccessController } from './guest-access.controller.js'
import type { createGuestAccessService } from './guest-access.service.js'
import type { GuestSessions } from './guest-session.service.js'

function createGuestAccessRoutes(
  service: ReturnType<typeof createGuestAccessService>,
  sessions: GuestSessions,
  security: BrowserSecurity,
  throttle: RequestHandler,
) {
  const controller = createGuestAccessController(service, sessions, security)

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
    controller.postGuestAccessChallenges,
  )
  router.post(
    '/guest-access/sessions',
    cors,
    throttle,
    security.require('storefront', 'context'),
    emptyQuery,
    controller.postGuestAccessSessions,
  )
  router.get('/guest-access/session', cors, throttle, emptyQuery, controller.getGuestAccessSession)
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
  router.post(
    '/guest-access/logout',
    cors,
    throttle,
    logoutGuard,
    emptyQuery,
    controller.postGuestAccessLogout,
  )
  return router
}

export { createGuestAccessRoutes }
