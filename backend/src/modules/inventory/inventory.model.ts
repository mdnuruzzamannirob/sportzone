import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'

const movementSchema = new Schema(
  {
    variantId: { type: Schema.Types.ObjectId, required: true },
    orderId: optionalObjectIdField(),
    reservationId: optionalObjectIdField(),
    type: {
      type: String,
      required: true,
      enum: [
        'opening',
        'adjustment',
        'reserve',
        'release_hold',
        'commit_hold',
        'commit_cod',
        'release_commit',
        'dispatch',
        'return_receipt',
      ],
    },
    deltaPhysical: {
      ...integerField(-Number.MAX_SAFE_INTEGER),
      required: true,
    },
    deltaReserved: {
      ...integerField(-Number.MAX_SAFE_INTEGER),
      required: true,
    },
    deltaCommitted: {
      ...integerField(-Number.MAX_SAFE_INTEGER),
      required: true,
    },
    operationKey: { type: String, required: true, maxlength: 128 },
    actor: {
      type: new Schema(
        {
          type: { type: String, required: true, enum: ['system', 'admin'] },
          id: optionalObjectIdField(),
        },
        { _id: false, strict: 'throw' },
      ),
      required: true,
    },
    reason: {
      type: String,
      required: true,
      validate: (value: string) => value.trim().length > 0 && [...value].length <= 2000,
    },
    occurredAt: { type: Date, required: true },
  },
  { ...mutableSchemaOptions, timestamps: false },
)
movementSchema.index(
  { variantId: 1, type: 1, operationKey: 1 },
  { unique: true, name: 'movement_operation_unique' },
)
movementSchema.index({ variantId: 1, occurredAt: -1 }, { name: 'movement_variant_occurred' })
movementSchema.index({ orderId: 1, occurredAt: 1 }, { name: 'movement_order_occurred' })
movementSchema.pre('save', function () {
  if (!this.isNew) throw new Error('Inventory movements are append-only.')
})
movementSchema.pre(
  [
    'updateOne',
    'updateMany',
    'findOneAndUpdate',
    'replaceOne',
    'findOneAndReplace',
    'deleteOne',
    'deleteMany',
    'findOneAndDelete',
  ],
  () => {
    throw new Error('Inventory movements are append-only.')
  },
)
movementSchema.pre('deleteOne', { document: true, query: false }, () => {
  throw new Error('Inventory movements are append-only.')
})
movementSchema.pre('bulkWrite', () => {
  throw new Error('Inventory movements are append-only.')
})
export type InventoryMovement = InferSchemaType<typeof movementSchema>
export function inventoryMovementModel(connection: Connection) {
  return connection.models.InventoryMovement
    ? connection.model<InventoryMovement>('InventoryMovement')
    : connection.model<InventoryMovement>('InventoryMovement', movementSchema, 'inventoryMovements')
}

const reservationSchema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true },
    variantId: { type: Schema.Types.ObjectId, required: true },
    quantity: { ...integerField(1), required: true, max: 50 },
    generation: { ...integerField(1), required: true },
    heldAt: { type: Date },
    status: { type: String, required: true, enum: ['held', 'committed', 'released', 'shipped'] },
    activeKey: { type: String, enum: ['active'] },
    expiresAt: { type: Date },
    committedAt: { type: Date },
    releasedAt: { type: Date },
    shippedAt: { type: Date },
    releaseReason: {
      type: String,
      validate: (value: string) => value.trim().length > 0 && [...value].length <= 2000,
    },
    lastOperationKey: { type: String, maxlength: 128 },
  },
  { ...mutableSchemaOptions, timestamps: false },
)
reservationSchema.index(
  { orderId: 1, variantId: 1, generation: 1 },
  { unique: true, name: 'reservation_generation_unique' },
)
reservationSchema.index(
  { orderId: 1, variantId: 1, activeKey: 1 },
  {
    unique: true,
    partialFilterExpression: { activeKey: { $type: 'string' } },
    name: 'reservation_active_unique',
  },
)
reservationSchema.index({ status: 1, expiresAt: 1 }, { name: 'reservation_status_expiry' })
export type InventoryReservation = InferSchemaType<typeof reservationSchema>
export function inventoryReservationModel(connection: Connection) {
  return connection.models.InventoryReservation
    ? connection.model<InventoryReservation>('InventoryReservation')
    : connection.model<InventoryReservation>(
        'InventoryReservation',
        reservationSchema,
        'inventoryReservations',
      )
}
