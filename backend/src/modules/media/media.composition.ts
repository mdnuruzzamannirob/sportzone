import type { Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { createMediaService } from './media.service.js'
import type { MediaAccess } from './media.types.js'
import type { MediaDependencies } from './media-dependencies.types.js'
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
