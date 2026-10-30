import type { EmailAdapter } from '../../src/modules/notifications/notification.types.js'
import { createServer, type Server } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import {
  legacyRegistrationNotificationValidator,
  adminResetNotificationValidator,
  guestNotificationValidator,
  registrationNotificationValidator,
} from '../../src/modules/notifications/notification.persistence.js'
import { createResendAdapter } from '../../src/providers/email/resend.client.js'
import { createNotificationDeliveryService } from '../../src/modules/notifications/notification-delivery.service.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { isolatedDatabase } from '../helpers/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let store: ReturnType<typeof createRegistrationNotifications>
let server: Server, url: string
let responseStatus = 200,
  timeout = false
let calls: {
  headers: import('node:http').IncomingHttpHeaders
  body: unknown
}[] = []
let now = Date.now()
const clock = () => new Date(now)
const policy = {
  maxAttempts: 3,
  baseDelayMs: 100,
  maxDelayMs: 1000,
  claimTtlMs: 10000,
  batchSize: 5,
}
const timers = new Set<ReturnType<typeof setTimeout>>()
function adapter(timeoutMs = 1000) {
  return createResendAdapter(
    { apiKey: 'synthetic-private-key', from: 'sender@example.test', timeoutMs },
    (_input, init) => fetch(url, init),
  )
}
async function enqueue() {
  return inTransaction(fixture.connection, async (session) => {
    const user = await new models.users({
      name: 'Synthetic',
      emailNormalized: `fixture_${randomUUID()}@example.test`,
      passwordHash: 'synthetic_hash',
      role: 'customer',
    }).save({ session })
    await store.enqueue({ userId: user._id, email: user.emailNormalized, name: user.name }, session)
    return user
  })
}
async function row(userId: Types.ObjectId) {
  const result = await fixture.connection.db?.collection('notifications').findOne({ userId })
  if (!result) throw new Error('Missing synthetic intent')
  return result
}
beforeAll(async () => {
  fixture = await isolatedDatabase()
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  store = createRegistrationNotifications(fixture.connection, clock)
  await store.initialize()
  server = createServer(async (req, res) => {
    const parts: Buffer[] = []
    for await (const part of req) parts.push(Buffer.from(part))
    calls.push({
      headers: req.headers,
      body: JSON.parse(Buffer.concat(parts).toString()),
    })
    if (timeout) {
      const timer = setTimeout(() => {
        timers.delete(timer)
        if (!res.destroyed) {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{"id":"synthetic-late-id"}')
        }
      }, 300)
      timers.add(timer)
      return
    }
    res.writeHead(responseStatus, { 'Content-Type': 'application/json' })
    res.end(
      JSON.stringify(
        responseStatus === 200
          ? { id: 'synthetic-provider-id' }
          : { error: 'synthetic-private-provider-detail' },
      ),
    )
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing local provider port')
  url = `http://127.0.0.1:${address.port}/emails`
})
beforeEach(async () => {
  now = Date.now()
  calls = []
  responseStatus = 200
  timeout = false
  await fixture.connection.db?.collection('notifications').deleteMany({})
})
afterAll(async () => {
  for (const timer of timers) clearTimeout(timer)
  server?.closeAllConnections()
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()))
  await fixture?.close()
})
describe('durable registration email pipeline with real MongoDB and local HTTP provider', () => {
  it('delivers an independently committed registration once and records provider acceptance without changing account', async () => {
    const user = await enqueue(),
      before = (await models.users.findById(user._id))?.toObject()
    now += 10
    const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
    expect(await worker.runBatch()).toEqual({ processed: 1 })
    expect(await worker.runBatch()).toEqual({ processed: 0 })
    expect(calls).toHaveLength(1)
    const intent = await row(user._id)
    expect(intent).toMatchObject({
      status: 'sent',
      attemptCount: 1,
      providerMessageId: 'synthetic-provider-id',
    })
    expect(calls[0]?.headers['idempotency-key']).toMatch(/^sz-notification-[a-f0-9]{64}$/)
    expect(calls[0]?.body).toMatchObject({
      to: [user.emailNormalized],
      subject: 'Welcome to SportZone',
    })
    expect((await models.users.findById(user._id))?.toObject()).toEqual(before)
    const state = await store.status(intent._id)
    expect(JSON.stringify(state)).not.toMatch(/recipient|password|claimId|eventKey|payload/)
  })
  it('retries confirmed rate-limit rejection with bounded backoff and unchanged idempotency key', async () => {
    const user = await enqueue()
    now += 10
    responseStatus = 429
    const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
    await worker.runBatch()
    expect((await row(user._id)).status).toBe('retry_wait')
    expect(await worker.runBatch()).toEqual({ processed: 0 })
    now += 100
    await worker.runBatch()
    expect((await row(user._id)).attemptCount).toBe(2)
    expect(calls[0]?.headers['idempotency-key']).toBe(calls[1]?.headers['idempotency-key'])
    now += 199
    expect(await worker.runBatch()).toEqual({ processed: 0 })
    now += 1
    responseStatus = 200
    await worker.runBatch()
    expect((await row(user._id)).status).toBe('sent')
    expect(await models.users.exists({ _id: user._id })).not.toBeNull()
  })
  it('caps retry delay and does not send until the capped due time', async () => {
    const user = await enqueue()
    now += 10
    responseStatus = 429
    const worker = createNotificationDeliveryService(
      store,
      adapter(),
      { ...policy, maxDelayMs: 150 },
      clock,
    )
    await worker.runBatch()
    now += 100
    await worker.runBatch()
    expect((await row(user._id)).nextAttemptAt).toEqual(new Date(now + 150))
    now += 149
    expect(await worker.runBatch()).toEqual({ processed: 0 })
    now += 1
    responseStatus = 200
    await worker.runBatch()
    expect((await row(user._id)).status).toBe('sent')
  })
  it('stops at maximum attempts, preserving account and one logical event', async () => {
    const user = await enqueue()
    now += 10
    responseStatus = 429
    const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
    await worker.runBatch()
    now += 100
    await worker.runBatch()
    now += 200
    await worker.runBatch()
    now += 1000000
    await worker.runBatch()
    expect(calls).toHaveLength(3)
    expect(await row(user._id)).toMatchObject({
      status: 'failed',
      attemptCount: 3,
    })
    expect(
      await fixture.connection.db?.collection('notifications').countDocuments({ userId: user._id }),
    ).toBe(1)
    expect(await models.users.exists({ _id: user._id })).not.toBeNull()
  })
  it.each([401, 422])('does not retry permanent provider rejection %s', async (status) => {
    const user = await enqueue()
    now += 10
    responseStatus = status
    const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
    await worker.runBatch()
    now += 1000000
    await worker.runBatch()
    expect((await row(user._id)).status).toBe('failed')
    expect(calls).toHaveLength(1)
  })
  it.each([409, 500, 503])(
    'preserves uncertain HTTP %s without auto resend even beyond provider idempotency lifetime',
    async (status) => {
      const user = await enqueue()
      now += 10
      responseStatus = status
      const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
      await worker.runBatch()
      now += 2 * 86400000
      await worker.runBatch()
      expect((await row(user._id)).status).toBe('delivery_uncertain')
      expect(calls).toHaveLength(1)
    },
  )
  it('persists timeout uncertainty and never repeats the business operation', async () => {
    const user = await enqueue()
    now += 10
    timeout = true
    await createNotificationDeliveryService(store, adapter(50), policy, clock).runBatch()
    now += 1000000
    timeout = false
    await createNotificationDeliveryService(store, adapter(), policy, clock).runBatch()
    expect((await row(user._id)).status).toBe('delivery_uncertain')
    expect(calls).toHaveLength(1)
    expect(await models.users.exists({ _id: user._id })).not.toBeNull()
  })
  it('has one conditional claim under concurrent workers', async () => {
    const user = await enqueue()
    now += 10
    await Promise.all([
      createNotificationDeliveryService(store, adapter(), policy, clock).runBatch(),
      createNotificationDeliveryService(store, adapter(), policy, clock).runBatch(),
    ])
    expect(calls).toHaveLength(1)
    expect((await row(user._id)).attemptCount).toBe(1)
  })
  it('recovers a crashed sending claim into uncertainty without invoking the provider', async () => {
    const user = await enqueue()
    now += 10
    const claim = await store.claim(clock(), policy.claimTtlMs, policy.maxAttempts)
    expect(claim).not.toBeNull()
    now += policy.claimTtlMs
    await createNotificationDeliveryService(store, adapter(), policy, clock).runBatch()
    expect((await row(user._id)).status).toBe('delivery_uncertain')
    expect(calls).toHaveLength(0)
    if (!claim) throw new Error('Missing claim')
    await store.finish(
      claim.id,
      claim.claimId,
      { kind: 'accepted', providerMessageId: 'synthetic-late-receipt' },
      clock(),
      3,
      100,
    )
    expect((await row(user._id)).status).toBe('sent')
  })
  it('fences stale completion from a prior attempt and records only the active receipt', async () => {
    const user = await enqueue()
    now += 10
    const first = await store.claim(clock(), 10000, 3)
    if (!first) throw new Error('Missing first claim')
    await store.finish(
      first.id,
      first.claimId,
      { kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' },
      clock(),
      3,
      100,
    )
    now += 100
    const second = await store.claim(clock(), 10000, 3)
    if (!second) throw new Error('Missing second claim')
    await store.finish(
      first.id,
      first.claimId,
      { kind: 'accepted', providerMessageId: 'stale-id' },
      clock(),
      3,
      100,
    )
    expect((await row(user._id)).status).toBe('sending')
    await store.finish(
      second.id,
      second.claimId,
      { kind: 'accepted', providerMessageId: 'current-id' },
      clock(),
      3,
      100,
    )
    expect((await row(user._id)).providerMessageId).toBe('current-id')
  })
  it('uses a bounded batch and transaction-only intent writes with stable deduplication', async () => {
    const a = await enqueue()
    await enqueue()
    now += 10
    expect(
      await createNotificationDeliveryService(
        store,
        adapter(),
        { ...policy, batchSize: 1 },
        clock,
      ).runBatch(),
    ).toEqual({ processed: 1 })
    expect(calls).toHaveLength(1)
    const session = await fixture.connection.startSession()
    try {
      await expect(
        store.enqueue({ userId: a._id, name: a.name, email: a.emailNormalized }, session),
      ).rejects.toThrow('business transaction')
    } finally {
      await session.endSession()
    }
    await inTransaction(fixture.connection, async (session) => {
      await store.enqueue({ userId: a._id, name: a.name, email: a.emailNormalized }, session)
    })
    expect(
      await fixture.connection.db?.collection('notifications').countDocuments({ userId: a._id }),
    ).toBe(1)
  })
  it('refuses worker and provider dispatch inside a business transaction before any side effect', async () => {
    await enqueue()
    now += 10
    const worker = createNotificationDeliveryService(store, adapter(), policy, clock)
    await expect(
      inTransaction(fixture.connection, async () => worker.runBatch()),
    ).rejects.toMatchObject({ code: 'EXTERNAL_EFFECT_IN_TRANSACTION' })
    await expect(
      inTransaction(fixture.connection, async () =>
        adapter().send({
          to: 'recipient@example.test',
          subject: 'Synthetic',
          text: 'Synthetic',
          idempotencyKey: 'synthetic-key',
        }),
      ),
    ).rejects.toMatchObject({ code: 'EXTERNAL_EFFECT_IN_TRANSACTION' })
    expect(calls).toHaveLength(0)
  })
  it('rolls back intent with business failure and makes no provider call', async () => {
    await expect(
      inTransaction(fixture.connection, async (session) => {
        const user = await new models.users({
          name: 'Synthetic rollback',
          emailNormalized: `rollback_${randomUUID()}@example.test`,
          passwordHash: 'synthetic_hash',
          role: 'customer',
        }).save({ session })
        await store.enqueue(
          { userId: user._id, email: user.emailNormalized, name: user.name },
          session,
        )
        throw new Error('Synthetic rollback')
      }),
    ).rejects.toThrow('Synthetic rollback')
    now += 10
    await createNotificationDeliveryService(store, adapter(), policy, clock).runBatch()
    expect(calls).toHaveLength(0)
    expect(await fixture.connection.db?.collection('notifications').countDocuments()).toBe(0)
  })
  it('expands only the exact legacy validator additively and preserves records/status across repeated migration', async () => {
    const user = await enqueue(),
      before = await row(user._id)
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: legacyRegistrationNotificationValidator,
    })
    await fixture.connection.db?.collection('notifications').dropIndex('notifications_claim_expiry')
    await expect(store.verifyIndexes()).rejects.toThrow('validator')
    await store.migrateFoundation()
    await store.migrateFoundation()
    await store.verifyIndexes()
    expect(await row(user._id)).toEqual(before)
    const indexes = await fixture.connection.db?.collection('notifications').indexes()
    expect(indexes?.some((i) => i.name === 'notifications_claim_expiry')).toBe(true)
    await fixture.connection.db?.command({
      collMod: 'notifications',
      validator: { $jsonSchema: { bsonType: 'object' } },
    })
    try {
      await expect(store.migrateFoundation()).rejects.toThrow('reviewed migration')
    } finally {
      await fixture.connection.db?.command({
        collMod: 'notifications',
        validator: registrationNotificationValidator,
      })
    }
  })
  it('retains legacy sending ambiguity and exhausts old queued rows without an external effect', async () => {
    const user = await enqueue()
    await fixture.connection.db
      ?.collection('notifications')
      .updateOne({ userId: user._id }, { $set: { status: 'sending' } })
    await store.recover(clock(), 5, 3)
    expect((await row(user._id)).status).toBe('delivery_uncertain')
    const other = await enqueue()
    await fixture.connection.db
      ?.collection('notifications')
      .updateOne({ userId: other._id }, { $set: { attemptCount: 3 } })
    await store.recover(clock(), 5, 3)
    expect((await row(other._id)).status).toBe('failed')
    expect(calls).toHaveLength(0)
  })
  it('records rejected adapter exceptions as uncertainty with no leaked payload', async () => {
    const user = await enqueue()
    now += 10
    const failing: EmailAdapter = {
      send: async () => {
        throw new Error('synthetic-private-key:recipient@example.test')
      },
    }
    await createNotificationDeliveryService(store, failing, policy, clock).runBatch()
    const result = await row(user._id)
    expect(result.status).toBe('delivery_uncertain')
    expect(result.lastErrorCode).toBe('PROVIDER_UNCERTAIN')
  })
})

it('explicitly migrates the prior admin-reset validator while preserving existing notification evidence', async () => {
  const user = await enqueue(),
    prior = await row(user._id)
  await fixture.connection.db?.command({
    collMod: 'notifications',
    validator: adminResetNotificationValidator,
  })
  await expect(store.initialize()).rejects.toThrow('reviewed migration')
  await store.migrateFoundation()
  expect((await row(user._id))._id).toEqual(prior._id)
  await store.verifyIndexes()
})

it('migrates the exact guest/order notification predecessor without rewriting its evidence', async () => {
  const user = await enqueue(),
    prior = await row(user._id)
  await fixture.connection.db?.command({
    collMod: 'notifications',
    validator: guestNotificationValidator,
  })
  await expect(store.verifyIndexes()).rejects.toThrow('validator')
  await store.migrateFoundation()
  await store.migrateFoundation()
  expect(await row(user._id)).toEqual(prior)
  await store.verifyIndexes()
})
