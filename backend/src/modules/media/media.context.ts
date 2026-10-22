import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { validateMediaPolicy } from '../../config/media.js'
import { mediaModel } from './media.model.js'
import type { MediaDependencies } from './media.composition.js'
import type { MediaAccess } from './media.types.js'

export function key(value: string) {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ApiError('VALIDATION_FAILED')
  return new Types.ObjectId(value)
}
export function requireTransaction(session: ClientSession) {
  if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
}

export function createMediaContext(
  connection: Connection,
  dependencies: MediaDependencies & { access: MediaAccess },
  clock: () => Date,
) {
  const policy = validateMediaPolicy(dependencies.policy)
  return {
    ...dependencies,
    connection,
    model: mediaModel(connection),
    policy,
    clock,
  }
}
export type MediaContext = ReturnType<typeof createMediaContext>
