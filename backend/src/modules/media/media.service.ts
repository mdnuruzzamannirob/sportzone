import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../common/errors.js'
import { assertOutsideTransaction, inTransaction } from '../../db/transaction.js'
import { validateMediaPolicy, type MediaPolicy } from '../../config/media.js'
import { mediaModel, type MediaAsset } from './media.model.js'
import type {
  EvidenceScope,
  MediaAccess,
  MediaFile,
  MediaLookup,
  MediaOwner,
  MediaProvider,
  MediaReference,
  MediaScanner,
} from './media.types.js'
import { inspectFile } from './media.validation.js'

function key(value: string) {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new ApiError('VALIDATION_FAILED')
  return new Types.ObjectId(value)
}
function requireTransaction(session: ClientSession) {
  if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
}
function scopeOf(asset: MediaAsset): EvidenceScope {
  if (!asset.orderId || !asset.claimType || !asset.orderItemIds.length)
    throw new ApiError('FORBIDDEN')
  return { orderId: asset.orderId, claimType: asset.claimType, orderItemIds: asset.orderItemIds }
}
function owned(owner: MediaOwner, expected: MediaAsset['owner']) {
  if (owner.kind !== expected.kind || !owner.principalId.equals(expected.principalId))
    throw new ApiError('FORBIDDEN')
}
export function createMediaService(
  connection: Connection,
  dependencies: {
    access: MediaAccess
    provider: MediaProvider
    scanner: MediaScanner
    policy: MediaPolicy
    canDelete: (asset: Readonly<MediaAsset>, session: ClientSession) => Promise<boolean>
  },
  clock: () => Date = () => new Date(),
) {
  const { access, provider, scanner, canDelete } = dependencies
  const policy = validateMediaPolicy(dependencies.policy)
  const model = mediaModel(connection)
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
    async maintenanceBatch(limit = 20) {
      assertOutsideTransaction()
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
        throw new ApiError('VALIDATION_FAILED')
      const candidates = await model
        .find({
          $or: [
            { status: { $in: ['temporary', 'quarantined'] }, expiresAt: { $lte: clock() } },
            { status: { $in: ['uploading', 'deleting'] } },
          ],
        })
        .sort({ updatedAt: 1, _id: 1 })
        .limit(limit)
        .select('_id status')
        .lean()
      const report = {
        examined: candidates.length,
        deleted: 0,
        reconciled: 0,
        pending: 0,
        blocked: 0,
      }
      for (const candidate of candidates) {
        try {
          if (candidate.status === 'uploading') {
            const status = await this.reconcileUpload(candidate._id.toHexString())
            if (status === 'temporary' || status === 'quarantined') report.reconciled++
            else report.pending++
          } else if (await this.cleanup(candidate._id.toHexString())) report.deleted++
          else report.pending++
        } catch {
          report.blocked++
        }
        // Fairness only: does not change scope, deadlines, validation or a business revision.
        await model.updateOne(
          { _id: candidate._id },
          { $set: { updatedAt: clock() } },
          { timestamps: false },
        )
      }
      return report
    },
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
    // The target's own service supplies its guarded mutation in this SAME transaction.
    async attach(
      credential: string | undefined,
      assetId: string,
      reference: MediaReference,
      session: ClientSession,
      mutateTarget: (asset: Readonly<MediaAsset>, session: ClientSession) => Promise<void>,
    ) {
      requireTransaction(session)
      const asset = await model.findById(key(assetId)).session(session).orFail()
      await authorized(credential, asset, session)
      if (
        !reference.slot.trim() ||
        reference.slot.length > 128 ||
        !(reference.targetId instanceof Types.ObjectId)
      )
        throw new ApiError('VALIDATION_FAILED')
      if (
        asset.scanStatus !== 'clean' ||
        !['temporary', 'attached'].includes(asset.status) ||
        (asset.status === 'temporary' && (!asset.expiresAt || asset.expiresAt <= clock())) ||
        asset.references.length >= 40
      )
        throw new ApiError('STATE_CONFLICT')
      if ((asset.access === 'private') !== (reference.targetType === 'claim'))
        throw new ApiError('FORBIDDEN')
      if (
        asset.references.some(
          (value) =>
            value.targetId.equals(reference.targetId) &&
            value.targetType === reference.targetType &&
            value.slot === reference.slot,
        )
      )
        throw new ApiError('STATE_CONFLICT')
      if (asset.access === 'private' && asset.references.length)
        throw new ApiError('STATE_CONFLICT')
      await mutateTarget(asset, session)
      const update = await model.updateOne(
        { _id: asset._id, revision: asset.revision, status: asset.status },
        {
          $push: { references: reference },
          $set: { status: 'attached' },
          $unset: { expiresAt: 1 },
          $inc: { revision: 1 },
        },
        { session, runValidators: true },
      )
      if (update.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    },
    async detach(
      credential: string | undefined,
      assetId: string,
      reference: MediaReference,
      session: ClientSession,
      mutateTarget: (session: ClientSession) => Promise<void>,
    ) {
      requireTransaction(session)
      const asset = await model.findById(key(assetId)).session(session).orFail()
      await authorized(credential, asset, session)
      if (asset.access !== 'public' || asset.status !== 'attached') throw new ApiError('FORBIDDEN')
      const remaining = asset.references.filter(
        (value) =>
          !(
            value.targetId.equals(reference.targetId) &&
            value.targetType === reference.targetType &&
            value.slot === reference.slot
          ),
      )
      if (remaining.length === asset.references.length) throw new ApiError('STATE_CONFLICT')
      await mutateTarget(session)
      asset.set('references', remaining)
      if (!remaining.length) {
        asset.status = 'temporary'
        asset.expiresAt = new Date(clock().getTime() + policy.temporaryTtlSeconds * 1000)
      }
      asset.revision++
      await asset.save({ session })
    },
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
    async protect(
      credential: string | undefined,
      assetId: string,
      session: ClientSession,
      retainUntil?: Date,
    ) {
      requireTransaction(session)
      const asset = await model.findById(key(assetId)).session(session).orFail()
      await authorized(credential, asset, session, true)
      if (['deleting', 'deleted'].includes(asset.status)) throw new ApiError('STATE_CONFLICT')
      if (
        retainUntil &&
        (!Number.isFinite(retainUntil.getTime()) ||
          retainUntil <= clock() ||
          (asset.retainUntil && retainUntil < asset.retainUntil))
      )
        throw new ApiError('VALIDATION_FAILED')
      if (retainUntil) asset.retainUntil = retainUntil
      else asset.legalHold = true
      asset.revision++
      await asset.save({ session })
    },
    async cleanup(assetId: string, authority?: { adminCredential: string | undefined }) {
      assertOutsideTransaction()
      const claimed = await inTransaction(connection, async (session) => {
        const asset = await model.findById(key(assetId)).session(session).orFail()
        if (authority) await authorized(authority.adminCredential, asset, session, true)
        if (asset.status === 'deleted') return { asset, fresh: false, done: true }
        if (asset.status === 'deleting') return { asset, fresh: false }
        if (
          !['temporary', 'quarantined'].includes(asset.status) ||
          asset.references.length ||
          !asset.expiresAt ||
          (!authority && asset.expiresAt > clock()) ||
          asset.legalHold ||
          (asset.retainUntil && asset.retainUntil > clock()) ||
          !(await canDelete(asset, session))
        )
          throw new ApiError('STATE_CONFLICT')
        const changed = await model.findOneAndUpdate(
          {
            _id: asset._id,
            revision: asset.revision,
            status: asset.status,
            references: { $size: 0 },
          },
          { $set: { status: 'deleting' }, $inc: { revision: 1 } },
          { session, returnDocument: 'after' },
        )
        if (!changed) throw new ApiError('STATE_CONFLICT')
        return { asset: changed, fresh: true }
      })
      if ('done' in claimed && claimed.done) return true
      // Recheck policy after claiming. Holds/references must use the same asset CAS boundary.
      const alreadyDeleted = await inTransaction(connection, async (session) => {
        const current = await model.findById(claimed.asset._id).session(session).orFail()
        if (current.status === 'deleted') return true
        if (
          current.status !== 'deleting' ||
          current.references.length ||
          current.legalHold ||
          (current.retainUntil && current.retainUntil > clock()) ||
          !(await canDelete(current, session))
        )
          throw new ApiError('STATE_CONFLICT')
        return false
      })
      if (alreadyDeleted) return true
      const delivery = claimed.asset.access === 'private' ? 'authenticated' : 'upload'
      const result = await provider.lookup(claimed.asset.publicId, delivery)
      let deleted = result.kind === 'missing'
      if (claimed.fresh && result.kind === 'found')
        deleted = (await provider.remove(claimed.asset.publicId, delivery)) === 'deleted'
      if (!deleted) return false // Uncertain deletion: lookup only on later runs, no blind retry.
      await model.updateOne(
        { _id: claimed.asset._id, status: 'deleting', revision: claimed.asset.revision },
        { $set: { status: 'deleted', deletedAt: clock() }, $inc: { revision: 1 } },
      )
      return true
    },
  }
}
export type MediaService = ReturnType<typeof createMediaService>
export { verifyMediaPersistence } from './media.persistence.js'
