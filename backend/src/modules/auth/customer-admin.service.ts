import { customerAdminView, customerPrivacyView } from './customer-admin.schema.js'
import {
  customerAdminQuery as querySchema,
  customerStatusDecision as decisionSchema,
  customerPrivacyDecision,
} from './customer-admin.schema.js'
import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { IdentityModels } from './auth.model.js'
import type {
  AdminAccountAccess,
  CustomerAdministration,
  CustomerHistories,
} from './auth.public.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { createHash } from 'node:crypto'
import type { AuditWriter, AuditOperationReader } from '../audit/audit.public.js'
import { pageMeta } from '../../shared/pagination.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const keySchema = z
  .string()
  .min(1)
  .max(128)
  .refine(
    (v) => v === v.trim() && [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
  )
function maskedEmail(email: string) {
  const at = email.lastIndexOf('@')
  if (at <= 0) throw new ApiError('SERVICE_UNAVAILABLE')
  return `${email[0]}***@${email.slice(at + 1)}`
}
// Private administration capability; deletion and financial history remain separately authorized.
function customerAdminService(
  connection: Connection,
  models: IdentityModels,
  admins: AdminAccountAccess,
  audit: AuditWriter,
  lookup: AuditOperationReader,
  clock: () => Date = () => new Date(),
  histories?: CustomerHistories,
): CustomerAdministration {
  const view = (row: InstanceType<IdentityModels['users']>) =>
    customerAdminView.parse({
      id: row._id.toHexString(),
      name: row.name,
      emailMasked: maskedEmail(row.emailNormalized),
      ...(row.phone ? { phoneMasked: `***${row.phone.slice(-2)}` } : {}),
      status: row.status,
      emailVerified: !!row.emailVerifiedAt,
      createdAt: row.createdAt.toISOString(),
    })
  return {
    async history(
      token: string | undefined,
      rawId: unknown,
      kind: 'orders' | 'claims' | 'refunds',
      raw: unknown,
    ) {
      const customerId = parseInput(id, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyIdentityPersistence(connection, models)
          if (!(await models.users.exists({ _id: customerId, role: 'customer' }).session(session)))
            throw new ApiError('NOT_FOUND')
          if (!histories) throw new ApiError('SERVICE_UNAVAILABLE')
          return histories(session, customerId, kind, raw)
        },
        false,
      )
    },
    async privacy(token: string | undefined, rawId: unknown) {
      const customerId = parseInput(id, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          const row = await models.users
            .findOne({ _id: customerId, role: 'customer' })
            .session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          const request = row.deletionRequest
          return customerPrivacyView.parse({
            customerId,
            request: request
              ? {
                  id: request.id.toHexString(),
                  status: request.status,
                  requestedAt: request.requestedAt.toISOString(),
                  verifiedAt: request.verifiedAt.toISOString(),
                  ...(request.decisionAt ? { decisionAt: request.decisionAt.toISOString() } : {}),
                }
              : null,
            retention: 'required_order_financial_audit_and_legal_hold_records_retained',
          })
        },
        false,
      )
    },
    async decidePrivacy(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const customerId = parseInput(id, rawId),
        input = parseInput(customerPrivacyDecision, raw),
        key = parseInput(keySchema, rawKey),
        digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      return admins.owned(token, async (actorId, session) => {
        await verifyIdentityPersistence(connection, models)
        const row = await models.users
          .findOne({ _id: customerId, role: 'customer' })
          .select('+securityRevision')
          .session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const cause = {
          action: 'customer.privacy.decision',
          targetType: 'customer',
          targetId: customerId,
          operationKey: createHash('sha256')
            .update(`privacy:${actorId}:${customerId}:${key}`)
            .digest('hex'),
        }
        const prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return { status: row.deletionRequest?.status, retained: true }
        }
        const request = row.deletionRequest,
          now = clock()
        if (
          !Number.isFinite(now.getTime()) ||
          !request ||
          !['requested', 'under_review'].includes(request.status) ||
          !request.verifiedAt ||
          request.verifiedAt < request.requestedAt ||
          request.verifiedAt > now ||
          now < row.createdAt ||
          !Number.isSafeInteger(row.securityRevision) ||
          row.securityRevision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('BUSINESS_RULE_VIOLATION')
        const status =
          input.decision === 'approve_deactivation'
            ? 'approved'
            : input.decision === 'reject'
              ? 'rejected'
              : 'under_review'
        const changed = await models.users.updateOne(
          {
            _id: row._id,
            securityRevision: row.securityRevision,
            'deletionRequest.status': request.status,
          },
          {
            $set: {
              'deletionRequest.status': status,
              'deletionRequest.decisionAt': now,
              'deletionRequest.decisionReason': input.reason,
              ...(input.decision === 'approve_deactivation' ? { status: 'deactivated' } : {}),
            },
            ...(input.decision === 'approve_deactivation' ? { $inc: { securityRevision: 1 } } : {}),
          },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        if (input.decision === 'approve_deactivation')
          await models.sessions.updateMany(
            { userId: row._id, kind: 'customer', revokedAt: { $exists: false } },
            { $set: { revokedAt: now } },
            { session },
          )
        await audit(session, {
          ...cause,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return { status, retained: true }
      })
    },
    async list(token: string | undefined, raw: unknown) {
      const query = parseInput(querySchema, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyIdentityPersistence(connection, models)
          const prefix = query.q?.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          const filter = {
            role: 'customer' as const,
            ...(query.status ? { status: query.status } : {}),
            ...(prefix
              ? {
                  $or: [
                    { name: { $regex: `^${prefix}`, $options: 'i' } },
                    { emailNormalized: { $regex: `^${prefix.toLowerCase()}` } },
                  ],
                }
              : {}),
          }
          const rows = await models.users
            .find(filter)
            .select('name emailNormalized phone status emailVerifiedAt createdAt')
            .sort({ createdAt: -1, _id: -1 })
            .skip((query.page - 1) * query.pageSize)
            .limit(query.pageSize)
            .session(session)
          return {
            items: rows.map(view),
            pagination: pageMeta(query, await models.users.countDocuments(filter).session(session)),
          }
        },
        false,
      )
    },
    async decideStatus(token: string | undefined, rawId: unknown, raw: unknown, rawKey: unknown) {
      const customerId = parseInput(id, rawId),
        input = parseInput(decisionSchema, raw),
        key = parseInput(keySchema, rawKey)
      const digest = createHash('sha256').update(JSON.stringify(input)).digest('hex')
      return admins.owned(token, async (actorId, session) => {
        await verifyIdentityPersistence(connection, models)
        const row = await models.users
          .findOne({ _id: customerId, role: 'customer' })
          .select('+securityRevision')
          .session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        const operationKey = createHash('sha256')
          .update(`customer-status:${actorId}:${customerId}:${key}`)
          .digest('hex')
        const cause = {
          action: 'customer.status.decision',
          targetType: 'customer',
          targetId: customerId,
          operationKey,
        }
        const prior = await lookup(session, cause)
        if (prior) {
          if (prior.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
          return { status: row.status }
        }
        if (
          !['active', 'suspended'].includes(row.status) ||
          !Number.isSafeInteger(row.securityRevision) ||
          row.securityRevision >= Number.MAX_SAFE_INTEGER
        )
          throw new ApiError('STATE_CONFLICT')
        const now = clock()
        if (!Number.isFinite(now.getTime()) || now < row.createdAt)
          throw new ApiError('STATE_CONFLICT')
        const changed = await models.users.updateOne(
          {
            _id: row._id,
            role: 'customer',
            status: row.status,
            securityRevision: row.securityRevision,
          },
          { $set: { status: input.to }, $inc: { securityRevision: 1 } },
          { session },
        )
        if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await models.sessions.updateMany(
          { userId: row._id, kind: 'customer', revokedAt: { $exists: false } },
          { $set: { revokedAt: now } },
          { session },
        )
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
          action: `customer.status.${row.status}.${input.to}`,
          actorType: 'admin',
          actorId,
          afterDigest: digest,
          reason: input.reason,
          occurredAt: now,
        })
        return { status: input.to }
      })
    },
    async detail(token: string | undefined, rawId: unknown) {
      const customerId = parseInput(id, rawId)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyIdentityPersistence(connection, models)
          const row = await models.users
            .findOne({ _id: customerId, role: 'customer' })
            .select('name emailNormalized phone status emailVerifiedAt createdAt')
            .session(session)
          if (!row) throw new ApiError('NOT_FOUND')
          return view(row)
        },
        false,
      )
    },
  }
}

function customerReportAccess(connection: Connection, models: IdentityModels) {
  return async (session: import('mongoose').ClientSession) => {
    await verifyIdentityPersistence(connection, models)
    return models.users.countDocuments({ role: 'customer' }).maxTimeMS(5000).session(session)
  }
}

export { customerAdminService, customerReportAccess }
