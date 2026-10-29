import type { Connection } from 'mongoose'
import { createAuthQuotaStore } from './auth-throttle.persistence.js'
import { createHash, createHmac } from 'node:crypto'
import type { RequestHandler } from 'express'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { QuotaStore } from './auth-throttle.persistence.js'

type Audience = 'customer' | 'admin'
type Group = 'credentials' | 'recovery' | 'email' | 'bootstrap' | 'media' | 'checkout' | 'guest'
export function createAuthThrottle(store: QuotaStore, secret: string, clock = Date.now) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid auth throttle configuration.')
  async function consume(audience: Audience, group: Group, network: string, target?: string) {
    // Verify before admission: never implicitly recreate missing protection state.
    await store.verify?.()
    const now = clock()
    if (!Number.isFinite(now) || now < 0) throw new Error('Invalid auth throttle clock.')
    const start = Math.floor(now / 60000) * 60000
    const expiresAt = new Date(start + 60000)
    const checks: [string, number][] = [['network', 60]]
    if (group !== 'bootstrap') checks.push([`network:${group}`, 10])
    if (target) checks.push([`target:${group}`, 10])
    for (const [scope, limit] of checks) {
      const key = createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(
          JSON.stringify([
            'sportzone:auth-throttle:v1',
            audience,
            scope,
            start,
            scope.startsWith('target:') ? target : network,
          ]),
        )
        .digest('hex')
      if ((await store.increment(key, expiresAt, limit)) > limit)
        return Math.max(1, Math.ceil((expiresAt.getTime() - now) / 1000))
    }
    return 0
  }
  return {
    consume,
    middleware(audience: Audience, group: Group): RequestHandler {
      return async (req, res, next) => {
        const raw: unknown = req.body?.email ?? req.body?.newEmail
        const target =
          typeof raw === 'string' &&
          raw.length <= 1024 &&
          raw.trim().length <= 254 &&
          raw.trim().length > 0
            ? raw.trim().toLowerCase()
            : undefined
        try {
          const retry = await consume(
            audience,
            group,
            req.socket.remoteAddress ?? 'unknown',
            target,
          )
          if (retry) {
            res.setHeader('Retry-After', retry)
            res.locals.securityReason = 'rate_limited'
            next(new ApiError('RATE_LIMITED'))
          } else next()
        } catch {
          res.locals.securityReason = 'throttle_unavailable'
          next(new ApiError('SERVICE_UNAVAILABLE'))
        }
      }
    },
  }
}

// Local process guard, not a multi-replica abuse-control claim. Trusted proxy remains disabled.
export function localAuthRateLimit(clock: () => number = Date.now, maximum = 10): RequestHandler {
  const buckets = new Map<string, { count: number; until: number }>()
  return (req, _res, next) => {
    const now = clock()
    for (const [key, value] of buckets) if (value.until <= now) buckets.delete(key)
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
    next(bucket.count > maximum ? new ApiError('RATE_LIMITED') : undefined)
  }
}

export function createPaymentCallbackThrottle(
  connection: Connection,
  secret: string,
  limit: number,
  clock = Date.now,
): RequestHandler {
  if (!/^[a-f0-9]{64}$/.test(secret) || !Number.isInteger(limit) || limit < 1 || limit > 60)
    throw new Error('Invalid callback rate policy')
  const store = createAuthQuotaStore(connection)
  return async (req, res, next) => {
    try {
      await store.verify?.()
      const now = clock()
      if (!Number.isFinite(now) || now < 0) throw new Error('Invalid callback clock')
      const bucket = Math.floor(now / 60000),
        expiry = new Date((bucket + 1) * 60000)
      const key = createHmac('sha256', Buffer.from(secret, 'hex'))
        .update(
          JSON.stringify([
            'sportzone:callback-rate:v1',
            req.socket.remoteAddress ?? 'unknown',
            bucket,
          ]),
        )
        .digest('hex')
      if ((await store.increment(key, expiry, limit)) > limit) {
        res.set('Retry-After', String(Math.max(1, Math.ceil((expiry.getTime() - now) / 1000))))
        res.locals.securityReason = 'rate_limited'
        next(new ApiError('RATE_LIMITED'))
        return
      }
      next()
    } catch {
      res.locals.securityReason = 'throttle_unavailable'
      next(new ApiError('SERVICE_UNAVAILABLE'))
    }
  }
}
