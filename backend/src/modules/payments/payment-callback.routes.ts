import express, { Router, type RequestHandler } from 'express'
import { ApiError } from '../../shared/errors/app-error.js'
import { paymentReturnParams, paymentReturnForm } from './payment-callback.schema.js'
import type { paymentCallbackService } from './payment-callback.service.js'
export function paymentCallbackRoutes(
  service: ReturnType<typeof paymentCallbackService>,
  throttle: RequestHandler,
) {
  const router = Router({ caseSensitive: true, strict: true }),
    form = express.urlencoded({ extended: false, limit: 8192, parameterLimit: 64, inflate: false })
  const protection: RequestHandler = (_req, res, next) => {
    res.set('Referrer-Policy', 'no-referrer')
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    )
    next()
  }
  const parse: RequestHandler = (req, res, next) => {
    if (
      req.get('Content-Type')?.split(';', 1)[0]?.trim().toLowerCase() !==
      'application/x-www-form-urlencoded'
    ) {
      void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
      return
    }
    form(req, res, (error?: unknown) => {
      if (error) {
        void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
        return
      }
      if (Object.values(req.body ?? {}).some((value) => typeof value !== 'string')) {
        void service.malformed().then(() => next(new ApiError('INVALID_REQUEST')), next)
        return
      }
      next()
    })
  }
  router.post('/webhooks/sslcommerz/ipn', protection, throttle, parse, async (req, res) => {
    if (Object.keys(req.query).length) {
      await service.malformed()
      throw new ApiError('INVALID_REQUEST')
    }
    await service.receive(req.body)
    res.status(200).type('text/plain').send('OK')
  })
  const redirect: RequestHandler = async (req, res) => {
    const result = paymentReturnParams.safeParse(req.params)
    if (
      !result.success ||
      req.originalUrl.length > 8192 ||
      (req.method === 'POST' && !paymentReturnForm.safeParse(req.body ?? {}).success)
    ) {
      await service.malformed()
      throw new ApiError('INVALID_REQUEST')
    }
    res.status(303).set('Location', service.redirect(result.data.result)).end()
  }
  router.post('/payment-returns/sslcommerz/:result', protection, throttle, parse, redirect)
  router.get(
    '/payment-returns/sslcommerz/:result',
    protection,
    throttle,
    async (req, res, next) => {
      if (
        req.headers['transfer-encoding'] !== undefined ||
        Number(req.headers['content-length'] ?? 0) > 0
      ) {
        await service.malformed()
        throw new ApiError('INVALID_REQUEST')
      }
      await redirect(req, res, next)
    },
  )
  return router
}
