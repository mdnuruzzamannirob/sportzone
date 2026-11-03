import type { RequestHandler } from 'express'
import { z } from 'zod'
import type { createReportService, createOperationalQueueService } from './report.service.js'
import { readSessionCookie } from '../auth/sessions/session.http.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'

function createReportController(
  service: ReturnType<typeof createReportService>,
  queues: ReturnType<typeof createOperationalQueueService>,
) {
  const getAction =
    (kind: 'dashboard' | 'sales' | 'collections' | 'refunds'): RequestHandler =>
    async (req, res) => {
      parseInput(z.undefined(), req.body)
      respond(
        res,
        await service.read(readSessionCookie(req.get('Cookie'), 'admin'), kind, req.query),
      )
    }
  const getAdminOperationalExceptions: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await queues.list(readSessionCookie(req.get('Cookie'), 'admin'), req.query)
    respond(res, result.items, 200, result.pagination)
  }
  return { getAction, getAdminOperationalExceptions }
}

export { createReportController }
