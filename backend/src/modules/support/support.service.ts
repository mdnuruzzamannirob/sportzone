import { createHash, randomUUID } from 'node:crypto'
import { type Connection, Types } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta, paginationSchema } from '../../shared/pagination.js'
import {
  resourceId as orderId,
  idempotencyKey as paymentInitiationKey,
} from '../../shared/validation.js'
import type { AuditAccess } from '../audit/audit.public.js'
import type {
  AdminAccountAccess,
  CheckoutAccess,
  CheckoutCredentials,
  OrderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/auth.public.js'
import type { ComplaintOrderAccess } from '../orders/order.public.js'

import { complaintModel } from './support.model.js'
import { verifyComplaintPersistence } from './support.persistence.js'
import {
  complaintAdminQuery as adminQuery,
  complaintAdminDetail,
  complaintInput,
  complaintIntakeInput,
  complaintResolution,
  complaintView,
} from './support.schema.js'

const hash = (s: string) => createHash('sha256').update(s).digest('hex')

function createComplaintService(
  connection: Connection,
  scope: OrderScopeAccess,
  orders: ComplaintOrderAccess,
  admin: AdminAccountAccess,
  auditAccess: AuditAccess,
  clock: () => Date = () => new Date(),
  publicAccess?: CheckoutAccess,
) {
  const model = complaintModel(connection),
    audit = auditAccess.write,
    lookup = auditAccess.lookup
  const view = (row: InstanceType<typeof model>) =>
    complaintView.parse({
      id: row._id.toHexString(),
      ...(row.orderId ? { orderId: row.orderId.toHexString() } : {}),
      status: row.status,
      issue: row.issue,
      createdAt: row.createdAt.toISOString(),
      ...(row.respondedAt ? { respondedAt: row.respondedAt.toISOString() } : {}),
      ...(row.resolvedAt ? { resolvedAt: row.resolvedAt.toISOString() } : {}),
      ...(row.resolution ? { resolution: row.resolution } : {}),
    })
  return {
    async intake(
      credentials: PaymentInitiationCredentials &
        CheckoutCredentials & {
          guestPresent?: boolean
        },
      raw: unknown,
      rawKey?: unknown,
    ) {
      const input = parseInput(complaintIntakeInput, raw)
      const key = rawKey === undefined ? randomUUID() : parseInput(paymentInitiationKey, rawKey)
      const run = async () => {
        const save = async (
          session: import('mongoose').ClientSession,
          actor: {
            scope: string
            userId?: string
            orderId?: string
            name?: string
            email?: string
            phone?: string
          },
        ) => {
          await verifyComplaintPersistence(connection)
          const { orderId: _orderId, ...content } = input
          const resolved = parseInput(
            complaintInput.required({ contactName: true, contactEmail: true }),
            {
              ...content,
              contactName: input.contactName ?? actor.name,
              contactEmail: input.contactEmail ?? actor.email,
              ...((input.contactPhone ?? actor.phone)
                ? { contactPhone: input.contactPhone ?? actor.phone }
                : {}),
            },
          )
          const operationKey = hash(`complaint-intake:${actor.scope}:${key}`),
            complaintId = new Types.ObjectId(operationKey.slice(0, 24)),
            digest = hash(JSON.stringify({ ...resolved, orderId: actor.orderId ?? null }))
          const cause = {
            action: 'complaint.intake',
            targetType: 'complaint',
            targetId: complaintId.toHexString(),
            operationKey,
          }
          const prior = await lookup(session, cause)
          if (prior) {
            if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return { reference: complaintId.toHexString(), status: 'open' as const }
          }
          const now = clock()
          if (!Number.isFinite(now.getTime())) throw new ApiError('STATE_CONFLICT')
          await new model({
            _id: complaintId,
            ...(actor.orderId ? { orderId: new Types.ObjectId(actor.orderId) } : {}),
            ...(actor.userId ? { userId: new Types.ObjectId(actor.userId) } : {}),
            contact: {
              name: resolved.contactName,
              emailNormalized: resolved.contactEmail.toLowerCase(),
              ...(resolved.contactPhone ? { phone: resolved.contactPhone } : {}),
            },
            issue: resolved.issue,
            status: 'open',
            contactHistory: [],
            revision: 0,
            createdAt: now,
            updatedAt: now,
          }).save({ session, timestamps: false })
          await audit(session, {
            ...cause,
            actorType: actor.userId ? 'customer' : 'guest_order',
            ...(actor.userId ? { actorId: actor.userId } : {}),
            afterDigest: digest,
            occurredAt: now,
          })
          return { reference: complaintId.toHexString(), status: 'open' as const }
        }
        const linkedOrderId = input.orderId
        if (linkedOrderId)
          return scope.owned(
            credentials,
            linkedOrderId,
            async (principal, session) => {
              const target = await orders(session, linkedOrderId, principal)
              return save(session, {
                scope: principal.kind === 'customer' ? principal.userId : principal.guestSessionId,
                ...(target.userId ? { userId: target.userId } : {}),
                orderId: linkedOrderId,
                name: target.contact.name,
                email: target.contact.emailNormalized,
                phone: target.contact.phone,
              })
            },
            true,
          )
        if (!credentials.customerPresent && (credentials.guestPresent || credentials.guestToken)) {
          return scope.ownedAny(credentials, async (principal, session) => {
            if (principal.kind !== 'guest_order') throw new ApiError('AUTH_REQUIRED')
            await scope.inSession(credentials, principal.orderId, session, true)
            const target = await orders(session, principal.orderId, principal)
            return save(session, {
              scope: principal.guestSessionId,
              name: target.contact.name,
              email: target.contact.emailNormalized,
              phone: target.contact.phone,
            })
          })
        }
        if (!publicAccess) throw new ApiError('SERVICE_UNAVAILABLE')
        return publicAccess.owned(credentials, (principal, session) =>
          save(session, {
            scope: principal.scopeKeyHash,
            ...(principal.profile
              ? {
                  userId: principal.profile.id,
                  name: principal.profile.name,
                  email: principal.profile.email,
                  ...(principal.profile.phone ? { phone: principal.profile.phone } : {}),
                }
              : {}),
          }),
        )
      }
      try {
        return await run()
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
          throw error
        return run()
      }
    },
    async mine(
      token: string | undefined,
      raw: unknown,
      customers: import('../auth/auth.public.js').CustomerAccountAccess,
    ) {
      const input = parseInput(paginationSchema, raw)
      return customers.owned(
        token,
        async (profile, { transaction: session }) => {
          await verifyComplaintPersistence(connection)
          const filter = { userId: profile.id },
            rows = await model
              .find(filter)
              .select('+issue')
              .sort({ createdAt: -1, _id: -1 })
              .skip((input.page - 1) * input.pageSize)
              .limit(input.pageSize)
              .session(session)
          return {
            items: rows.map(view),
            pagination: pageMeta(
              input,
              await model.countDocuments(filter).maxTimeMS(5000).session(session),
            ),
          }
        },
        false,
      )
    },
    async adminDetail(token: string | undefined, rawId: unknown) {
      const id = parseInput(orderId, rawId)
      return admin.owned(
        token,
        async (_actor, session) => {
          await verifyComplaintPersistence(connection)
          const row = await model.findById(id).select('+issue +contact').session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          return complaintAdminDetail.parse({
            ...view(row),
            contact: {
              name: row.contact.name,
              email: row.contact.emailNormalized,
              ...(row.contact.phone ? { phone: row.contact.phone } : {}),
            },
            contactHistory: row.contactHistory.map((event) => ({
              at: event.at.toISOString(),
              outcome: event.outcome,
            })),
            responsePolicy: { status: 'under_review' },
          })
        },
        false,
      )
    },
    async adminList(token: string | undefined, raw: unknown) {
      const query = parseInput(adminQuery, raw)
      return admin.owned(
        token,
        async (_actorId, session) => {
          await verifyComplaintPersistence(connection)
          const escaped = query.q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const filter = {
            ...(query.status ? { status: query.status } : {}),
            ...(query.orderId ? { orderId: query.orderId } : {}),
            ...(escaped ? { issue: { $regex: `^${escaped}`, $options: 'i' } } : {}),
          }
          const rows = await model
            .find(filter)
            .select('+issue')
            .sort({ createdAt: -1, _id: -1 })
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .maxTimeMS(5000)
            .session(session)
          return {
            items: rows.map(view),
            pagination: pageMeta(
              query,
              await model.countDocuments(filter).maxTimeMS(5000).session(session),
            ),
          }
        },
        false,
      )
    },
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
          .limit(41)
          .session(session)
        if (rows.length > 40) throw new ApiError('BUSINESS_RULE_VIOLATION')
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
        if (input.contactOutcome)
          await audit(session, {
            ...cause,
            action: 'complaint.response.recorded',
            actorType: 'admin',
            actorId,
            afterDigest: hash(input.contactOutcome),
            occurredAt: now,
          })
        return view(changed)
      })
    },
  }
}

export { createComplaintService }
