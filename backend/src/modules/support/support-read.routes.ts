import { Router } from 'express'
import { z } from 'zod'
import type { BrowserSecurity } from '../auth/sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../auth/sessions/session.http.js'
import type { SessionService } from '../auth/sessions/session.service.js'
import type { auditQueryService } from '../audit/audit-query.service.js'
import type { complaintService } from './complaint.service.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'

// Local/test composition only. Other support mutations and operational queues remain gated.
export function supportReadRoutes(
  complaints: Pick<ReturnType<typeof complaintService>, 'adminList'>,
  audit: ReturnType<typeof auditQueryService>,
  security: BrowserSecurity,
  sessions: SessionService,
) {
  const router = Router(),
    cors = security.cors('admin'),
    http = createSessionHttp(sessions)
  for (const path of ['/admin/complaints', '/admin/audit-logs']) router.options(path, cors)
  router.get('/admin/complaints', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await complaints.adminList(
      readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  })
  router.get('/admin/audit-logs', cors, http.require('admin'), async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await audit.list(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  })
  return router
}
