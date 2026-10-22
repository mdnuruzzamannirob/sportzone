import { securityAction } from './shared/security-actions.js'
import express, { type Router } from 'express'
import { randomUUID } from 'node:crypto'
import { handleError } from './shared/middleware/handle-error.js'
import type { HealthDependencies } from './modules/health/health.service.js'
import type { Logger } from './shared/logger.js'
import { createApiRouter } from './routes.js'
import { ApiError } from './shared/errors/app-error.js'

export function createApp({
  apiRouter,
  health,
  logger,
  jsonBodyLimitBytes = 102400,
  mediaUploadsEnabled = false,
}: {
  apiRouter?: Router
  health?: HealthDependencies
  logger?: Logger
  jsonBodyLimitBytes?: number
  mediaUploadsEnabled?: boolean
} = {}) {
  if (!Number.isSafeInteger(jsonBodyLimitBytes) || jsonBodyLimitBytes < 1)
    throw new RangeError('Invalid JSON body limit')
  const app = express()
  app.disable('x-powered-by')
  app.disable('etag')
  app.set('trust proxy', false)
  app.set('query parser', 'simple')
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID()
    res.setHeader('X-Request-Id', res.locals.requestId)
    res.setHeader('Cache-Control', 'no-store')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    next()
  })
  if (logger)
    app.use((req, res, next) => {
      const started = performance.now()
      let recorded = false
      const record = () => {
        if (recorded) return
        recorded = true
        // Only the registered pattern, never originalUrl/baseUrl/params/query/header/body.
        const route = typeof req.route?.path === 'string' ? req.route.path : 'unmatched'
        const action = securityAction(req.method, route)
        const reason: unknown = res.locals.securityReason
        logger.request({
          requestId: res.locals.requestId,
          method: req.method,
          route,
          ...(action ? { securityAction: action } : {}),
          ...(reason === 'rate_limited' || reason === 'throttle_unavailable'
            ? { securityReason: reason }
            : {}),
          status: res.writableFinished ? res.statusCode : 499,
          durationMs: performance.now() - started,
          ...(res.locals.errorCode ? { errorCode: res.locals.errorCode } : {}),
        })
      }
      res.once('finish', record)
      res.once('close', record)
      next()
    })
  const json = express.json({
    limit: jsonBodyLimitBytes,
    strict: true,
    inflate: false,
  })
  app.use((req, res, next) => {
    const hasBody =
      req.headers['transfer-encoding'] !== undefined ||
      Number(req.headers['content-length'] ?? 0) > 0
    if (
      mediaUploadsEnabled &&
      req.method === 'POST' &&
      req.path === '/api/v1/admin/media/uploads' &&
      req.is('multipart/form-data')
    ) {
      next()
      return
    }
    if (hasBody && !req.is('application/json')) {
      next(new ApiError('INVALID_REQUEST'))
      return
    }
    json(req, res, (error?: unknown) => next(error ? new ApiError('INVALID_REQUEST') : undefined))
  })
  app.use('/api/v1', apiRouter ?? createApiRouter(health))
  app.use((_req, _res, next) => next(new ApiError('NOT_FOUND')))
  app.use(handleError)
  return app
}
