import type { Connection } from 'mongoose'
import { z } from 'zod'
import type { IdentityModels } from './auth.model.js'
import type { AdminAccountAccess } from './admin-account.service.js'
import { verifyIdentityPersistence } from './identity.persistence.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { createHash } from 'node:crypto'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const querySchema = paginationSchema.safeExtend({
  q: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['active', 'suspended', 'deletion_pending', 'deactivated']).optional(),
})
const decisionSchema = z.strictObject({
  to: z.enum(['active', 'suspended']),
  reason: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((v) => [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127)),
})
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
export function customerAdminService(
  connection: Connection,
  models: IdentityModels,
  admins: AdminAccountAccess,
  clock: () => Date = () => new Date(),
) {
  const audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection)
  const view = (row: InstanceType<IdentityModels['users']>) => ({
    id: row._id.toHexString(),
    name: row.name,
    emailMasked: maskedEmail(row.emailNormalized),
    ...(row.phone ? { phoneMasked: `***${row.phone.slice(-2)}` } : {}),
    status: row.status,
    emailVerified: !!row.emailVerifiedAt,
    createdAt: row.createdAt.toISOString(),
  })
  return {
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
