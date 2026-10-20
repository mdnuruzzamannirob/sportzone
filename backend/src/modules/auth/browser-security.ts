import type { RequestHandler } from 'express'
import type { ClientSession, Connection } from 'mongoose'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { inTransaction } from '../../db/transaction.js'
import { ApiError } from '../../shared/errors.js'
import { ConfigurationError } from '../../config/environment.js'
import type { IdentityModels } from './models.js'
import { readSessionCookie } from './session-http.js'
import type { SessionKind, SessionService } from './sessions.js'

export type BrowserAudience = 'storefront' | 'admin'
const opaque = /^[A-Za-z0-9_-]{43}$/
const contextNames = {
  storefront: 'sz_browser_ctx',
  admin: 'sz_admin_browser_ctx',
} as const
const denied = () => new ApiError('CSRF_INVALID')
export function readContextCookie(
  header: string | undefined,
  audience: BrowserAudience,
) {
  const matches = (header ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.split('=', 1)[0] === contextNames[audience])
  const token =
    matches.length === 1
      ? matches[0]?.slice(matches[0].indexOf('=') + 1)
      : undefined
  return token && opaque.test(token) ? token : undefined
}
export type BrowserSecurityOptions = {
  secret: string
  contextTtlSeconds: number
  storefrontOrigin: string
  adminOrigin: string
}
export function validateBrowserSecurityOptions(
  input: BrowserSecurityOptions,
  secure: boolean,
) {
  if (
    !/^[a-f0-9]{64}$/.test(input.secret) ||
    /^(.)\1+$/.test(input.secret) ||
    !Number.isSafeInteger(input.contextTtlSeconds) ||
    input.contextTtlSeconds < 1 ||
    input.contextTtlSeconds > 1800
  )
    throw new Error('Invalid browser security configuration.')
  for (const origin of [input.storefrontOrigin, input.adminOrigin]) {
    let url: URL
    try {
      url = new URL(origin)
    } catch {
      throw new Error('Invalid browser security origin.')
    }
    if (
      url.origin !== origin ||
      !['https:', 'http:'].includes(url.protocol) ||
      (url.protocol === 'http:' &&
        (secure || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      throw new Error('Invalid browser security origin.')
  }
  if (input.storefrontOrigin === input.adminOrigin)
    throw new Error('Browser origins must be distinct.')
  return Object.freeze({ ...input })
}
export function loadBrowserSecurityOptions(
  environment: NodeJS.ProcessEnv,
  secure: boolean,
): BrowserSecurityOptions {
  try {
    const allowed = (environment.CORS_ALLOWED_ORIGINS ?? '').split(',')
    if (
      allowed.length !== 2 ||
      new Set(allowed).size !== 2 ||
      !allowed.includes(environment.STOREFRONT_ORIGIN ?? '') ||
      !allowed.includes(environment.ADMIN_ORIGIN ?? '')
    )
      throw new Error('Invalid origin allowlist.')
    return validateBrowserSecurityOptions(
      {
        secret: environment.SESSION_SECRET ?? '',
        contextTtlSeconds: /^[1-9]\d*$/.test(
          environment.BROWSER_CONTEXT_TTL_SECONDS ?? '',
        )
          ? Number(environment.BROWSER_CONTEXT_TTL_SECONDS)
          : NaN,
        storefrontOrigin: environment.STOREFRONT_ORIGIN ?? '',
        adminOrigin: environment.ADMIN_ORIGIN ?? '',
      },
      secure,
    )
  } catch {
    throw new ConfigurationError(['browser_security_configuration'])
  }
}
export function createBrowserSecurity(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  settings: BrowserSecurityOptions,
  clock: () => Date = () => new Date(),
) {
  const options = validateBrowserSecurityOptions(
    settings,
    sessions.cookiePolicy.secure,
  )
  const origins = {
    storefront: options.storefrontOrigin,
    admin: options.adminOrigin,
  }
  const hash = (
    audience: BrowserAudience,
    purpose: string,
    value: string,
    binding = '',
  ) =>
    createHmac('sha256', Buffer.from(options.secret, 'hex'))
      .update(`sportzone:browser:v1:${audience}:${purpose}:${binding}:${value}`)
      .digest('hex')
  const now = () => {
    const date = clock()
    if (!Number.isFinite(date.getTime()))
      throw new Error('Invalid browser security clock.')
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
    if (!token || !csrf || !opaque.test(token) || !opaque.test(csrf))
      return false
    const record = await models.contexts
      .findOne(active(audience, token, now()))
      .select('+csrfSecretHash')
    if (!record) return false
    const expected = Buffer.from(record.csrfSecretHash, 'hex')
    const actual = Buffer.from(
      hash(audience, 'csrf', csrf, hash(audience, 'context', token)),
      'hex',
    )
    return (
      expected.length === actual.length && timingSafeEqual(expected, actual)
    )
  }
  return {
    verifyContext,
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
            csrfSecretHash: hash(
              audience,
              'csrf',
              csrf,
              hash(audience, 'context', token),
            ),
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
        const expiresAt = new Date(
          date.getTime() + options.contextTtlSeconds * 1000,
        )
        if (previous && opaque.test(previous))
          await models.contexts.updateOne(
            active(audience, previous, date),
            { $set: { rotatedAt: date } },
            { session },
          )
        await new models.contexts({
          audience,
          contextTokenHash: hash(audience, 'context', token),
          csrfSecretHash: hash(
            audience,
            'csrf',
            csrfToken,
            hash(audience, 'context', token),
          ),
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
        const allowed = [
          'content-type',
          'x-csrf-token',
          'idempotency-key',
          'if-match',
        ]
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
        res.setHeader(
          'Access-Control-Allow-Methods',
          'GET, HEAD, POST, PUT, PATCH, DELETE',
        )
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
          !(await verifyContext(
            audience,
            readContextCookie(req.get('Cookie'), audience),
            csrf,
          ))
        )
          throw denied()
        next()
      }
    },
    setContextCookie(
      res: import('express').Response,
      audience: BrowserAudience,
      issued: { token: string; expiresAt: Date },
    ) {
      res.cookie(contextNames[audience], issued.token, {
        ...sessions.cookiePolicy,
        expires: issued.expiresAt,
        maxAge: Math.max(0, issued.expiresAt.getTime() - now().getTime()),
      })
    },
  }
}
export type BrowserSecurity = ReturnType<typeof createBrowserSecurity>
