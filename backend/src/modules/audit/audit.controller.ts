import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'

import type { createAuditQueryService } from './audit.service.js'

function createAuditController(
  service: ReturnType<typeof createAuditQueryService>,
  cookies: SessionCookies,
) {
  const list: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(
      cookies.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  return { list }
}

export { createAuditController }
