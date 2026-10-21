import { Router, type RequestHandler } from 'express'
import { localAuthRateLimit } from './auth-throttle.service.js'
import { ApiError } from '../../common/errors.js'
import { respond } from '../../common/responses.js'
import { readSessionCookie } from './session.http.js'
import type { SessionService } from './session.service.js'
import { readContextCookie, type BrowserSecurity } from './browser-security.service.js'

// Guest persistence is owned by P06-015; this adapter must verify the exact order scope,
// expiry and revocation. Never substitute a customer/browser credential for a guest one.
export type GuestCsrfAdapter = {
  refresh(
    cookie: string | undefined,
  ): Promise<{ csrfToken: string; expiresAt: Date }>
  verify(cookie: string | undefined, csrf: string | undefined): Promise<boolean>
}
function guestToken(header: string | undefined) {
  const entries = (header ?? '')
    .split(';')
    .map((v) => v.trim())
    .filter((v) => v.startsWith('sz_guest_order_sid='))
  const token =
    entries.length === 1
      ? entries[0]?.slice('sz_guest_order_sid='.length)
      : undefined
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined
}
export function browserSecurityRoutes(
  security: BrowserSecurity,
  sessions: SessionService,
  guest?: GuestCsrfAdapter,
  limit: RequestHandler = localAuthRateLimit(Date.now, 60),
) {
  const router = Router()
  for (const audience of ['storefront', 'admin'] as const) {
    const path = audience === 'admin' ? '/admin/auth/csrf' : '/auth/csrf'
    router.options(path, security.cors(audience))
    router.head(path, security.cors(audience), (_req, res) => {
      res.status(204).end()
    })
    router.get(path, security.cors(audience), limit, async (req, res) => {
      // Bootstrap also requires Origin: no credential issuance from arbitrary embedding origins.
      // cors alone allows origin-less safe reads; require the header explicitly here.
      if (!req.get('Origin')) throw new ApiError('CSRF_INVALID')
      if (Object.keys(req.query).some((key) => key !== 'sessionKind'))
        throw new ApiError('INVALID_REQUEST')
      const selection = req.query.sessionKind
      if (
        selection !== undefined &&
        !['context', 'customer', 'guest'].includes(String(selection))
      )
        throw new ApiError('INVALID_REQUEST')
      if (selection !== undefined && typeof selection !== 'string')
        throw new ApiError('INVALID_REQUEST')
      if (
        audience === 'admin' &&
        selection !== undefined &&
        selection !== 'context'
      )
        throw new ApiError('INVALID_REQUEST')
      const kind = audience === 'admin' ? 'admin' : 'customer'
      const credential = readSessionCookie(req.get('Cookie'), kind)
      const hasSession = req
        .get('Cookie')
        ?.split(';')
        .some((part) => part.trim().startsWith(`sz_${kind}_sid=`))
      let issued: { csrfToken: string; expiresAt: Date }
      if (selection === 'guest') {
        const token = guestToken(req.get('Cookie'))
        if (!guest || !token) throw new ApiError('GUEST_PROOF_REQUIRED')
        issued = await guest.refresh(token)
      } else if (
        selection === 'customer' ||
        (selection !== 'context' && hasSession)
      ) {
        if (!credential) throw new ApiError('AUTH_REQUIRED')
        issued = await sessions.refreshCsrf(kind, credential)
      } else {
        const context = await security.issueContext(
          audience,
          readContextCookie(req.get('Cookie'), audience),
        )
        security.setContextCookie(res, audience, context)
        issued = context
      }
      res.setHeader('Cache-Control', 'no-store')
      respond(res, {
        csrfToken: issued.csrfToken,
        expiresAt: issued.expiresAt.toISOString(),
      })
    })
  }
  return router
}
export function requireGuestCsrf(
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
