import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { ClientSession, Connection } from 'mongoose'
import {
  type BrowserSecurityOptions,
  validateBrowserSecurityOptions,
} from '../../../config/security.js'
import { inTransaction } from '../../../shared/database/transaction.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { IdentityModels } from '../auth.model.js'
import { readSessionCookie } from './session.http.js'
import type { SessionKind, SessionService } from './session.service.js'

type BrowserAudience = 'storefront' | 'admin'

type BrowserSecurity = ReturnType<typeof createBrowserSecurity>

const opaque = /^[A-Za-z0-9_-]{43}$/

const contextNames = {
  storefront: 'sz_browser_ctx',
  admin: 'sz_admin_browser_ctx',
} as const

const denied = () => new ApiError('CSRF_INVALID')

function readContextCookie(header: string | undefined, audience: BrowserAudience) {
  const matches = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.split('=', 1)[0] === contextNames[audience])
  const token = matches.length === 1 ? matches[0]?.slice(matches[0].indexOf('=') + 1) : undefined
  return token && opaque.test(token) ? token : undefined
}

function createBrowserSecurity(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  settings: BrowserSecurityOptions,
  clock: () => Date = () => new Date(),
) {
  const options = validateBrowserSecurityOptions(settings, sessions.cookiePolicy.secure)
  const origins = {
    storefront: options.storefrontOrigin,
    admin: options.adminOrigin,
  }
  const hash = (audience: BrowserAudience, purpose: string, value: string, binding = '') =>
    createHmac('sha256', Buffer.from(options.secret, 'hex'))
      .update(`sportzone:browser:v1:${audience}:${purpose}:${binding}:${value}`)
      .digest('hex')
  const now = () => {
    const date = clock()
    if (!Number.isFinite(date.getTime())) throw new Error('Invalid browser security clock.')
    return date
  }
  const active = (audience: BrowserAudience, token: string, date: Date) => ({
    contextTokenHash: hash(audience, 'context', token),
    audience,
    expiresAt: { $gt: date },
    rotatedAt: { $exists: false },
  })
  async function verifyContext(
    audience: BrowserAudience,
    token: string | undefined,
    csrf: string | undefined,
  ) {
    if (!token || !csrf || !opaque.test(token) || !opaque.test(csrf)) return false
    const record = await models.contexts
      .findOne(active(audience, token, now()))
      .select('+csrfSecretHash')
    if (!record) return false
    const expected = Buffer.from(record.csrfSecretHash, 'hex')
    const actual = Buffer.from(
      hash(audience, 'csrf', csrf, hash(audience, 'context', token)),
      'hex',
    )
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  }
  return {
    verifyContext,
    async withContext<T>(
      audience: BrowserAudience,
      token: string | undefined,
      csrf: string | undefined,
      effect: (
        scope: {
          keyHash: string
        },
        session: ClientSession,
      ) => Promise<T>,
    ) {
      if (!token || !csrf || !opaque.test(token) || !opaque.test(csrf)) throw denied()
      return inTransaction(connection, async (session) => {
        const record = await models.contexts
          .findOne({
            ...active(audience, token, now()),
            csrfSecretHash: hash(audience, 'csrf', csrf, hash(audience, 'context', token)),
          })
          .select('+contextTokenHash')
          .session(session)
        if (!record) throw denied()
        return effect({ keyHash: record.contextTokenHash }, session)
      })
    },
    // An owning credential/proof service composes its durable effect in this transaction.
    // No external call belongs in effect; a failed effect rolls back consumption.
    async consumeContext<T>(
      audience: BrowserAudience,
      token: string,
      csrf: string,
      effect: (session: ClientSession) => Promise<T>,
    ) {
      if (!opaque.test(token) || !opaque.test(csrf)) throw denied()
      return inTransaction(connection, async (session) => {
        const date = now()
        const result = await models.contexts.updateOne(
          {
            ...active(audience, token, date),
            csrfSecretHash: hash(audience, 'csrf', csrf, hash(audience, 'context', token)),
          },
          { $set: { rotatedAt: date } },
          { session },
        )
        if (result.modifiedCount !== 1) throw denied()
        return effect(session)
      })
    },
    async issueContext(audience: BrowserAudience, previous?: string) {
      return inTransaction(connection, async (session) => {
        const date = now(),
          token = randomBytes(32).toString('base64url'),
          csrfToken = randomBytes(32).toString('base64url')
        const expiresAt = new Date(date.getTime() + options.contextTtlSeconds * 1000)
        if (previous && opaque.test(previous))
          await models.contexts.updateOne(
            active(audience, previous, date),
            { $set: { rotatedAt: date } },
            { session },
          )
        await new models.contexts({
          audience,
          contextTokenHash: hash(audience, 'context', token),
          csrfSecretHash: hash(audience, 'csrf', csrfToken, hash(audience, 'context', token)),
          expiresAt,
          createdAt: date,
          updatedAt: date,
        }).save({ session })
        return { token, csrfToken, expiresAt }
      })
    },
    cors(audience: BrowserAudience): RequestHandler {
      return (req, res, next) => {
        res.vary('Origin')
        const origin = req.get('Origin')
        if (origin && origin !== origins[audience]) {
          next(denied())
          return
        }
        if (origin) {
          res.setHeader('Access-Control-Allow-Origin', origin)
          res.setHeader('Access-Control-Allow-Credentials', 'true')
          res.setHeader('Access-Control-Expose-Headers', 'X-Request-Id')
        }
        if (req.method !== 'OPTIONS') {
          next()
          return
        }
        res.vary('Access-Control-Request-Method')
        res.vary('Access-Control-Request-Headers')
        const method = req.get('Access-Control-Request-Method')
        const allowed = ['content-type', 'x-csrf-token', 'idempotency-key', 'if-match']
        const headers = (req.get('Access-Control-Request-Headers') ?? '')
          .split(',')
          .map((h) => h.trim().toLowerCase())
          .filter(Boolean)
        if (
          !origin ||
          !method ||
          !['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ||
          headers.some((h) => !allowed.includes(h))
        ) {
          next(denied())
          return
        }
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE')
        res.setHeader('Access-Control-Allow-Headers', allowed.join(', '))
        res.setHeader('Cache-Control', 'no-store')
        res.status(204).end()
      }
    },
    require(
      audience: BrowserAudience,
      mode: 'context' | SessionKind | 'customer-or-context',
    ): RequestHandler {
      if (
        (audience === 'admin' && mode !== 'admin' && mode !== 'context') ||
        (audience === 'storefront' && mode === 'admin')
      )
        throw new Error('Invalid browser route scope.')
      return async (req, _res, next) => {
        if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
          next()
          return
        }
        if (req.get('Origin') !== origins[audience]) throw denied()
        const csrf = req.get('X-CSRF-Token')
        const kind = mode === 'customer-or-context' ? 'customer' : mode
        // Presence of an invalid session never downgrades a protected mutation to anonymous.
        if (
          kind !== 'context' &&
          (mode !== 'customer-or-context' ||
            req
              .get('Cookie')
              ?.split(';')
              .some((v) => v.trim().startsWith('sz_customer_sid=')))
        ) {
          if (
            !(await sessions.verifyCsrfMaterial(
              kind,
              readSessionCookie(req.get('Cookie'), kind),
              csrf,
            ))
          )
            throw denied()
        } else if (
          !(await verifyContext(audience, readContextCookie(req.get('Cookie'), audience), csrf))
        )
          throw denied()
        next()
      }
    },
    setContextCookie(
      res: import('express').Response,
      audience: BrowserAudience,
      issued: {
        token: string
        expiresAt: Date
      },
    ) {
      res.cookie(contextNames[audience], issued.token, {
        ...sessions.cookiePolicy,
        expires: issued.expiresAt,
        maxAge: Math.max(0, issued.expiresAt.getTime() - now().getTime()),
      })
    },
  }
}

function logoutProtection(
  security: BrowserSecurity,
  audience: 'storefront' | 'admin' = 'storefront',
  kind: 'customer' | 'admin' = 'customer',
): RequestHandler {
  const sessionGuard = security.require(audience, kind)
  const contextGuard = security.require(audience, 'context')
  return async (req, res, next) => {
    const token = readContextCookie(req.get('Cookie'), audience)
    if (await security.verifyContext(audience, token, req.get('X-CSRF-Token'))) {
      await contextGuard(req, res, next)
    } else await sessionGuard(req, res, next)
  }
}

export { loadBrowserSecurityOptions } from '../../../config/security.js'
export type { BrowserAudience, BrowserSecurity, BrowserSecurityOptions }
export {
  createBrowserSecurity,
  logoutProtection,
  readContextCookie,
  validateBrowserSecurityOptions,
}
