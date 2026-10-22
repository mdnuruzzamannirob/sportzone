import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { validateMediaPolicy, type MediaPolicy } from '../../config/media.js'
import { mediaModel, type MediaAsset } from './media.model.js'
import type { MediaAccess, MediaProvider, MediaScanner } from './media.types.js'

export type MediaDependencies = {
  provider: MediaProvider
  scanner: MediaScanner
  policy: MediaPolicy
  canDelete(asset: Readonly<MediaAsset>, session: ClientSession): Promise<boolean>
  evidence?: MediaAccess['evidence']
}

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
