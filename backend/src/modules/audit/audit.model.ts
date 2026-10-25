import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { mutableSchemaOptions } from '../../shared/database/schema.js'
const schema = new Schema(
  {
    actorType: {
      type: String,
      required: true,
      enum: ['customer', 'admin', 'guest_order', 'system'],
    },
    actorId: Schema.Types.ObjectId,
    action: { type: String, required: true, maxlength: 128 },
    targetType: { type: String, required: true, maxlength: 128 },
    targetId: Schema.Types.ObjectId,
    operationKey: { type: String, required: true, maxlength: 128 },
    occurredAt: { type: Date, required: true },
    beforeDigest: { type: String, match: /^[a-f0-9]{64}$/ },
    afterDigest: { type: String, match: /^[a-f0-9]{64}$/ },
    reason: { type: String, maxlength: 2000 },
    requestCorrelationId: { type: String, maxlength: 128 },
  },
  { ...mutableSchemaOptions, timestamps: false },
)
schema.index({ targetType: 1, targetId: 1, occurredAt: -1 }, { name: 'audit_target_time' })
schema.index({ actorId: 1, occurredAt: -1 }, { name: 'audit_actor_time' })
schema.index(
  { operationKey: 1, action: 1, targetType: 1, targetId: 1 },
  { unique: true, name: 'audit_cause_unique' },
)
type Audit = InferSchemaType<typeof schema>
export function auditModel(connection: Connection) {
  if (!connection.models.AuditLog) connection.model<Audit>('AuditLog', schema, 'auditLogs')
  return connection.model<Audit>('AuditLog')
}
