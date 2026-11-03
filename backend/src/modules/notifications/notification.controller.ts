import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../shared/middleware/validate.js'
import { respond } from '../../shared/responses.js'
import type { SessionCookies } from '../auth/auth.public.js'

import type { createNotificationAdminService } from './notification.service.js'

function createNotificationController(
  service: ReturnType<typeof createNotificationAdminService>,
  cookies: SessionCookies,
) {
  const id = z.string().regex(/^[a-f0-9]{24}$/)
  const list: RequestHandler = async (req, res) => {
    parseInput(z.undefined(), req.body)
    const result = await service.list(
      cookies.readSessionCookie(req.get('Cookie'), 'admin'),
      req.query,
    )
    respond(res, result.items, 200, result.pagination)
  }
  const retry: RequestHandler = async (req, res) => {
    parseInput(z.strictObject({}), req.query)
    respond(
      res,
      await service.retry(
        cookies.readSessionCookie(req.get('Cookie'), 'admin'),
        parseInput(z.strictObject({ notificationId: id }), req.params).notificationId,
        req.body,
        req.get('Idempotency-Key'),
      ),
    )
  }
  return { list, retry }
}

export { createNotificationController }
