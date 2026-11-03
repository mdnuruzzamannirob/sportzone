import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createInventoryAdminController } from './inventory.controller.js'

import type { createInventoryAdminService } from './inventory.service.js'

function createInventoryAdminRoutes(
  service: ReturnType<typeof createInventoryAdminService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const controller = createInventoryAdminController(service, sessionHttp)

  const router = Router()
  for (const path of [
    '/admin/inventory',
    '/admin/inventory/:variantId/movements',
    '/admin/inventory/:variantId/adjustments',
  ])
    router.options(path, security.cors('admin'))
  for (const path of ['/admin/inventory'])
    router.use(
      path,
      security.cors('admin'),
      security.require('admin', 'admin'),
      sessionHttp.require('admin'),
    )

  router.get('/admin/inventory', controller.getAdminInventory)
  router.get('/admin/inventory/:variantId/movements', controller.getInventoryMovements)
  router.post('/admin/inventory/:variantId/adjustments', controller.postInventoryAdjustments)
  return router
}

export { createInventoryAdminRoutes }
