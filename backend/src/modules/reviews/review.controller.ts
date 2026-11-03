import type { Request, RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'
import { reviewId } from './review.schema.js'
import type {
  createReviewQueryService,
  createReviewService,
} from './review.service.js'

const productParams = z.strictObject({ productId: reviewId }),
  reviewParams = z.strictObject({ reviewId })
function createReviewController(
  query: ReturnType<typeof createReviewQueryService>,
  service: ReturnType<typeof createReviewService>,
  cookies: SessionCookies,
) {
  const customer = (req: Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'customer')
  const admin = (req: Request) =>
    cookies.readSessionCookie(req.get('Cookie'), 'admin')
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
      await service.edit(
        customer(req),
        parseInput(reviewParams, req.params).reviewId,
        req.body,
      ),
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
