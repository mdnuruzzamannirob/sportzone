import { Router, type RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../common/middleware/validation.js'
import { respond } from '../../common/responses.js'
import { readContextCookie, type BrowserSecurity } from './browser-security.js'
import { logoutProtection } from './customer-routes.js'
import { localAuthRateLimit } from './rate-limit.js'
import type { CustomerService } from './customer.js'
import type { RecoveryService } from './recovery.js'
import { createSessionHttp, readSessionCookie } from './session-http.js'
import type { SessionService } from './sessions.js'
export function adminRoutes(
  credentials: CustomerService,
  recovery: RecoveryService,
  security: BrowserSecurity,
  sessions: SessionService,
  limit: RequestHandler = localAuthRateLimit(),
) {
  const router = Router(),
    cookies = createSessionHttp(sessions),
    cors = security.cors('admin')
  const context = security.require('admin', 'context')
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  for (const path of [
    'login',
    'session',
    'logout',
    'password-resets',
    'password-resets/confirm',
  ])
    router.options(`/admin/auth/${path}`, cors)
  const material = (req: import('express').Request) => ({
    context: readContextCookie(req.get('Cookie'), 'admin') ?? '',
    csrf: req.get('X-CSRF-Token') ?? '',
  })
  router.post(
    '/admin/auth/login',
    cors,
    limit,
    context,
    noQuery,
    async (req, res) => {
      const input = material(req)
      const result = await credentials.login(
        req.body,
        input.context,
        input.csrf,
        readSessionCookie(req.get('Cookie'), 'admin'),
      )
      cookies.setCookie(res, result.issued)
      respond(res, {
        account: result.account,
        csrfToken: result.issued.csrfToken,
      })
    },
  )
  router.get(
    '/admin/auth/session',
    cors,
    cookies.require('admin'),
    noQuery,
    async (req, res) =>
      respond(
        res,
        await credentials.current(
          readSessionCookie(req.get('Cookie'), 'admin'),
        ),
      ),
  )
  router.post(
    '/admin/auth/logout',
    cors,
    limit,
    logoutProtection(security, 'admin', 'admin'),
    noQuery,
    async (req, res) => {
      parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
      await credentials.logout(readSessionCookie(req.get('Cookie'), 'admin'))
      const next = await security.issueContext(
        'admin',
        readContextCookie(req.get('Cookie'), 'admin'),
      )
      cookies.clearCookie(res, 'admin')
      security.setContextCookie(res, 'admin', next)
      respond(res, { revoked: true, csrfToken: next.csrfToken })
    },
  )
  for (const [path, action] of [
    ['password-resets', recovery.request],
    ['password-resets/confirm', recovery.confirm],
  ] as const)
    router.post(
      `/admin/auth/${path}`,
      cors,
      limit,
      context,
      noQuery,
      async (req, res) => {
        const input = material(req)
        respond(res, await action(req.body, input.context, input.csrf))
      },
    )
  return router
}
