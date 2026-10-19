import { Router, type RequestHandler } from 'express'
import { createHash } from 'node:crypto'
import { z } from 'zod'
import { parseInput } from '../../middleware/validation.js'
import { ApiError } from '../../shared/errors.js'
import { respond } from '../../shared/responses.js'
import type { BrowserSecurity } from './browser-security.js'
import { readContextCookie } from './browser-security.js'
import type { CustomerService } from './customer.js'
import { createSessionHttp, readSessionCookie } from './session-http.js'
import type { SessionService } from './sessions.js'

// Local process guard, not a multi-replica abuse-control claim. Trusted proxy remains disabled.
export function customerRateLimit(
  clock: () => number = Date.now,
): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>()
  return (req, _res, next) => {
    const now = clock()
    for (const [key, value] of buckets)
      if (value.until <= now) buckets.delete(key)
    const key = createHash('sha256')
      .update(req.socket.remoteAddress ?? 'unknown')
      .digest('hex')
    let bucket = buckets.get(key)
    if (!bucket) {
      if (buckets.size >= 10000) {
        next(new ApiError('RATE_LIMITED'))
        return
      }
      bucket = { count: 0, until: now + 60000 }
      buckets.set(key, bucket)
    }
    bucket.count++
    next(bucket.count > 10 ? new ApiError('RATE_LIMITED') : undefined)
  }
}
export function customerRoutes(
  service: CustomerService,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cookies = createSessionHttp(sessions),
    limit = customerRateLimit()
  const endpoints = [
    '/auth/register',
    '/auth/login',
    '/auth/logout',
    '/auth/session',
  ]
  for (const path of endpoints)
    router.options(path, security.cors('storefront'))
  const context = security.require('storefront', 'context')
  const cors = security.cors('storefront')
  const headers = (req: import('express').Request) => ({
    context: readContextCookie(req.get('Cookie'), 'storefront') ?? '',
    csrf: req.get('X-CSRF-Token') ?? '',
  })
  const noQuery: RequestHandler = (req, _res, next) => {
    parseInput(z.strictObject({}), req.query)
    next()
  }
  router.post(
    '/auth/register',
    cors,
    limit,
    context,
    noQuery,
    async (req, res) => {
      const input = headers(req)
      const result = await service.register(req.body, input.context, input.csrf)
      respond(res, result, 201)
    },
  )
  router.post(
    '/auth/login',
    cors,
    limit,
    context,
    noQuery,
    async (req, res) => {
      const input = headers(req)
      const result = await service.login(
        req.body,
        input.context,
        input.csrf,
        readSessionCookie(req.get('Cookie'), 'customer'),
      )
      cookies.setCookie(res, result.issued)
      respond(res, {
        account: result.account,
        csrfToken: result.issued.csrfToken,
      })
    },
  )
  router.get('/auth/session', cors, noQuery, async (req, res) => {
    respond(
      res,
      await service.current(readSessionCookie(req.get('Cookie'), 'customer')),
    )
  })
  router.post(
    '/auth/logout',
    cors,
    limit,
    logoutProtection(security),
    noQuery,
    async (req, res) => {
      parseInput(z.union([z.undefined(), z.strictObject({})]), req.body)
      await service.logout(readSessionCookie(req.get('Cookie'), 'customer'))
      const next = await security.issueContext(
        'storefront',
        readContextCookie(req.get('Cookie'), 'storefront'),
      )
      cookies.clearCookie(res, 'customer')
      security.setContextCookie(res, 'storefront', next)
      respond(res, { revoked: true, csrfToken: next.csrfToken })
    },
  )
  return router
}

function logoutProtection(security: BrowserSecurity): RequestHandler {
  const sessionGuard = security.require('storefront', 'customer')
  const contextGuard = security.require('storefront', 'context')
  return async (req, res, next) => {
    const token = readContextCookie(req.get('Cookie'), 'storefront')
    if (
      await security.verifyContext('storefront', token, req.get('X-CSRF-Token'))
    ) {
      await contextGuard(req, res, next)
    } else await sessionGuard(req, res, next)
  }
}
