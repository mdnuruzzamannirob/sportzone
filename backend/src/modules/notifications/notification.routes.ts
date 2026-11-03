import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createNotificationController } from './notification.controller.js'
import type { createNotificationAdminService } from './notification.service.js'

function createNotificationRoutes(
  service: ReturnType<typeof createNotificationAdminService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp,
    controller = createNotificationController(service, sessionHttp)
  for (const path of ['/admin/notifications', '/admin/notifications/:notificationId/retry'])
    router.options(path, cors)
  router.get('/admin/notifications', cors, http.require('admin'), controller.list)
  router.post(
    '/admin/notifications/:notificationId/retry',
    cors,
    security.require('admin', 'admin'),
    http.require('admin'),
    controller.retry,
  )
  return router
}

export { createNotificationRoutes }
