import {
  zoneInput,
  zonePatch,
  zoneView,
  zoneParams,
  zoneQuery,
  chargeInput,
  chargeView,
  chargeQuery,
  chargeParams,
  chargeActivate,
  chargeDeactivate,
  chargeSupersede,
  chargeReplacement,
} from '../src/modules/delivery/delivery.schema.js'
import {
  settingsPatch,
  settingsView,
  publicContact,
} from '../src/modules/settings/settings.schema.js'
import {
  policyDraftInput,
  policyDraftPatch,
  policyParams,
  policyListQuery,
  policyDocument,
  policySummary,
  policyCreated,
  policyApprove,
  policyPublish,
  policyPublication,
  policyPublic,
  policyType,
} from '../src/modules/settings/policy.schema.js'
import {
  productCreate,
  productPatch,
  productDeactivate,
  productParams,
  productListQuery,
  adminProduct,
  adminProductDetail,
} from '../src/modules/catalog/products/product-admin.schema.js'
import {
  variantInput,
  variantPatch,
  variantParams as adminVariantParams,
  variantDeactivate,
} from '../src/modules/catalog/variants/variant.schema.js'
import {
  categoryCreate,
  categoryPatch,
  categoryDeactivate,
  categoryParams,
  categoryListQuery,
  adminCategory,
} from '../src/modules/catalog/categories/category-admin.schema.js'
import { adminVariant } from '../src/modules/catalog/variants/variant.schema.js'
import {
  inventoryQuery,
  movementQuery,
  inventoryParams,
  inventoryList,
  movementView,
  adjustmentBody,
  adjustmentResult,
} from '../src/modules/inventory/inventory-admin.schema.js'
import {
  couponInput,
  couponPatch,
  couponDeactivate,
  couponAdmin,
  couponHistory,
  couponParams,
  couponListQuery,
  couponHistoryQuery,
} from '../src/modules/promotions/coupon-admin.schema.js'
import {
  wishlistParams,
  wishlistResponse,
  wishlistSaved,
} from '../src/modules/cart/wishlist.schema.js'
import {
  cartMerge,
  cartMergeResponse,
  cartQuantity,
  cartResponse,
  variantParams,
} from '../src/modules/cart/cart.schema.js'
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
  idempotency?: boolean
  ifMatch?: boolean
  etag?: boolean
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
  ...(
    [
      {
        method: 'GET',
        path: '/admin/delivery/zones',
        query: zoneQuery,
        params: empty,
        response: z.array(zoneView),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/zones',
        query: empty,
        params: empty,
        request: zoneInput,
        response: zoneView,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/delivery/zones/{zoneId}',
        query: empty,
        params: zoneParams,
        request: zonePatch,
        response: zoneView,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'GET',
        path: '/admin/delivery/charges',
        query: chargeQuery,
        params: empty,
        response: z.array(chargeView),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges',
        query: empty,
        params: empty,
        request: chargeInput,
        response: chargeView,
        status: 201,
        etag: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/activate',
        query: empty,
        params: chargeParams,
        request: chargeActivate,
        response: chargeView,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/deactivate',
        query: empty,
        params: chargeParams,
        request: chargeDeactivate,
        response: chargeView,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/delivery/charges/{chargeId}/supersede',
        query: empty,
        params: chargeParams,
        request: chargeSupersede,
        response: chargeReplacement,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed delivery indexes, canonical settings singleton and audit persistence. Only operator-configured coverage; no legal deadline or provider activation implied.',
      replay:
        'Revision CAS, durable actor/payload/revision/key-bound command replay and store-wide delivery coverage serialization; immutable charge versions and transactional audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/settings',
        query: empty,
        params: empty,
        response: settingsView,
        status: 200,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/settings',
        query: empty,
        params: empty,
        request: settingsPatch,
        response: settingsView,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'GET',
        path: '/admin/settings/policies',
        query: policyListQuery,
        params: empty,
        response: z.array(policySummary),
        status: 200,
        paginated: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies',
        query: empty,
        params: empty,
        request: policyDraftInput,
        response: policyCreated,
        status: 201,
        etag: true,
      },
      {
        method: 'GET',
        path: '/admin/settings/policies/{policyId}',
        query: empty,
        params: policyParams,
        response: policyDocument,
        status: 200,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/settings/policies/{policyId}',
        query: empty,
        params: policyParams,
        request: policyDraftPatch,
        response: policyDocument,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies/{policyId}/approve',
        query: empty,
        params: policyParams,
        request: policyApprove,
        response: policyDocument,
        status: 200,
        etag: true,
        ifMatch: true,
        idempotency: true,
      },
      {
        method: 'POST',
        path: '/admin/settings/policies/{policyId}/publish',
        query: empty,
        params: policyParams,
        request: policyPublish,
        response: policyPublication,
        status: 200,
        ifMatch: true,
        idempotency: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; settings/policy indexes, canonical bootstrap and audit persistence. Approval requires a matching protected operator evidence register; media writes require explicit verified media composition.',
      replay:
        'Revision CAS; durable actor/payload/key-bound approval/publication replay; transactional effective pointer and audit',
    }),
  ),
  ...(
    [
      {
        method: 'GET',
        path: '/storefront/contact',
        query: empty,
        params: empty,
        response: publicContact,
        status: 200,
      },
      {
        method: 'GET',
        path: '/storefront/policies/{type}',
        query: empty,
        params: z.strictObject({ type: policyType }),
        response: policyPublic,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'public',
      namespace: 'storefront',
      csrf: false,
      activation:
        'Reviewed settings/policy persistence; only approved effective published pointers become public',
      replay: 'Read only; no drafts or private configuration',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/products',
        query: productListQuery,
        params: empty,
        response: z.array(adminProduct),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products',
        query: empty,
        params: empty,
        request: productCreate,
        response: adminProduct,
        etag: true,
        status: 201,
      },
      {
        method: 'GET',
        path: '/admin/products/{productId}',
        query: empty,
        params: productParams,
        response: adminProductDetail,
        etag: true,
        status: 200,
      },
      {
        method: 'PATCH',
        path: '/admin/products/{productId}',
        query: empty,
        params: productParams,
        request: productPatch,
        response: adminProduct,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products/{productId}/deactivate',
        query: empty,
        params: productParams,
        request: productDeactivate,
        response: adminProduct,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/products/{productId}/variants',
        query: empty,
        params: productParams,
        request: variantInput,
        response: adminVariant,
        etag: true,
        status: 201,
      },
      {
        method: 'PATCH',
        path: '/admin/variants/{variantId}',
        query: empty,
        params: adminVariantParams,
        request: variantPatch,
        response: adminVariant,
        etag: true,
        ifMatch: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/variants/{variantId}/deactivate',
        query: empty,
        params: adminVariantParams,
        request: variantDeactivate,
        response: adminVariant,
        etag: true,
        ifMatch: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed category/product/variant indexes and audit persistence; image writes require explicit verified media composition.',
      replay:
        'Strong revision CAS for edits; parent aggregate fence prevents invalid concurrent variants; immutable SKU/attribute identities and transactional media/audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/categories',
        query: categoryListQuery,
        params: empty,
        response: z.array(adminCategory),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/categories',
        query: empty,
        params: empty,
        request: categoryCreate,
        response: adminCategory,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/categories/{categoryId}',
        query: empty,
        params: categoryParams,
        request: categoryPatch,
        response: adminCategory,
        status: 200,
        etag: true,
        ifMatch: true,
      },
      {
        method: 'POST',
        path: '/admin/categories/{categoryId}/deactivate',
        query: empty,
        params: categoryParams,
        request: categoryDeactivate,
        response: adminCategory,
        status: 200,
        etag: true,
        ifMatch: true,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed category indexes and audit persistence. Image writes additionally require explicit verified media composition; no provider activation implied.',
      replay:
        'Revision CAS for edits/deactivation; guarded ancestry and transactional image references/audit',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/inventory',
        query: inventoryQuery,
        params: empty,
        response: inventoryList,
        paginated: true,
        status: 200,
      },
      {
        method: 'GET',
        path: '/admin/inventory/{variantId}/movements',
        query: movementQuery,
        params: inventoryParams,
        response: z.array(movementView),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/inventory/{variantId}/adjustments',
        query: empty,
        params: inventoryParams,
        request: adjustmentBody,
        response: adjustmentResult,
        idempotency: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation:
        'ADMIN_AUTH_ENABLED; reviewed product/inventory/audit persistence; inventory list additionally requires approved primary store settings.',
      replay:
        'Exactly-once adjustment per variant/key; actor/payload mismatch conflicts; threshold uses revision CAS',
    }),
  ),

  ...(
    [
      {
        method: 'GET',
        path: '/admin/coupons',
        query: couponListQuery,
        params: empty,
        response: z.array(couponAdmin),
        paginated: true,
        status: 200,
      },
      {
        method: 'POST',
        path: '/admin/coupons',
        request: couponInput,
        query: empty,
        params: empty,
        response: couponAdmin,
        status: 201,
        etag: true,
      },
      {
        method: 'PATCH',
        path: '/admin/coupons/{couponId}',
        request: couponPatch,
        query: empty,
        params: couponParams,
        response: couponAdmin,
        status: 200,
        ifMatch: true,
        etag: true,
      },
      {
        method: 'POST',
        path: '/admin/coupons/{couponId}/deactivate',
        request: couponDeactivate,
        query: empty,
        params: couponParams,
        response: couponAdmin,
        status: 200,
        ifMatch: true,
        etag: true,
      },
      {
        method: 'GET',
        path: '/admin/coupons/{couponId}/redemptions',
        query: couponHistoryQuery,
        params: couponParams,
        response: z.array(couponHistory),
        paginated: true,
        status: 200,
      },
    ] as const
  ).map(
    (op): Operation => ({
      ...op,
      access: 'admin',
      namespace: 'admin',
      csrf: op.method !== 'GET',
      activation: 'ADMIN_AUTH_ENABLED; reviewed promotion and audit persistence bootstrap required',
      replay: 'Revision CAS for edits; live hold snapshots and authoritative counters preserved',
    }),
  ),

  {
    method: 'POST',
    path: '/cart/merge',
    access: 'customer',
    activation: 'CUSTOMER_AUTH_ENABLED; reviewed cart persistence bootstrap required',
    request: cartMerge,
    response: cartMergeResponse,
    query: empty,
    params: empty,
    status: 200,
    csrf: true,
    namespace: 'storefront',
    replay:
      'Maximum saved/input quantity per variant; no additive replay effect or stock allocation',
  },
  ...(['GET', 'PUT', 'DELETE'] as const).map(
    (method): Operation => ({
      method,
      path: method === 'GET' ? '/wishlist' : '/wishlist/products/{productId}',
      access: 'customer',
      activation: 'CUSTOMER_AUTH_ENABLED; reviewed wishlist persistence bootstrap required',
      response: method === 'GET' ? wishlistResponse : wishlistSaved,
      query: empty,
      params: method === 'GET' ? empty : wishlistParams,
      status: 200,
      csrf: method !== 'GET',
      namespace: 'storefront',
      replay:
        method === 'GET'
          ? 'read'
          : 'Set membership; repeated add/remove is idempotent and does not allocate stock',
    }),
  ),
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
