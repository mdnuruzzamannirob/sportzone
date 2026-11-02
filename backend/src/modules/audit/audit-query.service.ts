import { auditView } from './audit-query.schema.js'
import { auditQuery as querySchema } from './audit-query.schema.js'
import { Types, type Connection } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { auditModel } from './audit.model.js'
import { verifyAuditPersistence } from './audit.persistence.js'

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
            items: rows.map((row) =>
              auditView.parse({
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
              }),
            ),
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
