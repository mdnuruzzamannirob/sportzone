import type { RequestHandler } from 'express'
import { respond } from '../../../shared/responses.js'
import { readContextCookie } from '../sessions/browser-security.service.js'
import type { RecoveryService } from './password-recovery.service.js'
import { createSessionHttp, readSessionCookie } from '../sessions/session.http.js'
import type { SessionService } from '../sessions/session.service.js'

function createRecoveryController(service: RecoveryService, sessions: SessionService) {
  const cookies = createSessionHttp(sessions)
  const postAction =
    (
      action:
        | ((raw: unknown, context: string, csrf: string) => Promise<{ accepted: true }>)
        | ((raw: unknown, context: string, csrf: string) => Promise<{ reset: true }>),
    ): RequestHandler =>
    async (req, res) => {
      respond(
        res,
        await action(
          req.body,
          readContextCookie(req.get('Cookie'), 'storefront') ?? '',
          req.get('X-CSRF-Token') ?? '',
        ),
      )
    }
  const postMePasswordChange: RequestHandler = async (req, res) => {
    const result = await service.change(req.body, readSessionCookie(req.get('Cookie'), 'customer'))
    cookies.setCookie(res, result.issued)
    respond(res, { changed: true, csrfToken: result.issued.csrfToken })
  }
  return { postAction, postMePasswordChange }
}

export { createRecoveryController }
