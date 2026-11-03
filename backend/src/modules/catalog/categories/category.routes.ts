import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../../auth/auth.public.js'
import { createCategoryAdminController } from './category.controller.js'

import type { createCategoryAdminService } from './category.service.js'

function createCategoryAdminRoutes(
  service: ReturnType<typeof createCategoryAdminService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createCategoryAdminController(service, sessionHttp)

  const router = Router()
  for (const path of [
    '/admin/categories',
    '/admin/categories/:categoryId',
    '/admin/categories/:categoryId/deactivate',
  ])
    router.options(path, security.cors('admin'))
  router.use(
    '/admin/categories',
    security.cors('admin'),
    security.require('admin', 'admin'),
    sessionHttp.require('admin'),
    (_req, res, next) => {
      res.set('Access-Control-Expose-Headers', 'X-Request-Id, ETag')
      next()
    },
  )

  router.get('/admin/categories', controller.getAdminCategories)
  router.post('/admin/categories', controller.postAdminCategories)
  router.patch('/admin/categories/:categoryId', controller.patchAdminCategories)
  router.post('/admin/categories/:categoryId/deactivate', controller.postCategoriesDeactivate)
  return router
}

export { createCategoryAdminRoutes }
