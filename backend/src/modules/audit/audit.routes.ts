import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createAuditController } from './audit.controller.js'
import type { createAuditQueryService } from './audit.service.js'

function createAuditRoutes(
  service: ReturnType<typeof createAuditQueryService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp,
    controller = createAuditController(service, sessionHttp)
  router.options('/admin/audit-logs', cors)
  router.get('/admin/audit-logs', cors, http.require('admin'), controller.list)
  return router
}

export { createAuditRoutes }
