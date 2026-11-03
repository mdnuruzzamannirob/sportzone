import { type ClientSession, type Connection, Types } from 'mongoose'
import { type MediaPolicy, validateMediaPolicy } from '../../config/media.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { type MediaAsset, mediaModel } from './media.model.js'
import type { MediaAccess, MediaProvider, MediaScanner } from './media.types.js'

type MediaDependencies = {
  provider: MediaProvider
  scanner: MediaScanner
  policy: MediaPolicy
  canDelete(asset: Readonly<MediaAsset>, session: ClientSession): Promise<boolean>
  evidence?: MediaAccess['evidence']
}

type MediaContext = ReturnType<typeof createMediaContext>

function key(value: string) {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ApiError('VALIDATION_FAILED')
  return new Types.ObjectId(value)
}

function requireTransaction(session: ClientSession) {
  if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
}

function createMediaContext(
  connection: Connection,
  dependencies: MediaDependencies & {
    access: MediaAccess
  },
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

export type { MediaContext, MediaDependencies }
export { createMediaContext, key, requireTransaction }
