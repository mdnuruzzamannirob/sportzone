import { Types, type Connection } from 'mongoose'
import { z } from 'zod'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { paginationSchema, pageMeta } from '../../shared/pagination.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { auditModel } from './audit.model.js'
import { verifyAuditPersistence } from './audit.persistence.js'

const id = z.string().regex(/^[a-f0-9]{24}$/)
const querySchema = paginationSchema
  .safeExtend({
    targetType: z
      .string()
      .regex(/^[a-z][a-z0-9_]{0,127}$/)
      .optional(),
    targetId: id.optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .refine((q) => !q.targetId || !!q.targetType)
  .refine((q) => !q.from || !q.to || Date.parse(q.from) <= Date.parse(q.to))

// Locally composed administrative read. Omit free-form reason, digests and operation keys.
export function auditQueryService(connection: Connection, admins: AdminAccountAccess) {
  const model = auditModel(connection)
  return {
    async list(token: string | undefined, raw: unknown) {
      const q = parseInput(querySchema, raw)
      return admins.owned(
        token,
        async (_actor, session) => {
          await verifyAuditPersistence(connection)
          const filter = {
            ...(q.targetType ? { targetType: q.targetType } : {}),
            ...(q.targetId ? { targetId: new Types.ObjectId(q.targetId) } : {}),
            ...(q.from || q.to
              ? {
                  occurredAt: {
                    ...(q.from ? { $gte: new Date(q.from) } : {}),
                    ...(q.to ? { $lte: new Date(q.to) } : {}),
                  },
                }
              : {}),
          }
          const rows = await model
            .find(filter)
            .sort({ occurredAt: -1, _id: -1 })
            .skip((q.page - 1) * q.pageSize)
            .limit(q.pageSize)
            .maxTimeMS(5000)
            .session(session)
          return {
            items: rows.map((row) => ({
              action: row.action,
              actor: {
                type: row.actorType,
                ...(row.actorId ? { id: row.actorId.toHexString() } : {}),
              },
              subject: {
                type: row.targetType,
                ...(row.targetId ? { id: row.targetId.toHexString() } : {}),
              },
              occurredAt: row.occurredAt.toISOString(),
            })),
            pagination: pageMeta(
              q,
              await model.countDocuments(filter).maxTimeMS(5000).session(session),
            ),
          }
        },
        false,
      )
    },
  }
}
