import { sessionCookies } from '../../src/modules/auth/auth.composition.js'
import type { SessionHttp } from '../../src/modules/auth/auth.public.js'
import { createSessionHttp } from '../../src/modules/auth/sessions/session.http.js'
import type { SessionService } from '../../src/modules/auth/sessions/session.service.js'

function sessionHttpFor(sessions: SessionService): SessionHttp {
  return { ...createSessionHttp(sessions), ...sessionCookies }
}

export { sessionHttpFor }
