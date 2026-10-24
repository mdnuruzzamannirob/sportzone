import { cartQuantity, cartResponse, variantParams } from '../src/modules/cart/cart.schema.js'
import { z } from 'zod'
import { createIdentityContracts } from '../src/modules/auth/auth.schema.js'
import {
  loginInput,
  registrationInput,
} from '../src/modules/auth/credentials/credentials.schema.js'
import { newPasswordPolicy } from '../src/modules/auth/credentials/password.service.js'
import {
  changeInput,
  confirmation,
  issuance,
} from '../src/modules/auth/recovery/password-recovery.schema.js'
import { confirmInput, requestInput } from '../src/modules/auth/verification/email-change.schema.js'
import {
  categoryCard,
  categoryQuery,
  categorySlug,
  productCard,
  productDetail,
  productQuery,
} from '../src/modules/catalog/catalog.schema.js'
import {
  addressInput,
  addressPatch,
  bangladeshPhone,
  deletionInput,
  profilePatch,
} from '../src/modules/customers/customer.schema.js'

// This registry is build tooling, never imported by an HTTP listener. Runtime refinements,
// transactions, area eligibility and cryptography remain owned by their domain services.
const identity = createIdentityContracts({
  newPassword: newPasswordPolicy,
  phone: bangladeshPhone,
  servesArea: () => {
    throw new Error('Coverage cannot be evaluated during contract generation')
  },
})
export type Operation = {
  method: string
  path: string
  access: 'public' | 'public_csrf' | 'customer' | 'admin' | 'monitor'
  activation: string
  request?: z.ZodType
  response?: z.ZodType
  query: z.ZodType
  params: z.ZodType
  status: number
  csrf: boolean
  namespace: 'storefront' | 'admin'
  paginated?: boolean
  multipart?: boolean
  replay: string
}
const empty = z.strictObject({})
const runtimeInputs: Record<string, z.ZodType> = {
  'POST /auth/register': registrationInput,
  'POST /auth/login': loginInput,
  'POST /admin/auth/login': loginInput,
  'POST /auth/password-resets': issuance,
  'POST /admin/auth/password-resets': issuance,
  'POST /auth/password-resets/confirm': confirmation,
  'POST /admin/auth/password-resets/confirm': confirmation,
  'POST /me/password-change': changeInput,
  'POST /me/email-changes': requestInput,
  'POST /me/email-changes/confirm': confirmInput,
  'PATCH /me': profilePatch,
  'POST /me/addresses': addressInput,
  'PATCH /me/addresses/{addressId}': addressPatch,
  'POST /me/deletion-requests': deletionInput,
}
const identityActivation = (path: string) => {
  if (path.endsWith('/auth/csrf'))
    return 'CUSTOMER_AUTH_ENABLED or ADMIN_AUTH_ENABLED; guest adapter not wired'
  if (path.startsWith('/admin/'))
    return 'ADMIN_AUTH_ENABLED with validated admin recovery configuration'
  if (path.includes('password-resets') || path.endsWith('password-change'))
    return 'CUSTOMER_AUTH_ENABLED and PASSWORD_RECOVERY_ENABLED'
  if (path.includes('email-changes')) return 'CUSTOMER_AUTH_ENABLED and EMAIL_CHANGE_ENABLED'
  return 'CUSTOMER_AUTH_ENABLED'
}
const identities: Operation[] = identity.operations
  .filter((op) => !op.path.startsWith('/auth/email-verifications'))
  .map((op) => ({
    ...op,
    request: runtimeInputs[`${op.method} ${op.path}`] ?? op.request,
    activation: identityActivation(op.path),
    query: op.path.endsWith('/auth/csrf')
      ? z.strictObject({
          sessionKind: (op.namespace === 'admin'
            ? z.literal('context')
            : z.enum(['context', 'customer', 'guest'])
          ).optional(),
        })
      : op.query,
  }))

export const operations: readonly Operation[] = [
  ...identities,
  ...(['GET', 'PUT', 'DELETE'] as const).map(
    (method): Operation => ({
      method,
      path: method === 'GET' ? '/cart' : '/cart/items/{variantId}',
      access: 'customer',
      activation: 'CUSTOMER_AUTH_ENABLED; reviewed cart persistence bootstrap required',
      ...(method === 'PUT' ? { request: cartQuantity } : {}),
      response: cartResponse,
      query: empty,
      params: method === 'GET' ? empty : variantParams,
      status: 200,
      csrf: method !== 'GET',
      namespace: 'storefront',
      replay:
        method === 'GET'
          ? 'read'
          : 'Absolute quantity/delete; no reservation or additive retry effect',
    }),
  ),
  ...(
    [
      ['/products', productQuery, z.array(productCard), true],
      ['/products/{slug}', empty, productDetail, false],
      ['/categories', categoryQuery, z.array(categoryCard), true],
      ['/categories/{slug}', empty, categoryCard, false],
    ] as const
  ).map(
    ([path, query, response, paginated]): Operation => ({
      method: 'GET',
      path,
      query,
      response,
      paginated,
      params: path.includes('{slug}') ? categorySlug : empty,
      status: 200,
      csrf: false,
      namespace: 'storefront',
      access: 'public',
      activation: 'Always registered; required indexes/visibility/media checks must pass',
      replay: 'read',
    }),
  ),
  ...(['live', 'ready'] as const).map(
    (kind): Operation => ({
      method: 'GET',
      path: `/health/${kind}`,
      query: empty,
      params: empty,
      response: z.strictObject({ status: z.literal(kind) }),
      status: 200,
      csrf: false,
      namespace: 'admin',
      access: kind === 'ready' ? 'monitor' : 'public',
      activation: 'Always registered; operational ingress restrictions apply',
      replay: 'read',
    }),
  ),
  {
    method: 'POST',
    path: '/admin/media/uploads',
    status: 200,
    access: 'admin',
    namespace: 'admin',
    csrf: true,
    query: empty,
    params: empty,
    multipart: true,
    request: z.strictObject({ file: z.string().meta({ format: 'binary' }) }),
    response: z.strictObject({
      assetId: z.string(),
      publicId: z.string(),
      url: z.url(),
      mimeType: z.string(),
      size: z.int().nonnegative(),
    }),
    activation:
      'Explicit media composition, ADMIN_AUTH_ENABLED and EXT-04 approval; not enabled by standard startup',
    replay: 'No automatic retry after uncertain provider outcome',
  },
  {
    method: 'DELETE',
    path: '/admin/media/{assetId}',
    status: 204,
    access: 'admin',
    namespace: 'admin',
    csrf: true,
    query: empty,
    params: z.strictObject({ assetId: z.string().regex(/^[a-f0-9]{24}$/) }),
    activation:
      'Explicit media composition, ADMIN_AUTH_ENABLED and EXT-04 approval; not enabled by standard startup',
    replay: 'No automatic retry after uncertain provider outcome',
  },
]

export const transportOperations = [
  { method: 'HEAD', path: '/auth/csrf', status: 204 },
  { method: 'HEAD', path: '/admin/auth/csrf', status: 204 },
] as const

export function operationId(op: Pick<Operation, 'method' | 'path'>) {
  return `${op.method.toLowerCase()}_${op.path
    .replace(/[{}]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '')}`
}

export function assertOperationParity(
  actual: readonly { method: string; path: string }[],
  expected: readonly Pick<Operation, 'method' | 'path'>[] = operations,
) {
  const keys = (rows: readonly { method: string; path: string }[]) =>
    rows.map((op) => `${op.method.toUpperCase()} ${op.path}`)
  const left = keys(actual),
    right = keys(expected)
  if (
    new Set(left).size !== left.length ||
    new Set(right).size !== right.length ||
    left.length !== right.length ||
    left.some((key) => !right.includes(key))
  )
    throw new Error('Registered route/contract parity failed')
  const ids = expected.map(operationId)
  if (new Set(ids).size !== ids.length) throw new Error('Duplicate operation ID')
}
