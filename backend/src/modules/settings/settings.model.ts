import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
import { policyType } from './policy.schema.js'
const embedded = { _id: false, strict: 'throw', versionKey: false } as const
const contact = new Schema({ email: String, phone: String, website: String }, embedded)
const image = new Schema(
  {
    publicId: { type: String, required: true },
    url: { type: String, required: true },
    alt: { type: String, required: true },
  },
  embedded,
)
const pointers = new Schema(
  Object.fromEntries(
    policyType.options.map((type) => [type, { type: String, default: undefined }]),
  ),
  embedded,
)
const schema = new Schema(
  {
    key: { type: String, enum: ['primary'], required: true, immutable: true },
    storeName: { type: String, maxlength: 120, default: undefined },
    branding: { type: image, default: undefined },
    contact: { type: contact, default: undefined },
    complaintContact: { type: contact, default: undefined },
    address: {
      type: new Schema(
        {
          line1: String,
          line2: String,
          area: String,
          district: String,
          postalCode: String,
        },
        embedded,
      ),
      default: undefined,
    },
    homepageBanner: {
      type: new Schema(
        {
          assetId: { type: Schema.Types.ObjectId, required: true },
          title: { type: String, required: true },
          alt: { type: String, required: true },
          href: String,
          image: { type: image, required: true },
        },
        embedded,
      ),
      default: undefined,
    },
    deliveryCoverageRevision: { ...integerField(), required: true },
    lowStockThreshold: { ...integerField(), required: true },
    paymentChannels: {
      type: new Schema(
        {
          bkashEnabled: { type: Boolean, required: true },
          nagadEnabled: { type: Boolean, required: true },
          rocketEnabled: { type: Boolean, required: true },
          codEnabled: { type: Boolean, required: true },
        },
        embedded,
      ),
      required: true,
    },
    activePolicyVersions: { type: pointers, required: true },
    policyHistory: {
      type: [
        new Schema(
          {
            policyId: { type: Schema.Types.ObjectId, required: true },
            digest: { type: String, required: true },
            effectiveAt: { type: Date, required: true },
          },
          embedded,
        ),
      ],
      default: undefined,
      validate: (v: unknown[]) => !v || v.length <= 40,
    },
    updatedBy: optionalObjectIdField(),
    revision: { ...integerField(), required: true },
  },
  { ...mutableSchemaOptions, minimize: false },
)
schema.index({ key: 1 }, { unique: true, name: 'settings_primary_unique' })
export type StoreSettings = InferSchemaType<typeof schema>
export function settingsModel(connection: Connection) {
  return connection.models.StoreSettings
    ? connection.model<StoreSettings>('StoreSettings')
    : connection.model<StoreSettings>('StoreSettings', schema, 'storeSettings')
}
