import { verifyMediaPersistence } from './media.persistence.js'
import { Types, type ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { key, requireTransaction, type MediaContext } from './media.context.js'
import { createMediaAuthorization } from './access.service.js'
import type { MediaAsset } from './media.model.js'
import type { MediaReference } from './media.types.js'

export function createMediaAttachments(context: MediaContext) {
  const { model, policy, clock } = context
  const authorized = createMediaAuthorization(context)
  const attachments = {
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
  return {
    ...attachments,
    async changePublicReference(
      credential: string | undefined,
      previousPublicId: string | undefined,
      image: { publicId: string; url: string; alt: string } | null,
      reference: MediaReference,
      session: ClientSession,
      mutateTarget: (image: { publicId: string; url: string; alt: string } | null) => Promise<void>,
    ) {
      requireTransaction(session)
      try {
        await verifyMediaPersistence(context.connection)
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      const resolve = async (publicId: string) => {
        const asset = await model.findOne({ publicId }).session(session)
        if (!asset) throw new ApiError('NOT_FOUND')
        if (asset.assetKind !== 'public_media' || asset.access !== 'public')
          throw new ApiError('FORBIDDEN')
        return asset
      }
      const next = image ? await resolve(image.publicId) : undefined
      let canonical: { publicId: string; url: string; alt: string } | null = null
      if (image && next) {
        const url = context.provider.publicUrl(next.publicId, next.format)
        if (url !== image.url || !URL.canParse(url)) throw new ApiError('VALIDATION_FAILED')
        const parsed = new URL(url)
        if (
          parsed.protocol !== 'https:' ||
          parsed.username ||
          parsed.password ||
          parsed.search ||
          parsed.hash ||
          [...image.alt].length > 120
        )
          throw new ApiError('VALIDATION_FAILED')
        canonical = { publicId: next.publicId, url, alt: image.alt }
      }
      if (previousPublicId) {
        const previous = await resolve(previousPublicId)
        await attachments.detach(
          credential,
          previous._id.toHexString(),
          reference,
          session,
          async () => {
            if (!next) await mutateTarget(null)
          },
        )
      }
      if (next)
        await attachments.attach(
          credential,
          next._id.toHexString(),
          reference,
          session,
          async () => {
            await mutateTarget(canonical)
          },
        )
      else if (!previousPublicId) await mutateTarget(null)
    },
  }
}
