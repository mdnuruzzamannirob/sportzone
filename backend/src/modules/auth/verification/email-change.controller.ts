import type { RequestHandler } from 'express'
import { respond } from '../../../shared/responses.js'
import type { EmailChangeService } from './email-change.service.js'
import { createSessionHttp, readSessionCookie } from '../sessions/session.http.js'
import type { SessionService } from '../sessions/session.service.js'

function createEmailChangeController(service: EmailChangeService, sessions: SessionService) {
  const cookies = createSessionHttp(sessions)
  const postMeEmailChanges: RequestHandler = async (req, res) => {
    respond(res, await service.request(req.body, readSessionCookie(req.get('Cookie'), 'customer')))
  }
  const postEmailChangesConfirm: RequestHandler = async (req, res) => {
    const account = await service.confirm(
      req.body,
      readSessionCookie(req.get('Cookie'), 'customer'),
    )
    cookies.clearCookie(res, 'customer')
    respond(res, account)
  }
  return { postMeEmailChanges, postEmailChangesConfirm }
}

export { createEmailChangeController }
