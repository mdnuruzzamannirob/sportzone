import { Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { key, type MediaContext } from './media.context.js'
import { createMediaAuthorization } from './access.service.js'
import type { MediaAsset } from './media.model.js'
import type { EvidenceScope, MediaFile, MediaLookup, MediaScanner } from './media.types.js'
import { inspectFile } from './media.schema.js'

export function createMediaUploads(context: MediaContext) {
  const { connection, model, access, scanner, provider, policy, clock } = context
  const authorized = createMediaAuthorization(context)
  function matches(asset: MediaAsset, result: MediaLookup) {
    return (
      result.kind === 'found' &&
      result.asset.publicId === asset.publicId &&
      result.asset.delivery === (asset.access === 'private' ? 'authenticated' : 'upload') &&
      result.asset.format === asset.format &&
      result.asset.size === asset.size &&
      result.asset.digest === asset.digest &&
      result.asset.width > 0 &&
      result.asset.height > 0 &&
      result.asset.width <= policy.maxPixels / result.asset.height
    )
  }
  async function finishUpload(assetId: Types.ObjectId, result: MediaLookup) {
    const asset = await model.findById(assetId).orFail()
    if (asset.status !== 'uploading' || result.kind === 'uncertain' || result.kind === 'missing')
      return
    await model.updateOne(
      { _id: assetId, status: 'uploading', revision: asset.revision },
      {
        $set: {
          status:
            asset.scanStatus === 'clean' && matches(asset, result) ? 'temporary' : 'quarantined',
        },
        $inc: { revision: 1 },
      },
    )
  }
  async function upload(credential: string | undefined, file: MediaFile, scope?: EvidenceScope) {
    assertOutsideTransaction()
    const metadata = inspectFile(file, policy)
    // Copy caller-owned bytes before awaiting authorization or scanning.
    const bytes = Uint8Array.from(file.bytes)
    const asset = await inTransaction(connection, async (session) => {
      const owner = scope
        ? await access.evidence(credential, scope, session)
        : await access.admin(credential, session)
      if (!scope && owner.kind !== 'admin') throw new ApiError('FORBIDDEN')
      if (
        scope &&
        (!scope.orderItemIds.length ||
          scope.orderItemIds.length > 40 ||
          new Set(scope.orderItemIds.map((value) => value.toHexString())).size !==
            scope.orderItemIds.length ||
          owner.kind === 'admin' ||
          (owner.kind === 'guest_order' && !owner.principalId.equals(scope.orderId)))
      )
        throw new ApiError('FORBIDDEN')
      const _id = new Types.ObjectId()
      return new model({
        _id,
        publicId: `sportzone/${_id.toHexString()}`,
        owner,
        ...metadata,
        ...(scope ? scope : {}),
        assetKind: scope ? 'claim_evidence' : 'public_media',
        access: scope ? 'private' : 'public',
        status: 'uploading',
        expiresAt: new Date(clock().getTime() + policy.temporaryTtlSeconds * 1000),
      }).save({ session })
    })
    let verdict: Awaited<ReturnType<MediaScanner>> = 'uncertain'
    try {
      verdict = await scanner(bytes)
    } catch {
      /* Keep an explicit quarantine, never treat scanner failure as clean. */
    }
    if (verdict !== 'clean') {
      await model.updateOne(
        { _id: asset._id, status: 'uploading' },
        {
          $set: {
            status: 'quarantined',
            scanStatus: verdict === 'rejected' ? 'rejected' : 'pending',
          },
          $inc: { revision: 1 },
        },
      )
      throw new ApiError('VALIDATION_FAILED')
    }
    await inTransaction(connection, async (session) => {
      await authorized(credential, asset, session)
      const updated = await model.updateOne(
        { _id: asset._id, status: 'uploading', scanStatus: 'pending' },
        { $set: { scanStatus: 'clean' }, $inc: { revision: 1 } },
        { session },
      )
      if (updated.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    })
    let result: MediaLookup = { kind: 'uncertain' }
    try {
      result = await provider.upload({
        publicId: asset.publicId,
        delivery: scope ? 'authenticated' : 'upload',
        file: bytes,
        format: metadata.format,
        digest: metadata.digest,
      })
    } catch {
      /* Persisted uploading intent is reconciled, never blindly replayed. */
    }
    await finishUpload(asset._id, result)
    return inTransaction(connection, async (session) => {
      const saved = await model.findById(asset._id).session(session).orFail()
      await authorized(credential, saved, session)
      if (saved.status !== 'temporary' || !saved.expiresAt || saved.expiresAt <= clock())
        throw new ApiError('SERVICE_UNAVAILABLE')
      return saved.access === 'private'
        ? {
            assetId: saved.id,
            orderId: saved.orderId?.toHexString(),
            status: 'private' as const,
            expiresAt: saved.expiresAt,
          }
        : {
            assetId: saved.id,
            publicId: saved.publicId,
            url: provider.publicUrl(saved.publicId, metadata.format),
            mimeType: saved.mimeType,
            size: saved.size,
          }
    })
  }
  return {
    uploadPublic: (credential: string | undefined, file: MediaFile) => upload(credential, file),
    uploadEvidence: (credential: string | undefined, scope: EvidenceScope, file: MediaFile) =>
      upload(credential, file, scope),
    async reconcileUpload(assetId: string) {
      assertOutsideTransaction()
      const asset = await model.findById(key(assetId)).orFail()
      if (asset.status !== 'uploading') return asset.status
      await finishUpload(
        asset._id,
        await provider.lookup(
          asset.publicId,
          asset.access === 'private' ? 'authenticated' : 'upload',
        ),
      )
      return (await model.findById(asset._id).orFail()).status
    },
  }
}
