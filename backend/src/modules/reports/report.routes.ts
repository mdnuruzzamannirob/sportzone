import { createReportController } from './report.controller.js'
import { Router } from 'express'
import type { createReportService, createOperationalQueueService } from './report.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp } from '../auth/sessions/session.http.js'

function createReportRoutes(
  service: ReturnType<typeof createReportService>,
  security: BrowserSecurity,
  sessions: SessionService,
  queues: ReturnType<typeof createOperationalQueueService>,
) {
  const controller = createReportController(service, queues)

  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  for (const kind of ['dashboard', 'sales', 'collections', 'refunds'] as const) {
    const path = kind === 'dashboard' ? '/admin/dashboard' : `/admin/reports/${kind}`
    router.options(path, cors)
    router.get(path, cors, http.require('admin'), controller.getAction(kind))
  }
  router.options('/admin/operational-exceptions', cors)
  router.get(
    '/admin/operational-exceptions',
    cors,
    http.require('admin'),
    controller.getAdminOperationalExceptions,
  )
  return router
}

export { createReportRoutes }
