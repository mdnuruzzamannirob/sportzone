import { Router } from 'express'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp } from '../auth/sessions/session.http.js'
import type { createNotificationAdminService } from './notification.service.js'
import { createNotificationController } from './notification.controller.js'

function createNotificationRoutes(
  service: ReturnType<typeof createNotificationAdminService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions),
    controller = createNotificationController(service)
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
