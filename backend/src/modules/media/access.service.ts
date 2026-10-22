import type { ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { key, type MediaContext } from './media.context.js'
import type { MediaAsset } from './media.model.js'
import type { EvidenceScope, MediaOwner } from './media.types.js'

function scopeOf(asset: MediaAsset): EvidenceScope {
  if (!asset.orderId || !asset.claimType || !asset.orderItemIds.length)
    throw new ApiError('FORBIDDEN')
  return { orderId: asset.orderId, claimType: asset.claimType, orderItemIds: asset.orderItemIds }
}
function owned(owner: MediaOwner, expected: MediaAsset['owner']) {
  if (owner.kind !== expected.kind || !owner.principalId.equals(expected.principalId))
    throw new ApiError('FORBIDDEN')
}

export function createMediaAuthorization({ access }: MediaContext) {
  async function authorized(
    credential: string | undefined,
    asset: MediaAsset,
    session: ClientSession,
    admin = false,
  ) {
    const owner =
      admin || asset.assetKind === 'public_media'
        ? await access.admin(credential, session)
        : await access.evidence(credential, scopeOf(asset), session)
    if (admin || asset.assetKind === 'public_media') {
      if (owner.kind !== 'admin') throw new ApiError('FORBIDDEN')
    } else owned(owner, asset.owner)
    return owner
  }
  return authorized
}

export function createMediaAccess(context: MediaContext) {
  const { connection, model, provider, policy, clock } = context
  const authorized = createMediaAuthorization(context)
  return {
    async privateUrl(credential: string | undefined, assetId: string, admin = false) {
      assertOutsideTransaction()
      const asset = await inTransaction(connection, async (session) => {
        const saved = await model.findById(key(assetId)).session(session).orFail()
        await authorized(credential, saved, session, admin)
        if (
          saved.access !== 'private' ||
          saved.scanStatus !== 'clean' ||
          !['temporary', 'attached'].includes(saved.status) ||
          (saved.status === 'temporary' && (!saved.expiresAt || saved.expiresAt <= clock()))
        )
          throw new ApiError('FORBIDDEN')
        return saved
      })
      return {
        url: provider.privateUrl(
          asset.publicId,
          asset.format,
          new Date(clock().getTime() + policy.privateUrlTtlSeconds * 1000),
        ),
      }
    },
  }
}
