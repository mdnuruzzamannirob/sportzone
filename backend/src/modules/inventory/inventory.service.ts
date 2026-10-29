import type { Connection, ClientSession } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { inTransaction } from '../../shared/database/transaction.js'
import type { variantStockAccess } from '../catalog/variants/variant.service.js'
import { adjustmentInput, objectId, stockSnapshot } from './inventory.schema.js'
import { inventoryMovementModel } from './inventory.model.js'
import { verifyInventoryPersistence } from './inventory.persistence.js'

// Domain commands; inventory-admin.service owns transactional admin authorization and audit.
export function inventoryService(
  connection: Connection,
  stock: ReturnType<typeof variantStockAccess>,
  clock: () => Date = () => new Date(),
) {
  const movements = inventoryMovementModel(connection)
  return {
    async read(variantId: string, session?: ClientSession) {
      const id = objectId.safeParse(variantId)
      if (!id.success) throw new ApiError('VALIDATION_FAILED')
      const counters = await stock.read(id.data, session)
      if (!counters) throw new ApiError('NOT_FOUND')
      return stockSnapshot(counters)
    },
    async adjustPhysical(input: unknown, transaction?: ClientSession) {
      const parsed = adjustmentInput.safeParse(input)
      if (!parsed.success) throw new ApiError('VALIDATION_FAILED')
      const { variantId, actorId, deltaPhysical, operationKey, reason } = parsed.data
      await verifyInventoryPersistence(connection)
      const apply = async (session: ClientSession) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        const previous = await movements
          .findOne({ variantId, type: 'adjustment', operationKey })
          .session(session)
          .lean()
        if (previous) {
          if (
            previous.deltaPhysical !== deltaPhysical ||
            previous.deltaReserved !== 0 ||
            previous.deltaCommitted !== 0 ||
            previous.reason !== reason ||
            previous.actor.type !== 'admin' ||
            !previous.actor.id?.equals(actorId)
          )
            throw new ApiError('STATE_CONFLICT')
          return { movementId: previous._id.toHexString() }
        }
        const before = await stock.read(variantId, session)
        if (!before) throw new ApiError('NOT_FOUND')
        stockSnapshot(before)
        const now = clock()
        if (!Number.isFinite(now.getTime())) throw new Error('Invalid inventory clock.')
        const changed = await stock.change(
          variantId,
          { physical: deltaPhysical, reserved: 0, committed: 0 },
          session,
        )
        if (!changed) throw new ApiError('STATE_CONFLICT')
        stockSnapshot(changed)
        const [movement] = await movements.create(
          [
            {
              variantId,
              type: 'adjustment',
              deltaPhysical,
              deltaReserved: 0,
              deltaCommitted: 0,
              operationKey,
              reason,
              actor: { type: 'admin', id: actorId },
              occurredAt: now,
            },
          ],
          { session },
        )
        if (!movement) throw new Error('Inventory movement unavailable.')
        return { movementId: movement._id.toHexString() }
      }
      return transaction ? apply(transaction) : inTransaction(connection, apply)
    },
  }
}
