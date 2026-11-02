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

// Returns owns cumulative physical batches; root composition supplies current-admin access.
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
      if (kind === 'receive') {
        const ref = parseInput(receiveInput, raw).receiptReference
        const original = await lookup(session, {
          ...cause,
          action: 'claim.receipt.reference',
          operationKey: hash(`receipt:${id}:${ref}`),
        })
        if (original) {
          if (original.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: clock(),
          })
          return { id, status: row.status, revision: row.revision }
        }
      }
      const now = clock()
      if (
        row.claimType !== 'physical_return' ||
        !(
          kind === 'receive' ? ['awaiting_return', 'received', 'inspected'] : ['received']
        ).includes(row.status) ||
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
          const previous = item.receivedUnitOrdinals ?? []
          const pending = item.approvedUnitOrdinals.filter((n) => !previous.includes(n))
          if (!line || line.quantity > pending.length) throw new ApiError('BUSINESS_RULE_VIOLATION')
          set[`items.${index}.receivedUnitOrdinals`] = [
            ...previous,
            ...pending.slice(0, line.quantity),
          ]
        })
      } else {
        const value = parseInput(inspectInput, raw)
        if (!row.receivedAt || !row.receiptReference) throw new ApiError('STATE_CONFLICT')
        set.inspectedAt = now
        let newlyInspected = 0
        for (const [index, item] of row.items.entries()) {
          const line = value.items.find((i) => i.orderItemId === item.orderItemId.toHexString()),
            received = item.receivedUnitOrdinals,
            priorInspected = item.inspectedUnitOrdinals ?? [],
            pending = (received ?? []).filter((n) => !priorInspected.includes(n))
          if (
            !line ||
            !received ||
            line.acceptedQty > pending.length ||
            line.resellableQty > line.acceptedQty
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          newlyInspected += pending.length
          const accepted = pending.slice(0, line.acceptedQty),
            resellable = accepted.slice(0, line.resellableQty)
          set[`items.${index}.inspectedUnitOrdinals`] = received
          set[`items.${index}.acceptedUnitOrdinals`] = [
            ...(item.acceptedUnitOrdinals ?? []),
            ...accepted,
          ]
          set[`items.${index}.resellableUnitOrdinals`] = [
            ...(item.resellableUnitOrdinals ?? []),
            ...resellable,
          ]
          if (pending.length) {
            set[`items.${index}.inspectionReason`] = line.reason
            await audit(session, {
              ...cause,
              action: 'claim.inspection.item',
              operationKey: hash(`${operationKey}:${item.orderItemId}`),
              actorType: 'admin',
              actorId,
              afterDigest: hash(JSON.stringify({ pending, accepted, resellable })),
              reason: line.reason,
              occurredAt: now,
            })
          }
          if (resellable.length) {
            const batchKey = priorInspected.length ? operationKey : undefined
            const key = `return:${id}:${item.orderItemId.toHexString()}${batchKey ? `:${batchKey}` : ''}`
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
              ...(batchKey ? { batchKey } : {}),
            })
          }
        }
        if (!newlyInspected) throw new ApiError('STATE_CONFLICT')
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
      if (kind === 'receive')
        await audit(session, {
          ...cause,
          action: 'claim.receipt.reference',
          operationKey: hash(`receipt:${id}:${parseInput(receiveInput, raw).receiptReference}`),
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: parseInput(receiveInput, raw).receiptReference,
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
