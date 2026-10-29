import { createRegistrationNotifications } from '../../src/modules/notifications/notification.service.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Types } from 'mongoose'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { composeApplication } from '../../src/setup.js'
import { createLogger } from '../../src/shared/logger.js'
import { loadEnvironment } from '../../src/config/env.js'
import { testEnvironment, identityEnvironment } from '../helpers/environment.js'
import { isolatedDatabase } from '../helpers/database.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { guestSessionService } from '../../src/modules/auth/guest-access/guest-session.service.js'
import { paymentMethodAccess } from '../../src/modules/auth/checkout-access.service.js'
import {
  orderService,
  guestOrderAccess,
  paymentMethodOrderAccess,
} from '../../src/modules/orders/order.service.js'
import { initializeOrderPersistence } from '../../src/modules/orders/order.persistence.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
import { initializeSettingsPersistence } from '../../src/modules/settings/settings.persistence.js'
import { settingsModel } from '../../src/modules/settings/settings.model.js'
import { paymentChannelSettingsAccess } from '../../src/modules/settings/checkout-settings.service.js'
import { initializePaymentPersistence } from '../../src/modules/payments/payment.persistence.js'
import { checkoutPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import { paymentMethodsRoutes } from '../../src/modules/payments/payment-methods.routes.js'
import { paymentMethodsService } from '../../src/modules/payments/payment-methods.service.js'
import { verifiedMerchantChannels } from '../../src/modules/payments/payment-eligibility.service.js'
import type { PaymentChannelApproval } from '../../src/modules/payments/payment-eligibility.schema.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
let identities: ReturnType<typeof createIdentityModels>,
  sessions: ReturnType<typeof createSessionService>
let guests: ReturnType<typeof guestSessionService>, app: ReturnType<typeof createApp>
let now: number
let approvals: PaymentChannelApproval[]
const origin = 'https://shop.example.test',
  endpoint = '/api/v1/checkout/payment-methods'
const options = {
  secret: randomBytes(32).toString('hex'),
  customerTtlSeconds: 3600,
  adminTtlSeconds: 1800,
  sameSite: 'lax',
  appEnvironment: 'test',
  apiOrigin: 'https://api.example.test',
} as const
const flags = { bkashEnabled: true, nagadEnabled: true, rocketEnabled: true, codEnabled: true }
function rebuild(rows = approvals) {
  app = createApp({
    apiRouter: paymentMethodsRoutes(
      paymentMethodsService(db.connection, {
        access: paymentMethodAccess(
          createCustomerAccountAccess(db.connection, identities, sessions),
          guests,
        ),
        order: paymentMethodOrderAccess(db.connection),
        settings: paymentChannelSettingsAccess(db.connection),
        verified: verifiedMerchantChannels(rows, () => new Date(now)),
      }),
      [origin],
    ),
  })
}
async function customer() {
  const user = await identities.users.create({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role: 'customer',
  })
  const session = await sessions.issue('customer', user._id)
  return {
    id: user._id.toHexString(),
    cookie: `sz_customer_sid=${session.token}`,
    token: session.token,
  }
}
async function order(userId?: string, online = true) {
  const proof = syntheticOrderProof({ ...(userId ? { userId } : {}), online })
  const row = await inTransaction(db.connection, async (session) => {
    const created = await orderService(
      db.connection,
      { authorize: async () => proof },
      createAuditWriter(db.connection),
      () => orderTestTime,
    ).create(session, {
      orderId: proof.orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: `synthetic:${proof.checkoutIntentId}`,
    })
    await checkoutPaymentAccess(db.connection).create(session, {
      orderId: created.id,
      method: online ? 'online' : 'cod',
      expectedPoisha: proof.snapshot.pricing.finalTotalPoisha,
    })
    return created
  })
  return row
}
beforeAll(async () => {
  db = await isolatedDatabase()
  identities = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, identities)
  await initializeAuditPersistence(db.connection)
  await initializeOrderPersistence(db.connection)
  await initializePaymentPersistence(db.connection)
  await initializeSettingsPersistence(db.connection, 5)
  sessions = createSessionService(db.connection, identities, options)
  guests = guestSessionService(
    db.connection,
    identities,
    options,
    3600,
    guestOrderAccess(db.connection).verify,
    () => new Date(now),
  )
})
beforeEach(async () => {
  now = Date.now()
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { paymentChannels: flags } },
  )
  approvals = (['bkash', 'nagad', 'rocket'] as const).map((channel) => ({
    channel,
    appEnv: 'test',
    mode: 'sandbox',
    merchantAccountKey: 'b'.repeat(64),
    gatewayKey: `synthetic_${channel}`,
    minPoisha: 1000,
    maxPoisha: 50000,
    verifiedAt: new Date(now - 1000).toISOString(),
    validUntil: new Date(now + 60000).toISOString(),
    approvedBy: 'Synthetic reviewer',
    evidenceRef: 'synthetic:test',
    evidenceFile: 'synthetic.txt',
    evidenceDigest: 'a'.repeat(64),
  }))
  rebuild()
})
afterAll(async () => {
  await db?.close()
})
it('omits all online methods without verification despite enabled store flags; retains configured COD', async () => {
  rebuild([])
  const result = await request(app).get(endpoint).expect(200)
  expect(result.body.data.methods).toEqual([{ channel: 'cod', active: true, eligible: true }])
  expect(result.headers['cache-control']).toContain('no-store')
})
it('publishes only approved active channels with inclusive exact amount eligibility and no private evidence fields', async () => {
  const result = await request(app).get(`${endpoint}?amountPoisha=1000`).expect(200)
  expect(result.body.data.methods).toHaveLength(4)
  expect(result.body.data.methods.every((v: { eligible: boolean }) => v.eligible)).toBe(true)
  for (const forbidden of ['merchantAccountKey', 'gatewayKey', 'evidence', 'approvedBy'])
    expect(JSON.stringify(result.body)).not.toContain(forbidden)
  const below = await request(app).get(`${endpoint}?amountPoisha=999`).expect(200)
  expect(below.body.data.methods[1]).toMatchObject({
    channel: 'bkash',
    eligible: false,
    reasonCode: 'PAYMENT_AMOUNT_UNSUPPORTED',
  })
  const above = await request(app).get(`${endpoint}?amountPoisha=50001`).expect(200)
  expect(above.body.data.methods[1].eligible).toBe(false)
  const max = await request(app).get(`${endpoint}?amountPoisha=50000`).expect(200)
  expect(max.body.data.methods[1].eligible).toBe(true)
})
it('does not invent an eligible online amount when none is known', async () => {
  const result = await request(app).get(endpoint).expect(200)
  expect(result.body.data.methods[1]).toMatchObject({
    channel: 'bkash',
    active: true,
    eligible: false,
    reasonCode: 'AMOUNT_REQUIRED',
  })
})
it('rechecks expiry and current operator flags on subsequent reads', async () => {
  await settingsModel(db.connection).updateOne(
    { key: 'primary' },
    { $set: { 'paymentChannels.bkashEnabled': false, 'paymentChannels.codEnabled': false } },
  )
  const result = await request(app).get(`${endpoint}?amountPoisha=1000`).expect(200)
  expect(result.body.data.methods.map((v: { channel: string }) => v.channel)).toEqual([
    'nagad',
    'rocket',
  ])
  now += 60000
  expect((await request(app).get(endpoint).expect(200)).body.data.methods).toEqual([])
})
it('uses owned canonical remaining funding rather than advisory query amounts and restricts original method', async () => {
  const actor = await customer(),
    row = await order(actor.id)
  const result = await request(app)
    .get(`${endpoint}?orderId=${row.id}&amountPoisha=1`)
    .set('Cookie', actor.cookie)
    .expect(200)
  expect(result.body.data.methods).toHaveLength(3)
  expect(result.body.data.methods.every((v: { eligible: boolean }) => v.eligible)).toBe(true)
  const payment = await paymentModel(db.connection).findOne({ orderId: row.id }).orFail()
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    {
      $set: {
        merchandiseFundedPoisha: payment.expectedPoisha - 500,
        verifiedCollectedPoisha: payment.expectedPoisha - 500,
      },
    },
  )
  const remainder = await request(app)
    .get(`${endpoint}?orderId=${row.id}&amountPoisha=50000`)
    .set('Cookie', actor.cookie)
    .expect(200)
  expect(remainder.body.data.methods[0]).toMatchObject({
    eligible: false,
    reasonCode: 'PAYMENT_AMOUNT_UNSUPPORTED',
  })
  const cod = await order(actor.id, false)
  const codMethods = await request(app)
    .get(`${endpoint}?orderId=${cod.id}`)
    .set('Cookie', actor.cookie)
    .expect(200)
  expect(codMethods.body.data.methods.map((v: { channel: string }) => v.channel)).toEqual(['cod'])
})
it('denies cross-customer orders and invalid, revoked or suspended customer sessions', async () => {
  const owner = await customer(),
    stranger = await customer(),
    row = await order(owner.id)
  await request(app).get(`${endpoint}?orderId=${row.id}`).set('Cookie', stranger.cookie).expect(404)
  await request(app)
    .get(`${endpoint}?orderId=${row.id}`)
    .set('Cookie', 'sz_customer_sid=invalid')
    .expect(401)
  await identities.users.updateOne({ _id: owner.id }, { $set: { status: 'suspended' } })
  await request(app).get(`${endpoint}?orderId=${row.id}`).set('Cookie', owner.cookie).expect(401)
  await sessions.logout('customer', stranger.token)
  await request(app).get(`${endpoint}?orderId=${row.id}`).set('Cookie', stranger.cookie).expect(401)
})
it('requires scoped guest proof, rejects another guest/order and never falls back from an invalid customer cookie', async () => {
  const row = await order(),
    other = await order()
  const issued = await inTransaction(db.connection, (session) =>
    guests.issueAfterProof(session, row.id),
  )
  const cookie = `sz_guest_order_sid=${issued.token}`
  await request(app).get(`${endpoint}?orderId=${row.id}`).expect(401)
  await request(app).get(`${endpoint}?orderId=${row.id}`).set('Cookie', cookie).expect(200)
  await request(app).get(`${endpoint}?orderId=${other.id}`).set('Cookie', cookie).expect(401)
  await request(app)
    .get(`${endpoint}?orderId=${row.id}`)
    .set('Cookie', `${cookie}; sz_customer_sid=invalid`)
    .expect(401)
  await request(app)
    .get(`${endpoint}?orderId=${row.id}`)
    .set('Cookie', `${cookie}; ${cookie}`)
    .expect(401)
  const expiring = await inTransaction(db.connection, (session) =>
    guests.issueAfterProof(session, row.id),
  )
  now += 3600000
  await request(app)
    .get(`${endpoint}?orderId=${row.id}`)
    .set('Cookie', `sz_guest_order_sid=${expiring.token}`)
    .expect(401)
  await guests.logout(issued.token)
  await request(app).get(`${endpoint}?orderId=${row.id}`).set('Cookie', cookie).expect(401)
})
it('returns no methods for a fully funded online order', async () => {
  const actor = await customer(),
    row = await order(actor.id)
  const payment = await paymentModel(db.connection).findOne({ orderId: row.id }).orFail()
  await paymentModel(db.connection).updateOne(
    { _id: payment._id },
    {
      $set: {
        merchandiseFundedPoisha: payment.expectedPoisha,
        verifiedCollectedPoisha: payment.expectedPoisha,
        paymentStatus: 'paid',
      },
    },
  )
  const result = await request(app)
    .get(`${endpoint}?orderId=${row.id}`)
    .set('Cookie', actor.cookie)
    .expect(200)
  expect(result.body.data.methods).toEqual([])
})
it.each([
  'amountPoisha=-1',
  'amountPoisha=1.1',
  'amountPoisha=01',
  'amountPoisha=1&amountPoisha=2',
  'orderId=bad',
  'unknown=true',
])('validates query %s', async (query) => {
  await request(app).get(`${endpoint}?${query}`).expect(400)
})
it('enforces storefront origins, safe GET preflight, HEAD and no request bodies', async () => {
  await request(app).get(endpoint).set('Origin', 'https://attacker.test').expect(403)
  await request(app)
    .options(endpoint)
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'GET')
    .expect(204)
  await request(app)
    .options(endpoint)
    .set('Origin', origin)
    .set('Access-Control-Request-Method', 'POST')
    .expect(403)
  await request(app).get(endpoint).send({ extra: true }).expect(400)
  await request(app).head(endpoint).expect(200)
})
it('fails closed on missing settings persistence', async () => {
  await settingsModel(db.connection).collection.dropIndex('settings_primary_unique')
  try {
    await request(app).get(endpoint).expect(503)
  } finally {
    await initializeSettingsPersistence(db.connection, 5)
  }
})
it('root composition serves safe COD availability even without identity/checkout activation', async () => {
  const config = loadEnvironment(testEnvironment())
  const root = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
  )
  const result = await request(root).get(endpoint).expect(200)
  expect(result.body.data.methods).toEqual([{ channel: 'cod', active: true, eligible: true }])
})

it('returns no methods for cancelled orders and fails closed on missing canonical payment projections', async () => {
  const actor = await customer(),
    row = await order(actor.id)
  await orderModels(db.connection).orders.collection.updateOne(
    { _id: new Types.ObjectId(row.id) },
    { $set: { fulfillmentStatus: 'cancelled', cancelledAt: new Date() } },
  )
  expect(
    (
      await request(app)
        .get(`${endpoint}?orderId=${row.id}`)
        .set('Cookie', actor.cookie)
        .expect(200)
    ).body.data.methods,
  ).toEqual([])
  const broken = await order(actor.id)
  await paymentModel(db.connection).collection.deleteOne({ orderId: new Types.ObjectId(broken.id) })
  await request(app).get(`${endpoint}?orderId=${broken.id}`).set('Cookie', actor.cookie).expect(503)
})
it('root identity composition wires qualified methods and owned order reads without enabling initiation', async () => {
  await createRegistrationNotifications(db.connection).initialize()
  const config = loadEnvironment({ ...identityEnvironment(), SESSION_SECRET: options.secret })
  const actor = await customer(),
    row = await order(actor.id)
  const root = await composeApplication(
    db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
    undefined,
    [],
    undefined,
    approvals,
  )
  const result = await request(root)
    .get(`${endpoint}?orderId=${row.id}&amountPoisha=1`)
    .set('Cookie', actor.cookie)
    .expect(200)
  expect(result.body.data.methods).toHaveLength(3)
  expect(result.body.data.methods.every((v: { eligible: boolean }) => v.eligible)).toBe(true)
  await request(root)
    .post(`/api/v1/orders/${row.id}/payment-attempts`)
    .send({ requestedChannel: 'bkash' })
    .expect(404)
})
