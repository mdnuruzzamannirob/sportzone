import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../shared/database/schema.js'
import { policyContent, policyStatus, policyType } from './policy.schema.js'

const operation = new Schema(
  {
    keyDigest: { type: String, required: true },
    requestDigest: { type: String, required: true },
    revision: { ...integerField(), required: true },
    status: { type: String, enum: ['approved', 'scheduled', 'published'], required: true },
  },
  { _id: false, strict: 'throw', versionKey: false },
)
const schema = new Schema(
  {
    approvalOperation: { type: operation, default: undefined },
    publicationOperation: { type: operation, default: undefined },
    type: {
      type: String,
      enum: policyType.options,
      required: true,
      immutable: true,
    },
    version: { type: String, required: true, immutable: true, maxlength: 100 },
    status: {
      type: String,
      enum: policyStatus.options,
      required: true,
      default: 'draft',
    },
    content: {
      type: String,
      required: true,
      validate: (v: string) => policyContent.safeParse(v).success,
    },
    contentDigest: { type: String, required: true, match: /^[a-f0-9]{64}$/ },
    proposedEffectiveAt: { type: Date, default: undefined },
    effectiveAt: { type: Date, default: undefined },
    publishedAt: { type: Date, default: undefined },
    approvalEvidenceRef: { type: String, maxlength: 2000, default: undefined },
    approvedAt: { type: Date, default: undefined },
    approvedBy: optionalObjectIdField(),
    supersedesId: optionalObjectIdField(),
    supersededAt: { type: Date, default: undefined },
    revision: { ...integerField(), required: true, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, required: true, immutable: true },
  },
  mutableSchemaOptions,
)
schema.index({ type: 1, version: 1 }, { unique: true, name: 'policy_type_version_unique' })
schema.index({ type: 1, status: 1, effectiveAt: -1 }, { name: 'policy_type_status_effective' })
schema.index({ type: 1, publishedAt: -1 }, { name: 'policy_type_published' })
export type PolicyDocument = InferSchemaType<typeof schema>
export function policyModel(connection: Connection) {
  return connection.models.PolicyDocument
    ? connection.model<PolicyDocument>('PolicyDocument')
    : connection.model<PolicyDocument>('PolicyDocument', schema, 'policyDocuments')
}
