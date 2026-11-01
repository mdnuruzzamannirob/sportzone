import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { auditOperationReader, createAuditWriter } from '../audit/audit.service.js'
import type { claimReviewQuantityAccess } from '../orders/order.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { returnModel } from './return.model.js'
import { verifyReturnPersistence } from './return.persistence.js'
import { claimId, claimText } from './return.schema.js'

const command = z.strictObject({
  to: z.enum(['under_review', 'approved', 'awaiting_return', 'rejected', 'completed']),
  reason: claimText,
  approvedItems: z
    .array(z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) }))
    .min(1)
    .max(50)
    .refine((items) => new Set(items.map((i) => i.orderItemId)).size === items.length)
    .optional(),
})
const hash = (value: string) => createHash('sha256').update(value).digest('hex')

// Private local composition. Receipt/inspection, private evidence and HTTP remain disabled
// until their protected capabilities and task prerequisites are independently accepted.
export function returnLifecycleService(
  connection: Connection,
  admin: AdminAccountAccess,
  quantities: ReturnType<typeof claimReviewQuantityAccess>,
  clock: () => Date = () => new Date(),
  notify?: (
    session: import('mongoose').ClientSession,
    event: {
      orderId: string
      returnId: string
      from: 'under_review' | 'approved' | 'inspected'
      to: 'approved' | 'rejected' | 'completed'
      operationKey: string
      occurredAt: Date
    },
  ) => Promise<void>,
) {
  const model = returnModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  return {
    async transition(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const id = parseInput(claimId, rawId),
        input = parseInput(command, raw),
        operationKey = hash(`claim:${id}:${parseInput(paymentInitiationKey, rawKey)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
        await verifyReturnPersistence(connection)
        const row = await model.findById(id).session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
          action: 'claim.lifecycle.transition',
          targetType: 'return_request',
          targetId: id,
          operationKey,
        }
        const previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return { id, status: row.status, revision: row.revision }
        }
        const allowed =
          (row.status === 'requested' && input.to === 'under_review') ||
          (row.status === 'under_review' && ['approved', 'rejected'].includes(input.to)) ||
          (row.status === 'approved' &&
            row.claimType === 'physical_return' &&
            input.to === 'awaiting_return') ||
          (row.status === 'inspected' &&
            row.claimType === 'physical_return' &&
            input.to === 'completed') ||
          (row.status === 'approved' && row.claimType === 'shortage' && input.to === 'completed')
        const now = clock()
        if (
          !allowed ||
          !Number.isFinite(now.getTime()) ||
          now < row.updatedAt ||
          now < row.requestedAt ||
          row.revision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        if ((input.to === 'approved') !== Boolean(input.approvedItems))
          throw new ApiError('VALIDATION_FAILED')
        if (
          row.claimType === 'physical_return' &&
          input.to === 'completed' &&
          (!row.receivedAt ||
            !row.inspectedAt ||
            row.items.some(
              (item) =>
                !item.acceptedUnitOrdinals ||
                item.acceptedUnitOrdinals.length !== item.approvedUnitOrdinals.length,
            ))
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        if (
          input.approvedItems &&
          (input.approvedItems.length !== row.items.length ||
            input.approvedItems.some(
              (i) =>
                !row.items.some(
                  (r) =>
                    r.orderItemId.toHexString() === i.orderItemId && i.quantity <= r.requestedQty,
                ),
            ) ||
            !input.approvedItems.some((i) => i.quantity > 0))
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        const items = row.items.map((item) => {
          const requested = input.approvedItems?.find(
            (i) => i.orderItemId === item.orderItemId.toHexString(),
          )
          const approved =
            input.to === 'rejected'
              ? []
              : requested
                ? item.protectedUnitOrdinals.slice(0, requested.quantity)
                : [...item.approvedUnitOrdinals]
          return {
            orderItemId: item.orderItemId.toHexString(),
            protected:
              input.to === 'completed'
                ? [...item.approvedUnitOrdinals]
                : [...item.protectedUnitOrdinals],
            approved,
          }
        })
        if (['approved', 'rejected', 'completed'].includes(input.to))
          await quantities(session, {
            orderId: row.orderId.toHexString(),
            claimId: id,
            items,
            resolve: input.to === 'completed',
          })
        const set: Record<string, unknown> = {
          status: input.to,
          updatedAt: now,
          reviewedBy: new Types.ObjectId(actorId),
          decisionReason: input.reason,
        }
        if (input.to === 'approved') {
          set.approvedAt = now
          items.forEach((item, index) => {
            set[`items.${index}.approvedUnitOrdinals`] = item.approved
          })
        }
        if (input.to === 'completed') set.completedAt = now
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
        await audit(session, {
          ...cause,
          action: `claim.lifecycle.${row.status}.${input.to}`,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        if (
          notify &&
          (input.to === 'approved' || input.to === 'rejected' || input.to === 'completed')
        ) {
          if (
            row.status !== 'under_review' &&
            row.status !== 'approved' &&
            row.status !== 'inspected'
          )
            throw new ApiError('STATE_CONFLICT')
          await notify(session, {
            orderId: row.orderId.toHexString(),
            returnId: id,
            from: row.status,
            to: input.to,
            operationKey,
            occurredAt: now,
          })
        }
        return { id, status: input.to, revision: row.revision + 1 }
      })
    },
  }
}
