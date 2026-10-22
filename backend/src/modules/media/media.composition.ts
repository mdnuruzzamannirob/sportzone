import type { Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { createMediaService } from './media.service.js'
import type { MediaAccess, MediaProvider, MediaScanner } from './media.types.js'
import type { MediaPolicy } from '../../config/media.js'
import type { MediaAsset } from './media.model.js'
import type { ClientSession } from 'mongoose'
export type MediaDependencies = {
  provider: MediaProvider
  scanner: MediaScanner
  policy: MediaPolicy
  canDelete(asset: Readonly<MediaAsset>, session: ClientSession): Promise<boolean>
  evidence?: MediaAccess['evidence']
}
export function composeMediaService(
  connection: Connection,
  admin: MediaAccess['admin'],
  dependencies: MediaDependencies,
) {
  return createMediaService(connection, {
    ...dependencies,
    access: {
      admin,
      evidence:
        dependencies.evidence ??
        (async () => {
          throw new ApiError('FORBIDDEN')
        }),
    },
  })
}
