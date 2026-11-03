import { Types } from 'mongoose'
import { expect, it } from 'vitest'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import { createNotificationDeliveryService } from '../../../src/modules/notifications/notification-delivery.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import { returnModel } from '../../../src/modules/returns/return.model.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import { context, customer, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { returnNotificationFixture } from '../../helpers/commerce/notifications.js'

registerCommerceFixture()

it('return notification local: actual claim completion queues once and never claims refund payout', async () => {
  const f = await returnNotificationFixture()
  await f.complete()
  await f.complete()
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'return_update', orderId: new Types.ObjectId(f.id) }),
  ).toBe(1)
  await f.delivery.runBatch()
  expect(f.send).toHaveBeenCalledTimes(1)
  const message = f.send.mock.calls[0]?.[0]
  expect(message?.text).toContain('does not confirm that a refund was paid')
  expect(message?.text).not.toContain('refund was completed')
  await f.delivery.runBatch()
  expect(f.send).toHaveBeenCalledTimes(1)
})

it('return notification local: missing outbox uniqueness rolls back the claim and quantity transition', async () => {
  const f = await returnNotificationFixture()
  await context.db.connection
    .collection('notifications')
    .dropIndex('notifications_event_key_unique')
  try {
    await expect(f.complete()).rejects.toThrow()
  } finally {
    await f.store.migrateFoundation()
  }
  expect((await returnModel(context.db.connection).findById(f.claimId).orFail()).status).toBe(
    'approved',
  )
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .orFail()
  expect(balance.activeClaimQty).toBe(2)
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'return_update' }),
  ).toBe(0)
  await f.complete()
})

it.each(['recipient', 'time'])(
  'return notification local: tampered %s cannot send a message',
  async (field) => {
    const f = await returnNotificationFixture()
    await f.complete()
    await context.db.connection.collection('notifications').updateOne(
      { eventType: 'return_update' },
      {
        $set:
          field === 'recipient'
            ? { 'recipient.emailNormalized': 'other@example.test' }
            : { 'payload.occurredAt': new Date('2027-01-01') },
      },
    )
    await f.delivery.runBatch()
    expect(f.send).not.toHaveBeenCalled()
    expect(
      await context.db.connection
        .collection('notifications')
        .findOne({ eventType: 'return_update' }),
    ).toMatchObject({ status: 'failed', lastErrorCode: 'PROOF_UNAVAILABLE' })
  },
)

it('return notification local: prior commerce validator upgrades additively without deleting queued facts', async () => {
  const { commerceNotificationValidator, registrationNotificationValidator } = await import(
    '../../../src/modules/notifications/notification.persistence.js'
  )
  const store = createNotificationService(context.db.connection)
  const account = await customer()
  await inTransaction(context.db.connection, (session) =>
    store.enqueue(
      { userId: account.user._id, email: account.user.emailNormalized, name: 'Synthetic' },
      session,
    ),
  )
  const before = await context.db.connection
    .collection('notifications')
    .findOne({ eventType: 'registration' })
  await context.db.connection.db?.command({
    collMod: 'notifications',
    validator: commerceNotificationValidator,
  })
  try {
    await expect(store.verifyIndexes()).rejects.toThrow()
    await store.migrateFoundation()
    await store.migrateFoundation()
    await store.verifyIndexes()
    expect(
      await context.db.connection
        .collection('notifications')
        .findOne({ eventType: 'registration' }),
    ).toEqual(before)
    expect(
      (
        await context.db.connection.db
          ?.listCollections({ name: 'notifications' }, { nameOnly: false })
          .next()
      )?.options?.validator,
    ).toEqual(registrationNotificationValidator)
  } finally {
    await context.db.connection.db?.command({
      collMod: 'notifications',
      validator: registrationNotificationValidator,
    })
  }
})

it('return notification local: known retry retains identical message and idempotency key', async () => {
  const f = await returnNotificationFixture()
  f.send.mockResolvedValueOnce({ kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' })
  await f.complete()
  await f.delivery.runBatch()
  expect(f.send).toHaveBeenCalledTimes(1)
  f.advance(2000)
  await f.delivery.runBatch()
  expect(f.send).toHaveBeenCalledTimes(2)
  expect(f.send.mock.calls[1]?.[0]).toEqual(f.send.mock.calls[0]?.[0])
})

it.each(['approved', 'rejected'])(
  'return notification local: real %s decision queues one verified event',
  async (decision) => {
    const f = await returnNotificationFixture(false)
    await f.lifecycle.transition(
      f.token,
      f.claimId,
      { to: 'under_review', reason: 'Review' },
      'review-with-notifier',
    )
    const command = {
      to: decision,
      reason: 'Synthetic decision',
      ...(decision === 'approved'
        ? { approvedItems: [{ orderItemId: f.itemId, quantity: 2 }] }
        : {}),
    }
    await f.lifecycle.transition(f.token, f.claimId, command, `decision-${decision}`)
    await f.lifecycle.transition(f.token, f.claimId, command, `decision-${decision}`)
    expect(
      await context.db.connection
        .collection('notifications')
        .countDocuments({ eventType: 'return_update' }),
    ).toBe(1)
    await f.delivery.runBatch()
    expect(f.send).toHaveBeenCalledTimes(1)
    expect(f.send.mock.calls[0]?.[0].text).toContain(`claim was ${decision}`)
  },
)

it('return notification local: default worker leaves return events queued without a configured renderer', async () => {
  const f = await returnNotificationFixture()
  await f.complete()
  const worker = createNotificationDeliveryService(
    f.store,
    { send: f.send },
    { maxAttempts: 3, baseDelayMs: 1000, maxDelayMs: 10000, claimTtlMs: 30000, batchSize: 10 },
    f.clock,
  )
  await worker.runBatch()
  expect(f.send).not.toHaveBeenCalled()
  expect(
    await context.db.connection.collection('notifications').findOne({ eventType: 'return_update' }),
  ).toMatchObject({ status: 'queued' })
})
