import { ApiError } from '../../shared/errors/app-error.js'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { key, type MediaContext } from './media.context.js'
import { createMediaAuthorization } from './access.service.js'
import type { MediaAsset } from './media.model.js'

export function createMediaCleanup(
  context: MediaContext,
  reconcileUpload: (assetId: string) => Promise<MediaAsset['status']>,
) {
  const { connection, model, provider, canDelete, clock } = context
  const authorized = createMediaAuthorization(context)
  return {
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
            const status = await reconcileUpload(candidate._id.toHexString())
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
