import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createHash, randomBytes } from 'node:crypto'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { checkoutAccess as realCheckoutAccess } from '../../src/modules/auth/checkout-access.service.js'
import { Types } from 'mongoose'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { testEnvironment } from '../helpers/environment.js'
import { isolatedDatabase } from '../helpers/database.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import {
  checkoutIntentService,
  type CheckoutCompletion,
} from '../../src/modules/checkout/checkout-intent.service.js'
import { checkoutIntentModel } from '../../src/modules/checkout/checkout-intent.model.js'
import {
  initializeCheckoutIntentPersistence,
  checkoutIntentValidator,
} from '../../src/modules/checkout/checkout-intent.persistence.js'
import { checkoutQuoteModel } from '../../src/modules/checkout/checkout-quote.model.js'
import { initializeCheckoutQuotePersistence } from '../../src/modules/checkout/checkout-quote.persistence.js'
import { checkoutSubmitInput } from '../../src/modules/checkout/checkout.schema.js'
import { checkoutDraftFingerprint } from '../../src/modules/checkout/checkout-consent.service.js'
import { orderService, checkoutOrderReadAccess } from '../../src/modules/orders/order.service.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
import type {
  CheckoutPrincipal,
  checkoutAccess,
} from '../../src/modules/auth/checkout-access.service.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let currentTime: Date
let revalidations = 0
const principal: CheckoutPrincipal = { scopeType: 'guest_context', scopeKeyHash: 'a'.repeat(64) }
const key = 'synthetic-intent-key'
async function stage(userId?: string, scopeKeyHash = principal.scopeKeyHash) {
  const proof = syntheticOrderProof({ ...(userId ? { userId } : {}) })
  await checkoutQuoteModel(db.connection).create({
    _id: proof.quoteId,
    scopeType: userId ? 'customer' : 'guest_context',
    scopeKeyHash,
    requestFingerprint: checkoutDraftFingerprint(proof.snapshot.draft),
    commercialSnapshot: proof.snapshot,
    commercialDigest: proof.commercialDigest,
    quotedAt: new Date(proof.snapshot.deadlineBasis.capturedAt),
    expiresAt: new Date('2026-10-27T00:00:00Z'),
  })
  const input = {
    items: proof.snapshot.draft.items,
    recipient: proof.snapshot.draft.recipient,
    email: proof.snapshot.draft.customer.email,
    method: proof.snapshot.draft.method,
    ...(proof.snapshot.draft.couponCode ? { couponCode: proof.snapshot.draft.couponCode } : {}),
    quoteId: proof.quoteId,
    acceptedTermsVersion: proof.snapshot.policyVersions.find((p) => p.type === 'terms')?.version,
    acceptedPolicyVersionIds: proof.snapshot.policyVersions.map((p) => p.version),
  }
  return { proof, input }
}
function service(
  proof: ReturnType<typeof syntheticOrderProof>,
  options: {
    principal?: CheckoutPrincipal
    failAudit?: boolean
    deny?: boolean
    access?: ReturnType<typeof checkoutAccess>
    completion?: CheckoutCompletion
  } = {},
) {
  // Isolated access/revalidation doubles; real auth/current commercial validation is covered by
  // checkout-quote tests. Real quotes/intents/orders/balances/audit share the transaction here.
  const access: ReturnType<typeof checkoutAccess> = {
    owned: (_credentials, work) => {
      if (options.deny) return Promise.reject(new ApiError('AUTH_REQUIRED'))
      return inTransaction(db.connection, (session) =>
        work(options.principal ?? principal, session),
      )
    },
  }
  return checkoutIntentService(
    db.connection,
    options.access ?? access,
    {
      async revalidate(p, raw, session) {
        const input = checkoutSubmitInput.parse(raw)
        revalidations++
        const row = await checkoutQuoteModel(db.connection)
          .findOne({
            _id: input.quoteId,
            scopeType: p.scopeType,
            scopeKeyHash: p.scopeKeyHash,
          })
          .session(session)
        if (!row) throw new ApiError('NOT_FOUND')
        if (row.status !== 'open') throw new ApiError('STATE_CONFLICT')
        if (row.expiresAt <= currentTime) throw new ApiError('QUOTE_EXPIRED')
        return {
          quoteId: proof.quoteId,
          snapshot: proof.snapshot,
          commercialDigest: proof.commercialDigest,
        }
      },
    },
    options.completion ?? {
      async complete(session, accepted, operationKey) {
        await orderService(
          db.connection,
          { authorize: async () => accepted },
          options.failAudit
            ? async () => {
                throw new Error('Synthetic audit failure')
              }
            : createAuditWriter(db.connection),
          () => currentTime,
        ).create(session, {
          orderId: accepted.orderId,
          checkoutIntentId: accepted.checkoutIntentId,
          operationKey,
        })
      },
      read: checkoutOrderReadAccess(db.connection),
    },
    () => currentTime,
  )
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeCheckoutIntentPersistence(db.connection)
  await initializeCheckoutQuotePersistence(db.connection)
  await initializeOrderPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
})
beforeEach(async () => {
  currentTime = new Date(orderTestTime)
  revalidations = 0
  for (const name of [
    'checkoutIntents',
    'checkoutQuotes',
    'orders',
    'orderItemBalances',
    'auditLogs',
  ])
    await db.connection.db?.collection(name).deleteMany({})
})
afterAll(async () => {
  await db?.close()
})
it('commits one order, durable hashed identity, consumed consent and balances; replay returns it', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  const first = await api.submit({ customerPresent: false }, input, key)
  expect(await api.submit({ customerPresent: false }, input, key)).toEqual(first)
  expect(revalidations).toBe(1)
  const intent = await checkoutIntentModel(db.connection).findOne().orFail()
  expect(intent.status).toBe('order_created')
  expect(intent.orderId?.toHexString()).toBe(first.id)
  expect(JSON.stringify(intent)).not.toContain(key)
  expect(Object.keys(intent.toObject().resultSnapshot ?? {})).toEqual(['orderId'])
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
  expect(await db.connection.db?.collection('auditLogs').countDocuments()).toBe(1)
})
it('concurrent identical submissions resolve to one committed order', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  const results = await Promise.all(
    Array.from({ length: 5 }, () => api.submit({ customerPresent: false }, input, key)),
  )
  expect(new Set(results.map((result) => result.id)).size).toBe(1)
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(1)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
})
it('rejects changed payload with the same key before inspecting even an expired quote', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  await api.submit({ customerPresent: false }, input, key)
  currentTime = new Date('2027-01-01T00:00:00Z')
  await expect(
    api.submit({ customerPresent: false }, { ...input, notes: 'changed' }, key),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect(revalidations).toBe(1)
})
it('returns current authoritative status after quote expiry, retirement and later fulfillment changes', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  const first = await api.submit({ customerPresent: false }, input, key)
  await checkoutIntentModel(db.connection).updateOne(
    {},
    { $set: { replayUntil: new Date(0), status: 'resolved' } },
  )
  await orderModels(db.connection).orders.updateOne(
    { _id: first.id, fulfillmentStatus: 'pending' },
    { $set: { fulfillmentStatus: 'confirmed' }, $inc: { revision: 1 } },
  )
  currentTime = new Date('2027-01-01T00:00:00Z')
  expect(await api.submit({ customerPresent: false }, input, key)).toMatchObject({
    id: first.id,
    fulfillmentStatus: 'confirmed',
    revision: 1,
  })
  expect(revalidations).toBe(1)
})
it('two concurrent keys cannot consume one quote twice or expose another order', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  const results = await Promise.allSettled([
    api.submit({ customerPresent: false }, input, key),
    api.submit({ customerPresent: false }, input, 'other-key'),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const rejected = results.find((result) => result.status === 'rejected')
  expect(rejected?.status === 'rejected' && rejected.reason).toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
})
it('rolls back intent, quote consumption, order and balances on audit failure then permits safe retry', async () => {
  const { proof, input } = await stage()
  await expect(
    service(proof, { failAudit: true }).submit({ customerPresent: false }, input, key),
  ).rejects.toThrow('Synthetic audit failure')
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(0)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(0)
  expect(await orderModels(db.connection).balances.countDocuments()).toBe(0)
  expect((await checkoutQuoteModel(db.connection).findById(input.quoteId))?.status).toBe('open')
  await service(proof).submit({ customerPresent: false }, input, key)
})
it('authenticates every replay and separates guest/customer/browser scopes without leaking outcome', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  await api.submit({ customerPresent: false }, input, key)
  await expect(
    service(proof, { deny: true }).submit({ customerPresent: false }, input, key),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  await expect(
    service(proof, {
      principal: { scopeType: 'guest_context', scopeKeyHash: 'b'.repeat(64) },
    }).submit({ customerPresent: false }, input, key),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
})
it('fails closed on preparing tombstones and broken committed order pointers without new creation', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  const first = await api.submit({ customerPresent: false }, input, key)
  await orderModels(db.connection).orders.deleteOne({ _id: first.id })
  await expect(api.submit({ customerPresent: false }, input, key)).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  await checkoutIntentModel(db.connection).updateOne(
    {},
    { $set: { status: 'preparing' }, $unset: { orderId: 1, resultSnapshot: 1 } },
  )
  await expect(api.submit({ customerPresent: false }, input, key)).rejects.toMatchObject({
    code: 'STATE_CONFLICT',
  })
  expect(revalidations).toBe(1)
})
it('rejects first-time expired quotes and invalid keys without retaining a partial identity', async () => {
  const { proof, input } = await stage(),
    api = service(proof)
  await expect(api.submit({ customerPresent: false }, input, '')).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  })
  currentTime = new Date('2027-01-01T00:00:00Z')
  await expect(api.submit({ customerPresent: false }, input, key)).rejects.toMatchObject({
    code: 'QUOTE_EXPIRED',
  })
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(0)
})
it('fails readiness before consumption for a missing unique index and refuses validator drift', async () => {
  const { proof, input } = await stage()
  await checkoutIntentModel(db.connection).collection.dropIndex('checkout_intent_key_unique')
  try {
    await expect(
      service(proof).submit({ customerPresent: false }, input, key),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  } finally {
    await initializeCheckoutIntentPersistence(db.connection)
  }
  await db.connection.db?.command({ collMod: 'checkoutIntents', validator: {} })
  try {
    await expect(initializeCheckoutIntentPersistence(db.connection)).rejects.toThrow(
      'reviewed bootstrap',
    )
    await expect(
      service(proof).submit({ customerPresent: false }, input, key),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  } finally {
    await db.connection.db?.command({
      collMod: 'checkoutIntents',
      validator: checkoutIntentValidator,
    })
  }
})
it('strict persistence rejects secret results, malformed outcomes and TTL expiry on the registry', async () => {
  const { proof, input } = await stage()
  await service(proof).submit({ customerPresent: false }, input, key)
  await expect(
    checkoutIntentModel(db.connection).collection.updateOne(
      {},
      {
        $set: {
          resultSnapshot: {
            orderId: new Types.ObjectId(),
            redirectUrl: 'https://example.test/secret',
          },
        },
      },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    checkoutIntentModel(db.connection).collection.updateOne(
      {},
      { $set: { 'resultSnapshot.orderId': new Types.ObjectId() } },
    ),
  ).rejects.toMatchObject({ code: 121 })
  await checkoutIntentModel(db.connection).collection.createIndex(
    { replayUntil: 1 },
    { expireAfterSeconds: 0, name: 'synthetic_ttl' },
  )
  try {
    await expect(
      service(proof).submit({ customerPresent: false }, input, key),
    ).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  } finally {
    await checkoutIntentModel(db.connection).collection.dropIndex('synthetic_ttl')
  }
})
it('compiled bootstrap is additive, preserves the registry and refuses production', async () => {
  const { proof, input } = await stage()
  await service(proof).submit({ customerPresent: false }, input, key)
  const env = {
    ...testEnvironment(),
    APP_ENV: 'test',
    NODE_ENV: 'test',
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let i = 0; i < 2; i++)
    await promisify(execFile)(process.execPath, ['scripts/bootstrap-checkout-intents.mjs'], {
      cwd: process.cwd(),
      env,
    })
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(1)
  await expect(
    promisify(execFile)(process.execPath, ['scripts/bootstrap-checkout-intents.mjs'], {
      cwd: process.cwd(),
      env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    }),
  ).rejects.toThrow()
})

it('uses actual customer/session authorization on every replay and rejects revoked or wrong owners', async () => {
  const identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  const user = await identities.users.create({
    name: 'Synthetic buyer',
    emailNormalized: 'intent-buyer@example.test',
    passwordHash: 'synthetic_hash',
    role: 'customer',
  })
  const sessions = createSessionService(db.connection, identities, {
    secret: randomBytes(32).toString('hex'),
    customerTtlSeconds: 600,
    adminTtlSeconds: 300,
    sameSite: 'lax',
    appEnvironment: 'test',
    apiOrigin: 'http://localhost:4000',
  })
  const security = createBrowserSecurity(db.connection, identities, sessions, {
    secret: randomBytes(32).toString('hex'),
    contextTtlSeconds: 1800,
    storefrontOrigin: 'http://localhost:3000',
    adminOrigin: 'http://localhost:5173',
  })
  const access = realCheckoutAccess(
    createCustomerAccountAccess(db.connection, identities, sessions),
    security,
  )
  const scopeHash = createHash('sha256').update(`customer:${user._id.toHexString()}`).digest('hex')
  const { proof, input } = await stage(user._id.toHexString(), scopeHash)
  const issued = await sessions.issue('customer', user._id)
  const credentials = { customerPresent: true, customerToken: issued.token }
  const api = service(proof, { access })
  const result = await api.submit(credentials, input, key)
  currentTime = new Date('2027-01-01T00:00:00Z')
  expect(await api.submit(credentials, input, key)).toEqual(result)
  const intent = await checkoutIntentModel(db.connection).findOne().orFail()
  await expect(
    inTransaction(db.connection, (session) =>
      checkoutOrderReadAccess(db.connection)(
        session,
        principal,
        result.id,
        intent._id.toHexString(),
      ),
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await identities.users.updateOne({ _id: user._id }, { $set: { status: 'suspended' } })
  await expect(api.submit(credentials, input, key)).rejects.toBeInstanceOf(ApiError)
  expect(await orderModels(db.connection).orders.countDocuments()).toBe(1)
})
it('rolls back consumed consent if the required completion adapter cannot produce its matching order', async () => {
  const { proof, input } = await stage()
  await expect(
    service(proof, {
      completion: { complete: async () => {}, read: checkoutOrderReadAccess(db.connection) },
    }).submit({ customerPresent: false }, input, key),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect(await checkoutIntentModel(db.connection).countDocuments()).toBe(0)
  expect((await checkoutQuoteModel(db.connection).findById(input.quoteId))?.status).toBe('open')
})
