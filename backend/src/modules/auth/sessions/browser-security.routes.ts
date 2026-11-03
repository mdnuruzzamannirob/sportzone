import { createBrowserSecurityController } from './browser-security.controller.js'
import { Router, type RequestHandler } from 'express'
import { localAuthRateLimit } from './auth-throttle.service.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { SessionService } from './session.service.js'
import type { BrowserSecurity } from './browser-security.service.js'

// Guest persistence is owned by P06-015; this adapter must verify the exact order scope,
// expiry and revocation. Never substitute a customer/browser credential for a guest one.
type GuestCsrfAdapter = {
  refresh(cookie: string | undefined): Promise<{
    csrfToken: string
    expiresAt: Date
  }>
  verify(cookie: string | undefined, csrf: string | undefined): Promise<boolean>
}

function guestToken(header: string | undefined) {
  const entries = (header ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith('sz_guest_order_sid='))
  const token = entries.length === 1 ? entries[0]?.slice('sz_guest_order_sid='.length) : undefined
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined
}

function createBrowserSecurityRoutes(
  security: BrowserSecurity,
  sessions: SessionService,
  guest?: GuestCsrfAdapter,
  limit: RequestHandler = localAuthRateLimit(Date.now, 60),
) {
  const controller = createBrowserSecurityController(security, sessions, guest)

  const router = Router()
  for (const audience of ['storefront', 'admin'] as const) {
    const path = audience === 'admin' ? '/admin/auth/csrf' : '/auth/csrf'
    router.options(path, security.cors(audience))
    router.head(path, security.cors(audience), controller.headAction)
    router.get(path, security.cors(audience), limit, controller.getAction(audience))
  }
  return router
}

function requireGuestCsrf(
  security: BrowserSecurity,
  guest: GuestCsrfAdapter,
): import('express').RequestHandler {
  const originGuard = security.cors('storefront')
  return (req, res, next) => {
    originGuard(req, res, (error?: unknown) => {
      if (error) {
        next(error)
        return
      }
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        next()
        return
      }
      if (!req.get('Origin')) {
        next(new ApiError('CSRF_INVALID'))
        return
      }
      const token = guestToken(req.get('Cookie'))
      const csrf = req.get('X-CSRF-Token')
      if (!token || !csrf || !/^[A-Za-z0-9_-]{43}$/.test(csrf)) {
        next(new ApiError('CSRF_INVALID'))
        return
      }
      void guest.verify(token, csrf).then((valid) => {
        next(valid ? undefined : new ApiError('CSRF_INVALID'))
      }, next)
    })
  }
}

export { createBrowserSecurityRoutes, requireGuestCsrf }
export type { GuestCsrfAdapter }
