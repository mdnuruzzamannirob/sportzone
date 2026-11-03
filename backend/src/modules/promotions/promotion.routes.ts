import {
  createCouponAdminController,
  createCouponPreviewController,
} from './promotion.controller.js'
import { Router } from 'express'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp } from '../auth/sessions/session.http.js'
import type { createCouponAdminService, createCouponPreviewService } from './promotion.service.js'

function createCouponAdminRoutes(
  service: ReturnType<typeof createCouponAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const controller = createCouponAdminController(service)

  const router = Router()
  for (const path of [
    '/admin/coupons',
    '/admin/coupons/:couponId',
    '/admin/coupons/:couponId/deactivate',
    '/admin/coupons/:couponId/redemptions',
  ])
    router.options(path, security.cors('admin'))
  router.use(
    '/admin/coupons',
    security.cors('admin'),
    security.require('admin', 'admin'),
    createSessionHttp(sessions).require('admin'),
  )
  router.use('/admin/coupons', (_req, res, next) => {
    res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
    next()
  })

  router.get('/admin/coupons', controller.getAdminCoupons)
  router.get('/admin/coupons/:couponId/redemptions', controller.getCouponsRedemptions)
  router.post('/admin/coupons', controller.postAdminCoupons)
  router.patch('/admin/coupons/:couponId', controller.patchAdminCoupons)
  router.post('/admin/coupons/:couponId/deactivate', controller.postCouponsDeactivate)
  return router
}

function createCouponPreviewRoutes(
  service: ReturnType<typeof createCouponPreviewService>,
  security: BrowserSecurity,
) {
  const controller = createCouponPreviewController(service)

  const router = Router(),
    cors = security.cors('storefront')
  router.options('/coupons/preview', cors)
  router.post(
    '/coupons/preview',
    cors,
    security.require('storefront', 'customer-or-context'),
    controller.postCouponsPreview,
  )
  return router
}

export { createCouponAdminRoutes, createCouponPreviewRoutes }
