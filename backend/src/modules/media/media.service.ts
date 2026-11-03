import type { Connection } from 'mongoose'
import { createMediaContext, type MediaDependencies } from './media.context.js'
import { createMediaUploads } from './upload.service.js'
import { createMediaAccess } from './access.service.js'
import { createMediaAttachments } from './attachment.service.js'
import { createMediaCleanup } from './cleanup.service.js'
import type { MediaAccess } from './media.types.js'

function createMediaService(
  connection: Connection,
  dependencies: MediaDependencies & {
    access: MediaAccess
  },
  clock: () => Date = () => new Date(),
) {
  const context = createMediaContext(connection, dependencies, clock)
  const uploads = createMediaUploads(context)
  return {
    ...uploads,
    ...createMediaAccess(context),
    ...createMediaAttachments(context),
    ...createMediaCleanup(context, uploads.reconcileUpload),
  }
}

type MediaService = ReturnType<typeof createMediaService>

export { verifyMediaPersistence } from './media.persistence.js'
export type { MediaDependencies } from './media.context.js'
export { createMediaService }
export type { MediaService }
