import type { RequestHandler } from 'express'
import type { Request } from 'express'
import { z } from 'zod'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { createReviewService, createReviewQueryService } from './review.service.js'
import { reviewId } from './review.schema.js'

const productParams = z.strictObject({ productId: reviewId }),
  reviewParams = z.strictObject({ reviewId })
function createReviewController(
  query: ReturnType<typeof createReviewQueryService>,
  service: ReturnType<typeof createReviewService>,
) {
  const customer = (req: Request) => readSessionCookie(req.get('Cookie'), 'customer')
  const admin = (req: Request) => readSessionCookie(req.get('Cookie'), 'admin')
  const getProductsReviews: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await query.publicList(
      parseInput(productParams, req.params).productId,
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  const getMeReviews: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.params)
    const result = await query.ownList(customer(req), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const postProductsReviews: RequestHandler = async (req, res) => {
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
  }
  const patchReviews: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.edit(customer(req), parseInput(reviewParams, req.params).reviewId, req.body),
    )
  }
  const getAdminReviews: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    parseInput(z.strictObject({}), req.params)
    const result = await query.adminList(admin(req), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  const postReviewsModeration: RequestHandler = async (req, res) => {
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
  }
  return {
    getProductsReviews,
    getMeReviews,
    postProductsReviews,
    patchReviews,
    getAdminReviews,
    postReviewsModeration,
  }
}

export { createReviewController }
