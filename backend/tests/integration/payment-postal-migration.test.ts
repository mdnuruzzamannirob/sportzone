import { Types } from 'mongoose'
import { afterAll, beforeAll, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { syntheticOrderProof, orderTestTime } from '../helpers/orders.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import {
  identityCollectionValidators,
  initializeIdentityPersistence,
  migrateIdentityPostalCode,
} from '../../src/modules/auth/identity.persistence.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import {
  orderValidators,
  initializeOrderPersistence,
  migrateOrderPostalCode,
} from '../../src/modules/orders/order.persistence.js'
import { orderModels } from '../../src/modules/orders/order.model.js'
import { orderService } from '../../src/modules/orders/order.service.js'
import { createAuditWriter } from '../../src/modules/audit/audit.service.js'
import { initializeAuditPersistence } from '../../src/modules/audit/audit.persistence.js'
let db: Awaited<ReturnType<typeof isolatedDatabase>>
const legacy = (validator: unknown): Record<string, unknown> =>
  JSON.parse(
    JSON.stringify(validator, (key, value: unknown) => (key === 'postalCode' ? undefined : value)),
  )
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializeIdentityPersistence(db.connection, createIdentityModels(db.connection))
  await initializeOrderPersistence(db.connection)
  await initializeAuditPersistence(db.connection)
})
afterAll(async () => {
  await db?.close()
})
it('additively migrates exact predecessor schemas, retains old facts, permits new saved postcodes and keeps order snapshots immutable', async () => {
  const identities = createIdentityModels(db.connection),
    models = orderModels(db.connection)
  const user = await identities.users.create({
    name: 'Synthetic',
    emailNormalized: 'postal@example.test',
    passwordHash: 'synthetic_hash',
    role: 'customer',
    addresses: [
      {
        id: new Types.ObjectId(),
        recipient: 'Synthetic',
        phone: '+8801700000000',
        districtKey: 'dhaka',
        areaKey: 'synthetic',
        street: 'Synthetic road',
        isDefault: true,
      },
    ],
  })
  const proof = syntheticOrderProof()
  const created = await inTransaction(db.connection, (session) =>
    orderService(
      db.connection,
      { authorize: async () => proof },
      createAuditWriter(db.connection),
      () => orderTestTime,
    ).create(session, {
      orderId: proof.orderId,
      checkoutIntentId: proof.checkoutIntentId,
      operationKey: 'synthetic-postal',
    }),
  )
  const beforeUser = await identities.users.collection.findOne({ _id: user._id }),
    beforeOrder = await models.orders.collection.findOne({ _id: new Types.ObjectId(created.id) })
  for (const [name, validator] of [
    ['users', legacy(identityCollectionValidators.users)],
    ['orders', legacy(orderValidators.orders)],
  ] as const)
    await db.connection.db?.command({
      collMod: name,
      validator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  await expect(
    identities.users.updateOne({ _id: user._id }, { $set: { 'addresses.0.postalCode': '1000' } }),
  ).rejects.toMatchObject({ code: 121 })
  for (let run = 0; run < 2; run++) {
    await migrateIdentityPostalCode(db.connection)
    await migrateOrderPostalCode(db.connection)
  }
  expect(await identities.users.collection.findOne({ _id: user._id })).toEqual(beforeUser)
  expect(await models.orders.collection.findOne({ _id: new Types.ObjectId(created.id) })).toEqual(
    beforeOrder,
  )
  await identities.users.updateOne(
    { _id: user._id },
    { $set: { 'addresses.0.postalCode': '1000' } },
  )
  expect((await identities.users.findById(user._id))?.addresses[0]?.postalCode).toBe('1000')
  await expect(
    models.orders.updateOne(
      { _id: created.id },
      { $set: { 'deliverySnapshot.postalCode': '1000' } },
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await models.orders.findById(created.id))?.deliverySnapshot.postalCode).toBeUndefined()
})
it.each(['users', 'orders'] as const)(
  'refuses unknown %s schema drift without overwriting its validator',
  async (name) => {
    const current = name === 'users' ? identityCollectionValidators.users : orderValidators.orders
    const unknown = { $and: [current] }
    await db.connection.db?.command({
      collMod: name,
      validator: unknown,
      validationLevel: 'strict',
      validationAction: 'error',
    })
    try {
      await expect(
        name === 'users'
          ? migrateIdentityPostalCode(db.connection)
          : migrateOrderPostalCode(db.connection),
      ).rejects.toThrow('Unknown')
      const row = await db.connection.db?.listCollections({ name }, { nameOnly: false }).next()
      expect(row?.options?.validator).toEqual(unknown)
    } finally {
      await db.connection.db?.command({
        collMod: name,
        validator: current,
        validationLevel: 'strict',
        validationAction: 'error',
      })
    }
  },
)
