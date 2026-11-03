import { createProductAdminController } from './product.controller.js'
import { Router } from 'express'
import type { BrowserSecurity } from '../../auth/sessions/browser-security.service.js'
import type { SessionService } from '../../auth/sessions/session.service.js'
import { createSessionHttp } from '../../auth/sessions/session.http.js'
import type { createProductAdminService } from './product.service.js'

function createProductAdminRoutes(
  service: ReturnType<typeof createProductAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const controller = createProductAdminController(service)

  const router = Router()
  for (const path of [
    '/admin/products',
    '/admin/products/:productId',
    '/admin/products/:productId/deactivate',
    '/admin/products/:productId/variants',
    '/admin/variants/:variantId',
    '/admin/variants/:variantId/deactivate',
  ])
    router.options(path, security.cors('admin'))
  for (const path of ['/admin/products', '/admin/variants'])
    router.use(
      path,
      security.cors('admin'),
      security.require('admin', 'admin'),
      createSessionHttp(sessions).require('admin'),
      (_req, res, next) => {
        res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag, Location')
        next()
      },
    )

  router.get('/admin/products', controller.getAdminProducts)
  router.get('/admin/products/:productId', controller.getAdminProducts2)
  router.post('/admin/products', controller.postAdminProducts)
  router.patch('/admin/products/:productId', controller.patchAdminProducts)
  router.post('/admin/products/:productId/deactivate', controller.postProductsDeactivate)
  router.post('/admin/products/:productId/variants', controller.postProductsVariants)
  router.patch('/admin/variants/:variantId', controller.patchAdminVariants)
  router.post('/admin/variants/:variantId/deactivate', controller.postVariantsDeactivate)
  return router
}

export { createProductAdminRoutes }
