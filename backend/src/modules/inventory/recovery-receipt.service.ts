import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { variantStockAccess } from '../catalog/variants/variant.service.js'
import { inventoryMovementModel } from './inventory.model.js'
import { verifyInventoryPersistence } from './inventory.persistence.js'
import { ApiError } from '../../shared/errors/app-error.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
const command = z.strictObject({
  orderId: id,
  orderItemId: id,
  variantId: id,
  quantity: z.int().min(1).max(50),
  actorId: id,
  inspectionDigest: z.string().regex(/^[a-f0-9]{64}$/),
})
// Only the custody/inspection coordinator may invoke this capability in its fenced transaction.
export function recoveryReceiptService(
  connection: Connection,
  clock: () => Date = () => new Date(),
) {
  const stock = variantStockAccess(connection),
    movements = inventoryMovementModel(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = command.parse(raw),
      operationKey = `nondelivery-restock:${input.orderId}:${input.orderItemId}`,
      reason = `Inspected non-delivery recovery:${input.inspectionDigest}`
    await verifyInventoryPersistence(connection)
    const existing = await movements
      .findOne({ variantId: input.variantId, type: 'return_receipt', operationKey })
      .session(session)
    if (existing) {
      if (
        existing.deltaPhysical !== input.quantity ||
        existing.reason !== reason ||
        !existing.orderId?.equals(input.orderId)
      )
        throw new ApiError('STATE_CONFLICT')
      return
    }
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    const changed = await stock.change(
      new Types.ObjectId(input.variantId),
      { physical: input.quantity, reserved: 0, committed: 0 },
      session,
    )
    if (!changed) throw new ApiError('STATE_CONFLICT')
    await new movements({
      variantId: new Types.ObjectId(input.variantId),
      orderId: new Types.ObjectId(input.orderId),
      type: 'return_receipt',
      deltaPhysical: input.quantity,
      deltaReserved: 0,
      deltaCommitted: 0,
      operationKey,
      reason,
      actor: { type: 'admin', id: new Types.ObjectId(input.actorId) },
      occurredAt: now,
    }).save({ session })
  }
}
