import { Types, type ClientSession, type Connection } from 'mongoose'
import { createHash } from 'node:crypto'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { createAuditWriter } from '../audit/audit.service.js'
import type { claimQuantityAccess } from '../orders/order.service.js'
import type { MediaService } from '../media/media.service.js'
import { verifyMediaPersistence } from '../media/media.service.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { claimAuthority, claimCommand } from './return.schema.js'
// Private foundation only: no root/HTTP activation before eligibility and lifecycle tasks.
export function returnService(
  connection: Connection,
  quantities: ReturnType<typeof claimQuantityAccess>,
  authorize: (
    session: ClientSession,
    command: ReturnType<typeof claimCommand.parse>,
  ) => Promise<unknown>,
  clock: () => Date = () => new Date(),
  evidence?: { attach: MediaService['attach']; credential?: string },
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection)
  return {
    async create(session: ClientSession, raw: unknown) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(claimCommand, raw)
      const authority = parseInput(claimAuthority, await authorize(session, input))
      await verifyReturnPersistence(connection)
      if (await model.exists({ _id: input.claimId }).session(session))
        throw new ApiError('STATE_CONFLICT')
      const selected = await quantities(session, input)
      const now = clock()
      if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
      const timing = authority.eligibilitySnapshot
      if (timing.deliveredAt && now < timing.deliveredAt) throw new ApiError('STATE_CONFLICT')
      if (timing.requestDeadlineAt && now > timing.requestDeadlineAt && !timing.exceptionBasis)
        throw new ApiError('BUSINESS_RULE_VIOLATION', [
          { field: 'orderId', code: 'RETURN_WINDOW_EXPIRED' },
        ])
      const evidenceIds: Types.ObjectId[][] = input.items.map(() => [])
      const allAssets = input.items.flatMap((item) => item.evidenceAssetIds ?? [])
      if (new Set(allAssets).size !== allAssets.length) throw new ApiError('VALIDATION_FAILED')
      if (allAssets.length && !evidence) throw new ApiError('SERVICE_UNAVAILABLE')
      if (allAssets.length) await verifyMediaPersistence(connection)
      for (const [index, item] of input.items.entries()) {
        for (const assetId of item.evidenceAssetIds ?? []) {
          if (!evidence) throw new ApiError('SERVICE_UNAVAILABLE')
          await evidence.attach(
            evidence.credential,
            assetId,
            {
              targetType: 'claim',
              targetId: new Types.ObjectId(input.claimId),
              slot: `item:${item.orderItemId}`,
            },
            session,
            async (asset) => {
              const ownerKind =
                authority.requestedBy.type === 'customer' ? 'customer' : 'guest_order'
              const ownerId =
                authority.requestedBy.type === 'customer' ? authority.requestedBy.id : input.orderId
              if (
                asset.assetKind !== 'claim_evidence' ||
                asset.access !== 'private' ||
                asset.orderId?.toHexString() !== input.orderId ||
                asset.claimType !== input.claimType ||
                !asset.orderItemIds.some((id) => id.toHexString() === item.orderItemId) ||
                asset.owner.kind !== ownerKind ||
                asset.owner.principalId.toHexString() !== ownerId
              )
                throw new ApiError('FORBIDDEN')
              evidenceIds[index]?.push(new Types.ObjectId(assetId))
            },
          )
        }
      }
      const row = new model({
        _id: new Types.ObjectId(input.claimId),
        orderId: new Types.ObjectId(input.orderId),
        ...authority,
        claimType: input.claimType,
        status: 'requested',
        requestedAt: now,
        revision: 0,
        items: input.items.map((item, index) => ({
          id: new Types.ObjectId(),
          orderItemId: new Types.ObjectId(item.orderItemId),
          requestedQty: item.quantity,
          reason: item.reason,
          protectedUnitOrdinals: selected[index]?.ordinals,
          approvedUnitOrdinals: [],
          evidenceRefs: evidenceIds[index],
        })),
      })
      await row.save({ session })
      await audit(session, {
        actorType: 'system',
        action: 'claim.request.create',
        targetType: 'return_request',
        targetId: input.claimId,
        operationKey: `claim:${input.claimId}`,
        afterDigest: createHash('sha256').update(JSON.stringify(input)).digest('hex'),
        occurredAt: now,
      })
      return {
        id: input.claimId,
        status: 'requested' as const,
        items: selected,
      }
    },
  }
}

// Only an inspected physical claim or an approved shortage supplies refund ordinals.
export function refundClaimSnapshotAccess(connection: Connection) {
  const model = returnModel(connection)
  return async (
    session: ClientSession,
    orderId: string,
    claimId: string,
    requested: { orderItemId: string; quantity: number }[],
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyReturnPersistence(connection)
    const row = await model.findOne({ _id: claimId, orderId }).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    if (
      (row.claimType === 'physical_return' && !['inspected', 'completed'].includes(row.status)) ||
      (row.claimType === 'shortage' && !['approved', 'completed'].includes(row.status))
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    return requested.map((line) => {
      const item = row.items.find((i) => i.orderItemId.toHexString() === line.orderItemId)
      if (!item) throw new ApiError('BUSINESS_RULE_VIOLATION')
      const ordinals =
        row.claimType === 'shortage' ? item.approvedUnitOrdinals : item.acceptedUnitOrdinals
      if (!ordinals || ordinals.length < line.quantity)
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      return { ...line, ordinals: [...ordinals] }
    })
  }
}
