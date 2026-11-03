import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'
import type { createOperationalQueueService, createReportService } from './report.service.js'

function createReportController(
  service: ReturnType<typeof createReportService>,
  queues: ReturnType<typeof createOperationalQueueService>,
  cookies: SessionCookies,
) {
  const getReport =
    (kind: 'dashboard' | 'sales' | 'collections' | 'refunds'): RequestHandler =>
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      respond(
        res,
        await service.read(cookies.readSessionCookie(req.get('Cookie'), 'admin'), kind, req.query),
      )
    }
  const getAdminOperationalExceptions: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await queues.list(
      cookies.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  return { getReport, getAdminOperationalExceptions }
}

export { createReportController }
