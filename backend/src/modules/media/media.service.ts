import { type Connection, Types } from 'mongoose'
import { createMediaAccess } from './access.service.js'
import { createMediaAttachments } from './attachment.service.js'
import { createMediaCleanup } from './cleanup.service.js'
import { createMediaContext, type MediaDependencies } from './media.context.js'
import { verifyMediaPersistence } from './media.persistence.js'
import type { ClaimMediaAccess } from './media.public.js'
import type { MediaAccess } from './media.types.js'
import { createMediaUploads } from './upload.service.js'

type MediaService = ReturnType<typeof createMediaService>

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
    verifyPersistence: () => verifyMediaPersistence(connection),
    ...uploads,
    ...createMediaAccess(context),
    ...createMediaAttachments(context),
    ...createMediaCleanup(context, uploads.reconcileUpload),
  }
}

// The claim boundary maps private storage identities to immutable DTOs in the same transaction.
function createClaimMediaAccess(service: MediaService): ClaimMediaAccess {
  return {
    verifyPersistence: service.verifyPersistence,
    privateUrl: service.privateUrl,
    attach(credential, assetId, reference, session, mutateTarget) {
      return service.attach(
        credential,
        assetId,
        { ...reference, targetId: new Types.ObjectId(reference.targetId) },
        session,
        (asset, transaction) =>
          mutateTarget(
            {
              assetKind: asset.assetKind,
              access: asset.access,
              ...(asset.orderId ? { orderId: asset.orderId.toHexString() } : {}),
              ...(asset.claimType ? { claimType: asset.claimType } : {}),
              orderItemIds: asset.orderItemIds.map((id) => id.toHexString()),
              owner: { kind: asset.owner.kind, principalId: asset.owner.principalId.toHexString() },
            },
            transaction,
          ),
      )
    },
    uploadEvidence(credential, scope, file) {
      return service.uploadEvidence(
        credential,
        {
          ...scope,
          orderId: new Types.ObjectId(scope.orderId),
          orderItemIds: scope.orderItemIds.map((id) => new Types.ObjectId(id)),
        },
        file,
      )
    },
  }
}

export type { MediaDependencies } from './media.context.js'
export { verifyMediaPersistence } from './media.persistence.js'
export type { MediaService }
export { createClaimMediaAccess, createMediaService }
