import type { RequestHandler, Response } from 'express'
import type {
  IssuedSession,
  SessionIdentity,
  SessionKind,
  SessionService,
} from './sessions.js'

const names = { customer: 'sz_customer_sid', admin: 'sz_admin_sid' } as const
export function readSessionCookie(header: string | undefined, kind: SessionKind) {
  const entries = (header ?? '')
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry.split('=', 1)[0] === names[kind])
  if (entries.length !== 1) return undefined
  const token = entries[0]?.slice(entries[0].indexOf('=') + 1)
  return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : undefined
}
declare global {
  namespace Express {
    interface Locals {
      sessionIdentity?: SessionIdentity
    }
  }
}
export function createSessionHttp(
  service: SessionService,
  clock: () => Date = () => new Date(),
) {
  return {
    setCookie(res: Response, issued: IssuedSession) {
      res.cookie(names[issued.kind], issued.token, {
        ...service.cookiePolicy,
        expires: issued.expiresAt,
        maxAge: Math.max(0, issued.expiresAt.getTime() - clock().getTime()),
      })
    },
    clearCookie(res: Response, kind: SessionKind) {
      res.clearCookie(names[kind], service.cookiePolicy)
    },
    require(kind: SessionKind): RequestHandler {
      return async (req, res, next) => {
        res.locals.sessionIdentity = await service.authenticate(
          kind,
          readSessionCookie(req.get('Cookie'), kind),
        )
        next()
      }
    },
  }
}
