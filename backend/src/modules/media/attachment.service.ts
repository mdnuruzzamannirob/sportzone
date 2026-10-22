import { Types, type ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { key, requireTransaction, type MediaContext } from './media.context.js'
import { createMediaAuthorization } from './access.service.js'
import type { MediaAsset } from './media.model.js'
import type { MediaReference } from './media.types.js'

export function createMediaAttachments(context: MediaContext) {
  const { model, policy, clock } = context
  const authorized = createMediaAuthorization(context)
  return {
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
  }
}
