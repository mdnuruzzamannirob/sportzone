import type { ClientSession } from 'mongoose'
import type { IdentityModels } from './auth.model.js'
import type { SessionService } from './sessions/session.service.js'
import { authorizeAccount } from './sessions/authorization.service.js'
import type { MediaOwner } from '../media/media.types.js'
export function createMediaAdminAccess(
  models: IdentityModels,
  sessions: SessionService,
  clock: () => Date = () => new Date(),
) {
  return async (
    credential: string | undefined,
    transaction: ClientSession,
  ): Promise<MediaOwner> => {
    const identity = await sessions.authenticate('admin', credential)
    await authorizeAccount(models, identity, 'admin', transaction, clock())
    return { kind: 'admin', principalId: identity.userId }
  }
}
