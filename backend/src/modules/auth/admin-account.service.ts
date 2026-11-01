import type { Connection, ClientSession } from 'mongoose'
import { inTransaction } from '../../shared/database/transaction.js'
import { authorizeAccount } from './sessions/authorization.service.js'
import type { IdentityModels } from './auth.model.js'
import type { SessionService } from './sessions/session.service.js'

// Domain coordinators with an existing transaction reuse the same authorization fences.
export function adminTransactionAccess(
  models: IdentityModels,
  sessions: SessionService,
  clock: () => Date = () => new Date(),
) {
  return async (token: string | undefined, transaction: ClientSession) => {
    const identity = await sessions.authenticate('admin', token)
    await authorizeAccount(models, identity, 'admin', transaction, clock())
    return identity.userId.toHexString()
  }
}

export function createAdminAccountAccess(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
) {
  return {
    async owned<T>(
      token: string | undefined,
      work: (actorId: string, session: ClientSession) => Promise<T>,
      mutating = true,
    ) {
      const identity = await sessions.authenticate('admin', token)
      return inTransaction(connection, async (session) => {
        await authorizeAccount(models, identity, 'admin', session, new Date(), mutating)
        return work(identity.userId.toHexString(), session)
      })
    },
  }
}
export type AdminAccountAccess = ReturnType<typeof createAdminAccountAccess>
