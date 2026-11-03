import type { ClientSession, Connection } from 'mongoose'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { key, type MediaContext } from './media.context.js'
import { type MediaAsset, mediaModel } from './media.model.js'
import type { PublicImageCandidate } from './media.public.js'
import type { EvidenceScope, MediaOwner, MediaProvider } from './media.types.js'

function scopeOf(asset: MediaAsset): EvidenceScope {
  if (!asset.orderId || !asset.claimType || !asset.orderItemIds.length)
    throw new ApiError('FORBIDDEN')
  return { orderId: asset.orderId, claimType: asset.claimType, orderItemIds: asset.orderItemIds }
}

function owned(owner: MediaOwner, expected: MediaAsset['owner']) {
  if (owner.kind !== expected.kind || !owner.principalId.equals(expected.principalId))
    throw new ApiError('FORBIDDEN')
}

function createMediaAuthorization({ access }: MediaContext) {
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

function createMediaAccess(context: MediaContext) {
  const { connection, model, provider, policy, clock } = context
  const authorized = createMediaAuthorization(context)
  return {
    async privateUrl(credential: string | undefined, assetId: string, admin = false) {
      assertOutsideTransaction()
      const asset = await inTransaction(connection, async (session) => {
        const saved = await model.findById(key(assetId)).session(session)
        if (!saved) throw new ApiError('NOT_FOUND')
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

// Read-only publication boundary: never reuse a caller/stored URL or sign private delivery.
function createPublicMediaService(
  connection: Connection,
  provider?: Pick<MediaProvider, 'publicUrl'>,
) {
  return async (candidates: readonly PublicImageCandidate[]) => {
    const images = new Map<
      string,
      Map<
        string,
        {
          url: string
          alt: string
        }
      >
    >()
    if (!provider || !candidates.length) return images
    if (candidates.length > 100) throw new RangeError('Public media batch is too large')
    const model = mediaModel(connection)
    try {
      await verifyDeclaredIndexes(model)
    } catch {
      return images
    }
    const rows = await model
      .find({
        publicId: { $in: candidates.map((candidate) => candidate.publicId) },
        assetKind: 'public_media',
        access: 'public',
        status: 'attached',
        scanStatus: 'clean',
      })
      .select('publicId format references')
      .maxTimeMS(3000)
      .lean()
    for (const candidate of candidates) {
      const row = rows.find(
        (row) =>
          row.publicId === candidate.publicId &&
          (candidate.targetType !== 'store_settings' ||
            candidate.slot !== 'homepageBanner' ||
            row._id.equals(candidate.assetId)) &&
          row.references.some(
            (ref) =>
              ref.targetType === candidate.targetType &&
              ref.targetId.equals(candidate.targetId) &&
              (candidate.targetType !== 'store_settings' || ref.slot === candidate.slot),
          ),
      )
      if (!row) continue
      if (!candidate.alt.trim() || [...candidate.alt].length > 120) continue
      const generated = provider.publicUrl(row.publicId, row.format)
      if (!URL.canParse(generated)) continue
      const url = new URL(generated)
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash)
        continue
      const target = candidate.targetId
      const assets =
        images.get(target) ??
        new Map<
          string,
          {
            url: string
            alt: string
          }
        >()
      assets.set(candidate.publicId, { url: url.href, alt: candidate.alt })
      images.set(target, assets)
    }
    return images
  }
}

export type { PublicImageCandidate }
export { createMediaAccess, createMediaAuthorization, createPublicMediaService }
