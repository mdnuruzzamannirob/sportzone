import { Router } from 'express'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp } from '../auth/sessions/session.http.js'
import type { createAuditQueryService } from './audit.service.js'
import { createAuditController } from './audit.controller.js'

function createAuditRoutes(
  service: ReturnType<typeof createAuditQueryService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions),
    controller = createAuditController(service)
  router.options('/admin/audit-logs', cors)
  router.get('/admin/audit-logs', cors, http.require('admin'), controller.list)
  return router
}

export { createAuditRoutes }
