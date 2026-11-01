import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { auditOperationReader, createAuditWriter } from '../audit/audit.service.js'
import type { claimRestockAccess } from '../orders/order.service.js'
import type { returnReceiptService } from '../inventory/return-receipt.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { claimId, claimText } from './return.schema.js'

const receivedLine = z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) })
const inspectedLine = z.strictObject({
  orderItemId: claimId,
  acceptedQty: z.int().min(0).max(50),
  resellableQty: z.int().min(0).max(50),
  reason: claimText,
})
const uniqueLines = <T extends { orderItemId: string }>(rows: T[]) =>
  new Set(rows.map((r) => r.orderItemId)).size === rows.length
const receiveInput = z.strictObject({
  receiptReference: claimText,
  items: z.array(receivedLine).min(1).max(50).refine(uniqueLines),
  reason: claimText,
})
const inspectInput = z.strictObject({
  items: z.array(inspectedLine).min(1).max(50).refine(uniqueLines),
  reason: claimText,
})
const hash = (text: string) => createHash('sha256').update(text).digest('hex')

// Private local capability. The composition is not installed in HTTP/root wiring.
export function returnPhysicalService(
  connection: Connection,
  admin: AdminAccountAccess,
  restock: ReturnType<typeof claimRestockAccess>,
  receipt: ReturnType<typeof returnReceiptService>,
  clock: () => Date = () => new Date(),
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  async function perform(
    token: string | undefined,
    rawId: unknown,
    raw: unknown,
    rawKey: unknown,
    kind: 'receive' | 'inspect',
  ) {
    const id = parseInput(claimId, rawId),
      input = kind === 'receive' ? parseInput(receiveInput, raw) : parseInput(inspectInput, raw),
      digest = hash(JSON.stringify({ kind, input })),
      operationKey = hash(`return-physical:${id}:${parseInput(paymentInitiationKey, rawKey)}`)
    return admin.owned(token, async (actorId, session) => {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      await verifyReturnPersistence(connection)
      const row = await model.findById(id).session(session)
      if (!row) throw new ApiError('NOT_FOUND')
      const cause = {
        action: 'claim.physical.transition',
        targetType: 'return_request',
        targetId: id,
        operationKey,
      }
      const previous = await lookup(session, cause)
      if (previous) {
        if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
        return { id, status: row.status, revision: row.revision }
      }
      const now = clock()
      if (
        row.claimType !== 'physical_return' ||
        row.status !== (kind === 'receive' ? 'awaiting_return' : 'received') ||
        !Number.isFinite(now.getTime()) ||
        now < row.updatedAt ||
        row.revision >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      if (
        input.items.length !== row.items.length ||
        input.items.some(
          (i) => !row.items.some((r) => r.orderItemId.toHexString() === i.orderItemId),
        )
      )
        throw new ApiError('VALIDATION_FAILED')
      const set: Record<string, unknown> = {
        status: kind === 'receive' ? 'received' : 'inspected',
        updatedAt: now,
        reviewedBy: new Types.ObjectId(actorId),
        decisionReason: input.reason,
      }
      if (kind === 'receive') {
        const value = parseInput(receiveInput, raw)
        if (!value.items.some((i) => i.quantity > 0)) throw new ApiError('BUSINESS_RULE_VIOLATION')
        set.receivedAt = now
        set.receiptReference = value.receiptReference
        row.items.forEach((item, index) => {
          const line = value.items.find((i) => i.orderItemId === item.orderItemId.toHexString())
          if (!line || line.quantity > item.approvedUnitOrdinals.length)
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          set[`items.${index}.receivedUnitOrdinals`] = item.approvedUnitOrdinals.slice(
            0,
            line.quantity,
          )
        })
      } else {
        const value = parseInput(inspectInput, raw)
        if (!row.receivedAt || !row.receiptReference) throw new ApiError('STATE_CONFLICT')
        set.inspectedAt = now
        for (const [index, item] of row.items.entries()) {
          const line = value.items.find((i) => i.orderItemId === item.orderItemId.toHexString()),
            received = item.receivedUnitOrdinals
          if (
            !line ||
            !received ||
            line.acceptedQty > received.length ||
            line.resellableQty > line.acceptedQty
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          const accepted = received.slice(0, line.acceptedQty),
            resellable = accepted.slice(0, line.resellableQty)
          set[`items.${index}.inspectedUnitOrdinals`] = received
          set[`items.${index}.acceptedUnitOrdinals`] = accepted
          set[`items.${index}.resellableUnitOrdinals`] = resellable
          set[`items.${index}.inspectionReason`] = line.reason
          if (resellable.length) {
            const key = `return:${id}:${item.orderItemId.toHexString()}`
            const binding = await restock(session, {
              orderId: row.orderId.toHexString(),
              claimId: id,
              orderItemId: item.orderItemId.toHexString(),
              ordinals: resellable,
              operationKey: key,
            })
            await receipt(session, {
              orderId: row.orderId.toHexString(),
              claimId: id,
              orderItemId: item.orderItemId.toHexString(),
              variantId: binding.variantId,
              actorId,
              quantity: resellable.length,
            })
          }
        }
      }
      const result = await model.collection.updateOne(
        { _id: row._id, revision: row.revision, status: row.status },
        { $set: set, $inc: { revision: 1 } },
        { session },
      )
      if (result.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
      await audit(session, {
        ...cause,
        actorType: 'admin',
        actorId,
        afterDigest: digest,
        reason: input.reason,
        occurredAt: now,
      })
      return {
        id,
        status: kind === 'receive' ? ('received' as const) : ('inspected' as const),
        revision: row.revision + 1,
      }
    })
  }
  return {
    receive: (token: string | undefined, id: unknown, input: unknown, key: unknown) =>
      perform(token, id, input, key, 'receive'),
    inspect: (token: string | undefined, id: unknown, input: unknown, key: unknown) =>
      perform(token, id, input, key, 'inspect'),
  }
}
