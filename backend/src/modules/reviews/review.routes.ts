import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createReviewController } from './review.controller.js'

import type { createReviewQueryService, createReviewService } from './review.service.js'

// Root composition supplies canonical eligibility, visibility and current-session moderation.
function createReviewRoutes(
  query: ReturnType<typeof createReviewQueryService>,
  service: ReturnType<typeof createReviewService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createReviewController(query, service, sessionHttp)

  const router = Router(),
    http = sessionHttp

  for (const path of ['/products/:productId/reviews', '/reviews/:reviewId', '/me/reviews'])
    router.options(path, security.cors('storefront'))
  for (const path of ['/admin/reviews', '/admin/reviews/:reviewId/moderation'])
    router.options(path, security.cors('admin'))
  router.get(
    '/products/:productId/reviews',
    security.cors('storefront'),
    controller.getProductsReviews,
  )
  router.get(
    '/me/reviews',
    security.cors('storefront'),
    http.require('customer'),
    controller.getMeReviews,
  )
  router.post(
    '/products/:productId/reviews',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    http.require('customer'),
    controller.postProductsReviews,
  )
  router.patch(
    '/reviews/:reviewId',
    security.cors('storefront'),
    security.require('storefront', 'customer'),
    http.require('customer'),
    controller.patchReviews,
  )
  router.get(
    '/admin/reviews',
    security.cors('admin'),
    http.require('admin'),
    controller.getAdminReviews,
  )
  router.post(
    '/admin/reviews/:reviewId/moderation',
    security.cors('admin'),
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.postReviewsModeration,
  )
  return router
}

export { createReviewRoutes }
