import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
const zoneSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 120 },
    description: { type: String, maxlength: 2000, default: undefined },
    status: { type: String, enum: ['active', 'inactive'], required: true },
    revision: { ...integerField(), required: true, default: 0 },
    coverageRevision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
zoneSchema.index({ createdAt: -1, _id: -1 }, { name: 'delivery_zone_list' })
const snapshot = new Schema(
  {
    id: { type: String, required: true },
    zoneId: { type: String, required: true },
    coverageKey: { type: String, required: true },
    amountPoisha: { ...integerField(), required: true },
    ruleVersion: { ...integerField(), required: true },
    revision: { ...integerField(), required: true },
    status: { type: String, enum: ['scheduled', 'active', 'inactive'], required: true },
    effectiveFrom: { type: String, required: true },
    effectiveTo: { type: String, default: undefined },
    supersedesChargeId: { type: String, default: undefined },
  },
  { _id: false, strict: 'throw', versionKey: false },
)
const operation = new Schema(
  {
    action: { type: String, enum: ['activate', 'deactivate', 'supersede'], required: true },
    keyDigest: { type: String, required: true },
    requestDigest: { type: String, required: true },
    rule: { type: snapshot, required: true },
    previous: { type: snapshot, default: undefined },
  },
  { _id: false, strict: 'throw', versionKey: false },
)
const chargeSchema = new Schema(
  {
    zoneId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    coverageKey: { type: String, required: true, immutable: true, maxlength: 129 },
    amountPoisha: { ...integerField(), required: true, immutable: true },
    ruleVersion: { ...integerField(), required: true, immutable: true },
    status: { type: String, enum: ['scheduled', 'active', 'inactive'], required: true },
    effectiveFrom: { type: Date, required: true, immutable: true },
    effectiveTo: { type: Date, default: undefined },
    revision: { ...integerField(), required: true, default: 0 },
    supersedesChargeId: { ...optionalObjectIdField(), immutable: true },
    endedAt: { type: Date, default: undefined },
    endedReason: { type: String, maxlength: 2000, default: undefined },
    operations: {
      type: [operation],
      default: undefined,
      validate: (v: unknown[]) => !v || v.length <= 3,
    },
  },
  mutableSchemaOptions,
)
chargeSchema.index(
  { coverageKey: 1 },
  {
    unique: true,
    partialFilterExpression: { status: 'active' },
    name: 'delivery_active_coverage_unique',
  },
)
chargeSchema.index(
  { coverageKey: 1, ruleVersion: 1 },
  { unique: true, name: 'delivery_coverage_version_unique' },
)
chargeSchema.index(
  { zoneId: 1, status: 1, effectiveFrom: 1 },
  { name: 'delivery_zone_status_start' },
)
chargeSchema.index({ status: 1, effectiveFrom: 1 }, { name: 'delivery_due_start' })
chargeSchema.index({ status: 1, effectiveTo: 1 }, { name: 'delivery_due_end' })
chargeSchema.index({ createdAt: -1, _id: -1 }, { name: 'delivery_charge_list' })
export type DeliveryZone = InferSchemaType<typeof zoneSchema>
export type DeliveryCharge = InferSchemaType<typeof chargeSchema>
export function deliveryModels(connection: Connection) {
  return {
    zones: connection.models.DeliveryZone
      ? connection.model<DeliveryZone>('DeliveryZone')
      : connection.model<DeliveryZone>('DeliveryZone', zoneSchema, 'deliveryZones'),
    charges: connection.models.DeliveryCharge
      ? connection.model<DeliveryCharge>('DeliveryCharge')
      : connection.model<DeliveryCharge>('DeliveryCharge', chargeSchema, 'deliveryCharges'),
  }
}
