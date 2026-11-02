import { Router } from 'express'
import { z } from 'zod'
import type { reportService, operationalQueueService } from './report.service.js'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
export function reportRoutes(
  service: ReturnType<typeof reportService>,
  security: BrowserSecurity,
  sessions: SessionService,
  queues: ReturnType<typeof operationalQueueService>,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  for (const kind of ['dashboard', 'sales', 'collections', 'refunds'] as const) {
    const path = kind === 'dashboard' ? '/admin/dashboard' : `/admin/reports/${kind}`
    router.options(path, cors)
    router.get(path, cors, http.require('admin'), async (req, res) => {
      parseInput(z.undefined(), req.body)
      respond(
        res,
        await service.read(readSessionCookie(req.get('Cookie'), 'admin'), kind, req.query),
      )
    })
  }
  router.options('/admin/operational-exceptions', cors)
  router.get('/admin/operational-exceptions', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await queues.list(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  return router
}
