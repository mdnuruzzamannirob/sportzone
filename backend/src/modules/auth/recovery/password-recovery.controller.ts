import type { RequestHandler } from 'express'
import { respond } from '../../../shared/responses.js'
import { readContextCookie } from '../sessions/browser-security.service.js'
import { createSessionHttp, readSessionCookie } from '../sessions/session.http.js'
import type { SessionService } from '../sessions/session.service.js'
import type { RecoveryService } from './password-recovery.service.js'

function createRecoveryController(service: RecoveryService, sessions: SessionService) {
  const cookies = createSessionHttp(sessions)
  const recoverPassword = (action: RecoveryService['request'] | RecoveryService['confirm']) =>
    createRecoveryActionHandler(action, 'storefront')
  const postMePasswordChange: RequestHandler = async (req, res) => {
    const result = await service.change(req.body, readSessionCookie(req.get('Cookie'), 'customer'))
    cookies.setCookie(res, result.issued)
    respond(res, { changed: true, csrfToken: result.issued.csrfToken })
  }
  return { recoverPassword, postMePasswordChange }
}

function createRecoveryActionHandler(
  action: RecoveryService['request'] | RecoveryService['confirm'],
  audience: 'storefront' | 'admin',
): RequestHandler {
  return async (req, res) => {
    respond(
      res,
      await action(
        req.body,
        readContextCookie(req.get('Cookie'), audience) ?? '',
        req.get('X-CSRF-Token') ?? '',
      ),
    )
  }
}

export { createRecoveryActionHandler, createRecoveryController }
