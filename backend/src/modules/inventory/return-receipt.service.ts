import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { variantStockAccess } from '../catalog/variants/variant.service.js'
import { inventoryMovementModel } from './inventory.model.js'
import { verifyInventoryPersistence } from './inventory.persistence.js'
import { ApiError } from '../../shared/errors/app-error.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const command = z.strictObject({
  orderId: id,
  claimId: id,
  orderItemId: id,
  variantId: id,
  actorId: id,
  quantity: z.int().min(1).max(50),
  batchKey: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
})
// Only the return inspection coordinator calls this inside its fenced transaction.
export function returnReceiptService(connection: Connection, clock: () => Date = () => new Date()) {
  const stock = variantStockAccess(connection),
    movements = inventoryMovementModel(connection)
  return async (session: ClientSession, raw: unknown) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    const input = command.parse(raw),
      operationKey = `return:${input.claimId}:${input.orderItemId}${input.batchKey ? `:${input.batchKey}` : ''}`
    await verifyInventoryPersistence(connection)
    if (
      await movements
        .exists({ variantId: input.variantId, type: 'return_receipt', operationKey })
        .session(session)
    )
      throw new ApiError('STATE_CONFLICT')
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
    if (
      !(await stock.change(
        new Types.ObjectId(input.variantId),
        { physical: input.quantity, reserved: 0, committed: 0 },
        session,
      ))
    )
      throw new ApiError('STATE_CONFLICT')
    await new movements({
      variantId: new Types.ObjectId(input.variantId),
      orderId: new Types.ObjectId(input.orderId),
      type: 'return_receipt',
      deltaPhysical: input.quantity,
      deltaReserved: 0,
      deltaCommitted: 0,
      operationKey,
      reason: 'Inspected resellable return',
      actor: { type: 'admin', id: new Types.ObjectId(input.actorId) },
      occurredAt: now,
    }).save({ session })
  }
}
