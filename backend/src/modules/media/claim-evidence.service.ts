import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { mediaModel } from './media.model.js'
import { verifyMediaPersistence } from './media.persistence.js'

// A scoped claim reader has already authorized the order in this same transaction.
export function claimEvidenceMetadataAccess(connection: Connection) {
  const model = mediaModel(connection)
  return async (
    session: ClientSession,
    input: {
      orderId: string
      returnId: string
      claimType: 'physical_return' | 'shortage'
      items: { orderItemId: string; assetIds: string[] }[]
    },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const all = input.items.flatMap((item) => item.assetIds)
    if (!all.length) return []
    if (new Set(all).size !== all.length) throw new ApiError('STATE_CONFLICT')
    await verifyMediaPersistence(connection)
    const rows = await model
      .find({
        _id: { $in: all.map((id) => new Types.ObjectId(id)) },
        orderId: input.orderId,
        assetKind: 'claim_evidence',
        claimType: input.claimType,
        access: 'private',
        status: 'attached',
        scanStatus: 'clean',
      })
      .session(session)
    if (rows.length !== all.length) throw new ApiError('SERVICE_UNAVAILABLE')
    return input.items.flatMap((item) =>
      item.assetIds.map((id) => {
        const row = rows.find((asset) => asset._id.toHexString() === id)
        if (
          !row?.orderItemIds.some((itemId) => itemId.toHexString() === item.orderItemId) ||
          !row.references.some(
            (ref) =>
              ref.targetType === 'claim' &&
              ref.targetId.toHexString() === input.returnId &&
              ref.slot === `item:${item.orderItemId}`,
          )
        )
          throw new ApiError('SERVICE_UNAVAILABLE')
        return {
          assetId: id,
          orderItemId: item.orderItemId,
          mimeType: row.mimeType,
          size: row.size,
        }
      }),
    )
  }
}
