import { Router } from 'express'
import type { BrowserSecurity, SessionHttp } from '../auth/auth.public.js'
import { createReportController } from './report.controller.js'
import type { createOperationalQueueService, createReportService } from './report.service.js'

function createReportRoutes(
  service: ReturnType<typeof createReportService>,
  security: BrowserSecurity,
  sessionHttp: SessionHttp,
  queues: ReturnType<typeof createOperationalQueueService>,
) {
  const controller = createReportController(service, queues, sessionHttp)

  const router = Router(),
    cors = security.cors('admin'),
    http = sessionHttp
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
