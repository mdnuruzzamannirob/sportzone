import type { Connection } from 'mongoose'
import { createMediaContext } from './media.context.js'
import { createMediaUploads } from './upload.service.js'
import { createMediaAccess } from './access.service.js'
import { createMediaAttachments } from './attachment.service.js'
import { createMediaCleanup } from './cleanup.service.js'
import type { MediaDependencies } from './media.composition.js'
import type { MediaAccess } from './media.types.js'

export function createMediaService(
  connection: Connection,
  dependencies: MediaDependencies & { access: MediaAccess },
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
export type MediaService = ReturnType<typeof createMediaService>
export { verifyMediaPersistence } from './media.persistence.js'
