import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
const email = z.string().trim().toLowerCase().pipe(z.email().max(254))
const id = z.string().regex(/^[a-f0-9]{24}$/)
const instant = z.iso.datetime({ offset: false })
const opaque = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/)
const noBody = z.undefined()
const emptyBody = z.union([noBody, z.strictObject({})])
const credential = z.string().min(1) // Never trim or transform a password.
const confirmation = z.strictObject({ token: opaque })
const emailRequest = z.strictObject({ email })
const csrf = z.strictObject({ csrfToken: opaque, expiresAt: instant })
const accepted = z.strictObject({ accepted: z.literal(true) })
const logout = z.strictObject({ revoked: z.literal(true), csrfToken: opaque })
const addressParams = z.strictObject({ addressId: id })
const noParams = z.strictObject({})

export const challengePurpose = z.enum([
  'email_verify',
  'email_change',
  'password_reset',
  'guest_order_access',
])
export type ChallengePurpose = z.infer<typeof challengePurpose>

// Required service policies: transport validation cannot invent password policy or coverage.
export function createIdentityContracts(policy: {
  newPassword: z.ZodType<string, string>
  phone: z.ZodType<string, string>
  servesArea: (districtKey: string, areaKey: string) => boolean
}) {
  const newPassword = credential.refine((value) => {
    const result = policy.newPassword.safeParse(value)
    return result.success && result.data === value
  })
  const phone = z.string().min(1).pipe(policy.phone)
  const addressFields = {
    recipient: text(120),
    phone,
    districtKey: text(64),
    areaKey: text(64),
    street: text(300),
    addressLine2: text(300).optional(),
  }
  const addressInput = z
    .strictObject(addressFields)
    .refine((value) => policy.servesArea(value.districtKey, value.areaKey), {
      path: ['areaKey'],
      message: 'Unsupported delivery area',
    })
  const address = z.strictObject({
    ...addressFields,
    id,
    isDefault: z.boolean(),
  })
  const addresses = z
    .array(address)
    .max(10)
    .refine(
      (values) =>
        new Set(values.map((value) => value.id)).size === values.length &&
        values.filter((value) => value.isDefault).length <= 1,
    )
  // Partial location edits need the current stored address before coverage validation.
  const addressPatch = z
    .strictObject({ ...addressFields, isDefault: z.boolean() })
    .partial()
    .refine((value) => Object.values(value).some((item) => item !== undefined))
  const account = z.strictObject({
    id,
    name: text(120),
    email,
    phone: phone.optional(),
    emailVerified: z.boolean(),
    addresses,
    status: z.enum(['active', 'suspended']),
  })
  const accountResult = z.strictObject({ account })
  const loginResult = z.strictObject({ account, csrfToken: opaque })
  const credentials = z.strictObject({ email, password: credential })
  const register = z.strictObject({
    name: text(120),
    email,
    password: newPassword,
  })
  const reset = z.strictObject({ token: opaque, newPassword })
  const profile = z
    .strictObject({ name: text(120).optional(), phone: phone.optional() })
    .refine((value) => Object.values(value).some((item) => item !== undefined))
  const deletion = z.strictObject({ reason: text(2000).optional() })
  const deletionResult = z.strictObject({
    requestId: id,
    status: z.enum(['requested', 'under_review', 'approved', 'rejected', 'completed']),
  })
  const passwordChange = z.strictObject({
    currentPassword: credential,
    newPassword,
  })
  const changed = z.strictObject({
    changed: z.literal(true),
    csrfToken: opaque,
  })
  const verified = z.strictObject({ verified: z.literal(true) })
  const resetResult = z.strictObject({ reset: z.literal(true) })
  const registerResult = z.strictObject({
    account,
    verificationRequired: z.boolean(),
  })
  const sent = z.strictObject({ verificationSent: z.literal(true) })
  type Access = 'public' | 'public_csrf' | 'customer' | 'admin'
  type Replay = 'read' | 'ordinary' | 'single_use' | 'idempotent_logout'
  function operation(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    path: string,
    access: Access,
    request: z.ZodType,
    response: z.ZodType,
    replay: Replay = 'ordinary',
    status = 200,
  ) {
    return {
      method,
      path,
      access,
      request,
      response,
      replay,
      status,
      namespace: path.startsWith('/admin/') ? ('admin' as const) : ('storefront' as const),
      csrf: method !== 'GET',
      params: path.includes('{addressId}') ? addressParams : noParams,
      query: z.strictObject({}),
    }
  }
  const operations = [
    operation('GET', '/auth/csrf', 'public', noBody, csrf, 'read'),
    operation('POST', '/auth/register', 'public_csrf', register, registerResult, 'ordinary', 201),
    operation('POST', '/auth/login', 'public_csrf', credentials, loginResult),
    operation('GET', '/auth/session', 'customer', noBody, accountResult, 'read'),
    operation('POST', '/auth/logout', 'public_csrf', emptyBody, logout, 'idempotent_logout'),
    operation('POST', '/auth/email-verifications', 'public_csrf', emailRequest, accepted),
    operation(
      'POST',
      '/auth/email-verifications/confirm',
      'public_csrf',
      confirmation,
      verified,
      'single_use',
    ),
    operation('POST', '/auth/password-resets', 'public_csrf', emailRequest, accepted),
    operation(
      'POST',
      '/auth/password-resets/confirm',
      'public_csrf',
      reset,
      resetResult,
      'single_use',
    ),
    operation('GET', '/me', 'customer', noBody, account, 'read'),
    operation('PATCH', '/me', 'customer', profile, account),
    operation('POST', '/me/email-changes', 'customer', z.strictObject({ newEmail: email }), sent),
    operation('POST', '/me/email-changes/confirm', 'customer', confirmation, account, 'single_use'),
    operation('POST', '/me/password-change', 'customer', passwordChange, changed),
    operation('GET', '/me/addresses', 'customer', noBody, addresses, 'read'),
    operation('POST', '/me/addresses', 'customer', addressInput, address, 'ordinary', 201),
    operation('PATCH', '/me/addresses/{addressId}', 'customer', addressPatch, address),
    operation(
      'DELETE',
      '/me/addresses/{addressId}',
      'customer',
      emptyBody,
      noBody,
      'ordinary',
      204,
    ),
    operation('POST', '/me/addresses/{addressId}/default', 'customer', emptyBody, address),
    operation('POST', '/me/deletion-requests', 'customer', deletion, deletionResult),
    operation('GET', '/admin/auth/csrf', 'public', noBody, csrf, 'read'),
    operation('POST', '/admin/auth/login', 'public_csrf', credentials, loginResult),
    operation('GET', '/admin/auth/session', 'admin', noBody, accountResult, 'read'),
    operation('POST', '/admin/auth/logout', 'public_csrf', emptyBody, logout, 'idempotent_logout'),
    operation('POST', '/admin/auth/password-resets', 'public_csrf', emailRequest, accepted),
    operation(
      'POST',
      '/admin/auth/password-resets/confirm',
      'public_csrf',
      reset,
      resetResult,
      'single_use',
    ),
  ]
  return {
    operations,
    account,
    address,
    addressInput,
    addressPatch,
    credentials,
    register,
  }
}

// A server-output defect must never be reported as invalid client input.
export function parseIdentityResponse<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  const result = schema.safeParse(value)
  if (!result.success) throw new ApiError('INTERNAL_ERROR')
  return result.data
}

// Pure state precondition only: hash verification and atomic consumption remain mandatory.
export function isChallengeCurrent(
  state: {
    purpose: ChallengePurpose
    scopeId: string
    scopeRevisionAtIssue: number
    expiresAt: Date
    consumedAt?: Date
    invalidatedAt?: Date
    attemptCount: number
  },
  expected: {
    purpose: ChallengePurpose
    scopeId: string
    scopeRevision: number
    maxAttempts: number
  },
  now: Date,
) {
  return (
    Number.isFinite(now.getTime()) &&
    Number.isFinite(state.expiresAt.getTime()) &&
    state.purpose === expected.purpose &&
    state.scopeId === expected.scopeId &&
    Number.isSafeInteger(state.scopeRevisionAtIssue) &&
    state.scopeRevisionAtIssue >= 0 &&
    state.scopeRevisionAtIssue === expected.scopeRevision &&
    Number.isSafeInteger(expected.maxAttempts) &&
    expected.maxAttempts > 0 &&
    Number.isSafeInteger(state.attemptCount) &&
    state.attemptCount >= 0 &&
    state.attemptCount < expected.maxAttempts &&
    state.expiresAt > now &&
    state.consumedAt === undefined &&
    state.invalidatedAt === undefined
  )
}
