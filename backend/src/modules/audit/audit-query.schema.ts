import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'
const id = z.string().regex(/^[a-f0-9]{24}$/)
export const auditQuery = paginationSchema
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
export const auditView = z.strictObject({
  action: z.string(),
  actor: z.strictObject({ type: z.string(), id: id.optional() }),
  subject: z.strictObject({ type: z.string(), id: id.optional() }),
  occurredAt: z.iso.datetime(),
})
