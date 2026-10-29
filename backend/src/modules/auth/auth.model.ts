import { Schema, Types, type Connection, type InferSchemaType } from 'mongoose'
import { z } from 'zod'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'

const embedded = { _id: false, strict: 'throw', versionKey: false } as const
function stringField(max?: number) {
  return {
    type: String,
    set(value: unknown) {
      if (value === undefined) return undefined
      if (typeof value !== 'string') throw new TypeError('Expected text')
      return value
    },
    validate: {
      validator: (value: unknown) =>
        value === undefined ||
        (typeof value === 'string' &&
          value.length > 0 &&
          value === value.trim() &&
          (max === undefined || [...value].length <= max)),
      message: 'Invalid text',
    },
  }
}
const requiredText = (max?: number) => ({
  ...stringField(max),
  required: true as const,
})
function dateField<const R extends boolean>(required: R) {
  return {
    type: Date,
    required,
    set(value: unknown) {
      if (value === undefined) return undefined
      if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
        throw new TypeError('Expected date')
      return value
    },
  }
}
function reference<const R extends boolean>(required: R) {
  return {
    type: Schema.Types.ObjectId,
    required,
    set(value: unknown) {
      if (value === undefined) return undefined
      if (!(value instanceof Types.ObjectId)) throw new TypeError('Expected ObjectId')
      return value
    },
  }
}
const emailField = () => ({
  ...requiredText(254),
  validate: {
    validator: (value: string) =>
      z.email().max(254).safeParse(value).success && value === value.trim().toLowerCase(),
    message: 'Invalid email',
  },
})
const digest = (required = true) => ({
  ...stringField(),
  required,
  select: false,
})
const addressSchema = new Schema(
  {
    id: reference(true),
    recipient: requiredText(120),
    phone: requiredText(),
    districtKey: requiredText(64),
    areaKey: requiredText(64),
    street: requiredText(300),
    postalCode: stringField(30),
    addressLine2: stringField(300),
    isDefault: {
      type: Boolean,
      required: true,
      set(value: unknown) {
        if (typeof value !== 'boolean') throw new TypeError('Expected boolean')
        return value
      },
    },
  },
  embedded,
)
const revisionsSchema = new Schema(
  {
    email_verify: { ...integerField(), required: true, default: 0 },
    email_change: { ...integerField(), required: true, default: 0 },
    password_reset: { ...integerField(), required: true, default: 0 },
  },
  embedded,
)
const deletionSchema = new Schema(
  {
    id: reference(true),
    requestedAt: dateField(true),
    verifiedAt: dateField(true),
    status: {
      ...requiredText(),
      enum: ['requested', 'under_review', 'approved', 'rejected', 'completed'],
    },
    reason: stringField(2000),
    decisionAt: dateField(false),
    decisionReason: stringField(2000),
  },
  embedded,
)
deletionSchema.pre('validate', function () {
  if (['approved', 'rejected', 'completed'].includes(this.status) && !this.decisionAt)
    this.invalidate('decisionAt', 'Decision instant required')
})
const userSchema = new Schema(
  {
    emailNormalized: emailField(),
    name: requiredText(120),
    passwordHash: digest(),
    phone: stringField(),
    role: {
      ...requiredText(),
      enum: ['customer', 'admin'],
      default: 'customer',
    },
    status: {
      ...requiredText(),
      enum: ['active', 'suspended', 'deletion_pending', 'deactivated'],
      default: 'active',
    },
    emailVerifiedAt: dateField(false),
    addresses: {
      type: [addressSchema],
      default: [],
      required: true,
      validate: {
        validator: (values: InferSchemaType<typeof addressSchema>[]) =>
          values.length <= 10 &&
          new Set(values.map((value) => value.id.toHexString())).size === values.length &&
          values.filter((value) => value.isDefault).length <= 1,
        message: 'Invalid addresses',
      },
    },
    securityRevision: {
      ...integerField(),
      required: true,
      default: 0,
      select: false,
    },
    challengeRevisions: {
      type: revisionsSchema,
      required: true,
      default: () => ({}),
      select: false,
    },
    deletionRequest: { type: deletionSchema, default: undefined },
  },
  mutableSchemaOptions,
)
userSchema.index({ emailNormalized: 1 }, { name: 'users_email_unique', unique: true })
userSchema.index({ role: 1, status: 1, createdAt: -1 }, { name: 'users_role_status_created' })

const sessionSchema = new Schema(
  {
    tokenHash: digest(),
    kind: { ...requiredText(), enum: ['customer', 'admin', 'guest_order'] },
    userId: reference(false),
    orderId: reference(false),
    securityRevisionAtIssue: { ...integerField(), select: false },
    csrfSecretHash: digest(),
    expiresAt: dateField(true),
    revokedAt: dateField(false),
    lastUsedAt: dateField(false),
  },
  mutableSchemaOptions,
)
sessionSchema.pre('validate', function () {
  const guest = this.kind === 'guest_order'
  if (
    guest
      ? !this.orderId || this.userId !== undefined || this.securityRevisionAtIssue !== undefined
      : !this.userId || this.orderId !== undefined || this.securityRevisionAtIssue === undefined
  )
    this.invalidate('kind', 'Invalid session scope')
  if (this.isNew && this.expiresAt <= (this.createdAt ?? new Date()))
    this.invalidate('expiresAt', 'Invalid issuance expiry')
})
sessionSchema.index({ tokenHash: 1 }, { name: 'sessions_token_unique', unique: true })
sessionSchema.index({ userId: 1, kind: 1, revokedAt: 1 }, { name: 'sessions_user_kind_revoked' })
sessionSchema.index({ expiresAt: 1 }, { name: 'sessions_expiry', expireAfterSeconds: 0 })
function binaryField() {
  return {
    type: Buffer,
    required: true as const,
    set(value: unknown) {
      if (!Buffer.isBuffer(value) || !value.length) throw new TypeError('Expected binary data')
      return value
    },
  }
}
const envelopeSchema = new Schema(
  {
    algorithm: { ...requiredText(), enum: ['AES-256-GCM'] },
    keyVersion: requiredText(),
    nonce: binaryField(),
    ciphertext: binaryField(),
    authTag: binaryField(),
  },
  embedded,
)
const challengeSchema = new Schema(
  {
    purpose: {
      ...requiredText(),
      enum: ['email_verify', 'email_change', 'password_reset', 'guest_order_access'],
    },
    secretHash: digest(),
    userId: reference(false),
    orderId: reference(false),
    emailNormalized: emailField(),
    targetEmailNormalized: { ...emailField(), required: false },
    expiresAt: dateField(true),
    consumedAt: dateField(false),
    invalidatedAt: dateField(false),
    attemptCount: { ...integerField(), required: true, default: 0 },
    scopeRevisionAtIssue: { ...integerField(), required: true, select: false },
    issuedContextHash: digest(false),
    deliveryNotificationId: reference(false),
    deliveryEnvelope: {
      type: envelopeSchema,
      default: undefined,
      select: false,
    },
  },
  mutableSchemaOptions,
)
challengeSchema.pre('validate', function () {
  if (this.deliveryEnvelope && (this.consumedAt || this.invalidatedAt))
    this.invalidate('deliveryEnvelope', 'Inactive challenge cannot retain delivery material')
  const guest = this.purpose === 'guest_order_access'
  if (
    guest ? !this.orderId || this.userId !== undefined : !this.userId || this.orderId !== undefined
  )
    this.invalidate('purpose', 'Invalid challenge scope')
  if ((this.purpose === 'email_change') !== (this.targetEmailNormalized !== undefined))
    this.invalidate('targetEmailNormalized', 'Invalid target scope')
  if (this.isNew && this.expiresAt <= (this.createdAt ?? new Date()))
    this.invalidate('expiresAt', 'Invalid issuance expiry')
})
challengeSchema.index({ secretHash: 1 }, { name: 'auth_challenges_secret_unique', unique: true })
challengeSchema.index(
  { purpose: 1, orderId: 1, expiresAt: 1 },
  { name: 'auth_challenges_purpose_order_expiry' },
)
challengeSchema.index({ expiresAt: 1 }, { name: 'auth_challenges_expiry', expireAfterSeconds: 0 })
const contextSchema = new Schema(
  {
    contextTokenHash: digest(),
    csrfSecretHash: digest(),
    audience: { ...requiredText(), enum: ['storefront', 'admin'] },
    expiresAt: dateField(true),
    rotatedAt: dateField(false),
  },
  mutableSchemaOptions,
)
contextSchema.pre('validate', function () {
  if (this.isNew && this.expiresAt <= (this.createdAt ?? new Date()))
    this.invalidate('expiresAt', 'Invalid issuance expiry')
})
contextSchema.index(
  { contextTokenHash: 1 },
  { name: 'browser_contexts_token_unique', unique: true },
)
contextSchema.index({ expiresAt: 1 }, { name: 'browser_contexts_expiry', expireAfterSeconds: 0 })

// Connection-owned models only. No global connection or automatic collection/index rollout.
export function createIdentityModels(connection: Connection) {
  return {
    users: connection.model('IdentityUser', userSchema, 'users'),
    sessions: connection.model('IdentitySession', sessionSchema, 'sessions'),
    challenges: connection.model('IdentityChallenge', challengeSchema, 'authChallenges'),
    contexts: connection.model('IdentityBrowserContext', contextSchema, 'browserContexts'),
  }
}
export type IdentityModels = ReturnType<typeof createIdentityModels>
