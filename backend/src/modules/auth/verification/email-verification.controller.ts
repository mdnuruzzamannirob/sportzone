import type { RequestHandler } from 'express'
import { z } from 'zod'
import { parseInput } from '../../../shared/middleware/validate.js'
import { respond } from '../../../shared/responses.js'
import { readContextCookie } from '../sessions/browser-security.service.js'

function createEmailVerificationController() {
  const verifyEmail =
    (
      action:
        | ((raw: unknown, context: string, csrf: string) => Promise<{ accepted: true }>)
        | ((raw: unknown, context: string, csrf: string) => Promise<{ verified: true }>),
    ): RequestHandler =>
    async (req, res) => {
      parseInput(z.strictObject({}), req.query)
      respond(
        res,
        await action(
          req.body,
          readContextCookie(req.get('Cookie'), 'storefront') ?? '',
          req.get('X-CSRF-Token') ?? '',
        ),
      )
    }
  return { verifyEmail }
}

export { createEmailVerificationController }
