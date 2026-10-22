import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions, optionalObjectIdField } from '../../db/schema.js'
const embedded = { _id: false, strict: 'throw', versionKey: false } as const
const schema = new Schema(
  {
    publicId: { type: String, required: true, match: /^sportzone\/[a-f0-9]{24}$/ },
    assetKind: { type: String, enum: ['public_media', 'claim_evidence'], required: true },
    owner: {
      type: new Schema(
        {
          kind: { type: String, enum: ['admin', 'customer', 'guest_order'], required: true },
          principalId: { type: Schema.Types.ObjectId, required: true },
        },
        embedded,
      ),
      required: true,
    },
    orderId: optionalObjectIdField(),
    claimType: { type: String, enum: ['physical_return', 'shortage'] },
    orderItemIds: {
      type: [Schema.Types.ObjectId],
      default: [],
      validate: (items: unknown[]) => items.length <= 40,
    },
    mimeType: { type: String, enum: ['image/png', 'image/jpeg', 'image/webp'], required: true },
    format: { type: String, enum: ['png', 'jpg', 'webp'], required: true },
    size: { ...integerField(1), required: true },
    digest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    scanStatus: {
      type: String,
      enum: ['pending', 'clean', 'rejected'],
      required: true,
      default: 'pending',
    },
    access: { type: String, enum: ['public', 'private'], required: true },
    status: {
      type: String,
      enum: ['uploading', 'temporary', 'attached', 'deleting', 'deleted', 'quarantined'],
      required: true,
    },
    references: {
      type: [
        new Schema(
          {
            targetType: {
              type: String,
              enum: ['product', 'category', 'store_settings', 'claim'],
              required: true,
            },
            targetId: { type: Schema.Types.ObjectId, required: true },
            slot: { type: String, required: true, maxlength: 128 },
          },
          embedded,
        ),
      ],
      default: [],
      validate: (values: unknown[]) => values.length <= 40,
    },
    expiresAt: Date,
    deletedAt: Date,
    legalHold: { type: Boolean, required: true, default: false },
    retainUntil: Date,
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
schema.pre('validate', function () {
  const privateAsset = this.assetKind === 'claim_evidence'
  if (
    privateAsset !== (this.access === 'private') ||
    (privateAsset &&
      (!this.orderId ||
        !this.claimType ||
        !this.orderItemIds.length ||
        this.owner.kind === 'admin')) ||
    (!privateAsset &&
      (this.orderId || this.claimType || this.orderItemIds.length || this.owner.kind !== 'admin'))
  )
    this.invalidate('access', 'Invalid media scope')
  if (this.owner.kind === 'guest_order' && !this.owner.principalId.equals(this.orderId))
    this.invalidate('owner', 'Invalid guest scope')
  if (
    new Set(this.orderItemIds.map((value) => value.toHexString())).size !== this.orderItemIds.length
  )
    this.invalidate('orderItemIds', 'Duplicate scope')
  if (
    new Set(
      this.references.map(
        (value) => `${value.targetType}:${value.targetId.toHexString()}:${value.slot}`,
      ),
    ).size !== this.references.length
  )
    this.invalidate('references', 'Duplicate references')
  if (this.references.some((value) => (value.targetType === 'claim') !== privateAsset))
    this.invalidate('references', 'Invalid reference type')
  if ((this.status === 'attached') !== this.references.length > 0)
    this.invalidate('status', 'Invalid attachment state')
  if (['temporary', 'attached'].includes(this.status) && this.scanStatus !== 'clean')
    this.invalidate('scanStatus', 'Unvalidated media')
})
schema.index({ publicId: 1 }, { unique: true, name: 'media_public_id_unique' })
schema.index({ orderId: 1, assetKind: 1, status: 1 }, { name: 'media_order_kind_status' })
schema.index({ status: 1, expiresAt: 1 }, { name: 'media_status_expiry' })
export type MediaAsset = InferSchemaType<typeof schema>
export function mediaModel(connection: Connection) {
  return connection.models.MediaAsset
    ? connection.model<MediaAsset>('MediaAsset')
    : connection.model<MediaAsset>('MediaAsset', schema, 'mediaAssets')
}
