import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import { readContextCookie, type BrowserSecurity } from '../sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../sessions/session.http.js'
import type { SessionKind, SessionService } from '../sessions/session.service.js'
import type { CustomerService } from './credentials.service.js'

function credentialsController(
  service: CustomerService,
  security: BrowserSecurity,
  sessions: SessionService,
  kind: SessionKind = 'customer',
) {
  const audience = kind === 'admin' ? 'admin' : 'storefront'
  const cookies = createSessionHttp(sessions)
  const register: RequestHandler = async (req, res) => {
    const result = await service.register(
      req.body,
      readContextCookie(req.get('Cookie'), audience) ?? '',
      req.get('X-CSRF-Token') ?? '',
    )
    respond(res, result, 201)
  }
  const login: RequestHandler = async (req, res) => {
    const result = await service.login(
      req.body,
      readContextCookie(req.get('Cookie'), audience) ?? '',
      req.get('X-CSRF-Token') ?? '',
      readSessionCookie(req.get('Cookie'), kind),
    )
    cookies.setCookie(res, result.issued)
    respond(res, { account: result.account, csrfToken: result.issued.csrfToken })
  }
  const current: RequestHandler = async (req, res) => {
    respond(res, await service.current(readSessionCookie(req.get('Cookie'), kind)))
  }
  const logout: RequestHandler = async (req, res) => {
    parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
    await service.logout(readSessionCookie(req.get('Cookie'), kind))
    const next = await security.issueContext(
      audience,
      readContextCookie(req.get('Cookie'), audience),
    )
    cookies.clearCookie(res, kind)
    security.setContextCookie(res, audience, next)
    respond(res, { revoked: true, csrfToken: next.csrfToken })
  }
  return { register, login, current, logout }
}

export { credentialsController }
