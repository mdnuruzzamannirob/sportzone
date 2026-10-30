import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/checkout-access.service.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { complaintOrderAccess } from '../orders/order.service.js'
import { orderId } from '../orders/order.schema.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { complaintInput, complaintResolution, complaintView } from './complaint.schema.js'
import { complaintModel } from './complaint.model.js'
import { verifyComplaintPersistence } from './complaint.persistence.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
const hash = (s: string) => createHash('sha256').update(s).digest('hex')
export function complaintService(
  connection: Connection,
  scope: ReturnType<typeof orderScopeAccess>,
  orders: ReturnType<typeof complaintOrderAccess>,
  admin: AdminAccountAccess,
  clock: () => Date = () => new Date(),
) {
  const model = complaintModel(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  const view = (row: InstanceType<typeof model>) =>
    complaintView.parse({
      id: row._id.toHexString(),
      orderId: row.orderId.toHexString(),
      status: row.status,
      issue: row.issue,
      createdAt: row.createdAt.toISOString(),
      ...(row.respondedAt ? { respondedAt: row.respondedAt.toISOString() } : {}),
      ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
      ...(row.resolution ? { resolution: row.resolution } : {}),
    })
  return {
    async submit(credentials: PaymentInitiationCredentials, rawId: unknown, raw: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(complaintInput, raw),
        complaintId = new Types.ObjectId()
      return scope.owned(
        credentials,
        id,
        async (principal, session) => {
          await verifyComplaintPersistence(connection)
          const target = await orders(session, id, principal),
            now = clock()
          if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
          const row = new model({
            _id: complaintId,
            orderId: target.orderId,
            ...(target.userId ? { userId: target.userId } : {}),
            contact: {
              name: input.contactName ?? target.contact.name,
              emailNormalized: input.contactEmail?.toLowerCase() ?? target.contact.emailNormalized,
              phone: input.contactPhone ?? target.contact.phone,
            },
            issue: input.issue,
            status: 'open',
            contactHistory: [],
            revision: 0,
            createdAt: now,
            updatedAt: now,
          })
          await row.save({ session })
          await audit(session, {
            actorType: principal.kind,
            ...(principal.kind === 'customer' ? { actorId: principal.userId } : {}),
            action: 'complaint.submit',
            targetType: 'complaint',
            targetId: row._id.toHexString(),
            operationKey: `complaint:${row._id}`,
            afterDigest: hash(JSON.stringify({ orderId: id, issue: input.issue })),
            occurredAt: now,
          })
          return view(row)
        },
        true,
      )
    },
    async list(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const id = parseInput(orderId, rawId)
      return scope.owned(credentials, id, async (principal, session) => {
        await orders(session, id, principal)
        await verifyComplaintPersistence(connection)
        const rows = await model
          .find({ orderId: id })
          .select('+issue')
          .sort({ createdAt: -1, _id: -1 })
          .limit(40)
          .session(session)
        return rows.map(view)
      })
    },
    async resolve(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      const id = parseInput(orderId, rawId),
        input = parseInput(complaintResolution, raw),
        operationKey = hash(`complaint-resolution:${id}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input))
      return admin.owned(token, async (actorId, session) => {
        await verifyComplaintPersistence(connection)
        const row = await model.findById(id).select('+issue').session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
            action: 'complaint.resolve',
            targetType: 'complaint',
            targetId: id,
            operationKey,
          },
          previous = await lookup(session, cause)
        if (previous) {
          if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return view(row)
        }
        const edges = {
            open: ['in_review', 'resolved'],
            in_review: ['resolved'],
            resolved: ['closed'],
            closed: [],
          },
          now = clock()
        if (
          !edges[row.status].some((next) => next === input.status) ||
          row.revision >= Number.MAX_SAFE_INTEGER ||
          !Number.isFinite(now.getTime()) ||
          now < row.createdAt ||
          (input.status === 'resolved' && !input.contactOutcome)
        )
          throw new ApiError('STATE_CONFLICT')
        const changed = await model
          .findOneAndUpdate(
            { _id: row._id, status: row.status, revision: row.revision },
            {
              $set: {
                status: input.status,
                resolution: input.resolution,
                assignedTo: new Types.ObjectId(actorId),
                ...(input.contactOutcome ? { respondedAt: row.respondedAt ?? now } : {}),
                ...(input.status === 'resolved' ? { resolvedAt: now } : {}),
                contactHistory: [
                  ...row.contactHistory.slice(input.contactOutcome ? -39 : -40),
                  ...(input.contactOutcome ? [{ at: now, outcome: input.contactOutcome }] : []),
                ],
              },
              $inc: { revision: 1 },
            },
            { session, returnDocument: 'after' },
          )
          .select('+issue')
        if (!changed) throw new ApiError('STATE_CONFLICT')
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.resolution,
          occurredAt: now,
        })
        return view(changed)
      })
    },
  }
}
