import { Router, type Request } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { createReviewService } from './review.service.js'
import type { reviewQueryService } from './review-query.service.js'
import { reviewId } from './review.schema.js'
const productParams = z.strictObject({ productId: reviewId }),
  reviewParams = z.strictObject({ reviewId })
// Root composition supplies canonical eligibility, visibility and current-session moderation.
export function reviewRoutes(
  query: ReturnType<typeof reviewQueryService>,
  service: ReturnType<typeof createReviewService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    http = createSessionHttp(sessions)
  const customer = (req: Request) => readSessionCookie(req.get('Cookie'), 'customer')
  const admin = (req: Request) => readSessionCookie(req.get('Cookie'), 'admin')
  for (const path of ['/products/:productId/reviews', '/reviews/:reviewId', '/me/reviews'])
    router.options(path, security.cors('storefront'))
  for (const path of ['/admin/reviews', '/admin/reviews/:reviewId/moderation'])
    router.options(path, security.cors('admin'))
  router.get('/products/:productId/reviews', security.cors('storefront'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await query.publicList(
      parseInput(productParams, req.params).productId,
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  })
  router.get(
    '/me/reviews',
    security.cors('storefront'),
    http.require('customer'),
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      parseInput(z.strictObject({}), req.params)
      const result = await query.ownList(customer(req), req.query)
      respond(res, result.items, 200, result.pagination)
    },
  )
  router.post(
    '/products/:productId/reviews',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    http.require('customer'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.create(
          customer(req),
          parseInput(productParams, req.params).productId,
          req.body,
        ),
        201,
      )
    },
  )
  router.patch(
    '/reviews/:reviewId',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    http.require('customer'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.edit(customer(req), parseInput(reviewParams, req.params).reviewId, req.body),
      )
    },
  )
  router.get('/admin/reviews', security.cors('admin'), http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.params)
    const result = await query.adminList(admin(req), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  router.post(
    '/admin/reviews/:reviewId/moderation',
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await service.moderate(
          admin(req),
          parseInput(reviewParams, req.params).reviewId,
          req.body,
          req.get('Idempotency-Key') ?? '',
        ),
      )
    },
  )
  return router
}
