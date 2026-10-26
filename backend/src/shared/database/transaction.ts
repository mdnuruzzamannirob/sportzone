import type { ClientSession, Connection } from 'mongoose'
import { AsyncLocalStorage } from 'node:async_hooks'
import { DatabaseError } from '../errors/database-error.js'

const scope = new AsyncLocalStorage<boolean>()
// Driver-supported deadline, passed through by Mongoose's transaction wrapper.
const options = {
  readPreference: 'primary',
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
  maxCommitTimeMS: 5000,
  timeoutMS: 10000,
} satisfies NonNullable<Parameters<ClientSession['withTransaction']>[1]>
// Callback may rerun. Sequential DB operations only; never provider/email/media calls.
export async function inTransaction<T>(
  connection: Connection,
  work: (session: ClientSession) => Promise<T>,
) {
  if (scope.getStore()) throw new DatabaseError('NESTED_TRANSACTION')
  return scope.run(true, () => connection.transaction(work, options))
}

export function assertOutsideTransaction() {
  if (scope.getStore()) throw new DatabaseError('EXTERNAL_EFFECT_IN_TRANSACTION')
}
