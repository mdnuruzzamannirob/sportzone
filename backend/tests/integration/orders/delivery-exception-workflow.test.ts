import { spawnSync } from 'node:child_process'
import { Types } from 'mongoose'
import { expect, it, vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeAuditPersistence } from '../../../src/modules/audit/audit.persistence.js'
import {
  createAdminAccountAccess,
  createCustomerAccountAccess,
} from '../../../src/modules/auth/account-access.service.js'
import { orderScopeAccess } from '../../../src/modules/auth/checkout-access.service.js'
import { createGuestSessionService } from '../../../src/modules/auth/guest-access/guest-session.service.js'
import { productModels } from '../../../src/modules/catalog/products/product.model.js'
import { inventoryMovementModel } from '../../../src/modules/inventory/inventory.model.js'
import { createRecoveryReceiptService } from '../../../src/modules/inventory/inventory.service.js'
import { paymentNotificationValidator } from '../../../src/modules/notifications/notification.persistence.js'
import { createNotificationService } from '../../../src/modules/notifications/notification.service.js'
import type { EmailAdapter } from '../../../src/modules/notifications/notification.types.js'
import { deliveryExceptionModel } from '../../../src/modules/orders/delivery-exception.model.js'
import { initializeDeliveryExceptionPersistence } from '../../../src/modules/orders/delivery-exception.persistence.js'
import { createDeliveryExceptionService } from '../../../src/modules/orders/delivery-exception.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  codCollectionOrderAccess,
  complaintOrderAccess,
  guestOrderAccess,
} from '../../../src/modules/orders/order.service.js'
import { createFulfillmentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { createOrderLifecycleService } from '../../../src/modules/orders/order-lifecycle.service.js'
import { createCodCollectionService } from '../../../src/modules/payments/collections/cod-collection.service.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import {
  cancellationPaymentAccess,
  fulfillmentPaymentAccess,
} from '../../../src/modules/payments/payment.service.js'
import { complaintModel } from '../../../src/modules/support/support.model.js'
import { initializeComplaintPersistence } from '../../../src/modules/support/support.persistence.js'
import { createComplaintService } from '../../../src/modules/support/support.service.js'
import {
  composeAuditAccess,
  composeCodCollectionDependencies,
  composeDeliveryExceptionDependencies,
  composeFulfillmentAllocationDependencies,
  composeNotificationWorker,
  composeOrderLifecycleDependencies,
} from '../../../src/setup.js'
import { inTransaction } from '../../../src/shared/database/transaction.js'
import {
  authSecret,
  context,
  customer,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { heldOrder } from '../../helpers/commerce/checkout.js'
import { commerceDelivery, exceptionFixture } from '../../helpers/commerce/customers.js'
import { cancellationReadFixture, lifecycleFixture } from '../../helpers/commerce/orders.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('commerce/exception batch: actual lifecycle commits one order email event per cause and delivery remains financially independent', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('confirmed')
  await f.move('processing')
  await f.move('shipped')
  await f.move('shipped')
  await f.move('delivered')
  for (const eventType of [
    'order_received',
    'order_confirmation',
    'shipment_update',
    'delivery_completion',
  ])
    expect(
      await context.db.connection.collection('notifications').countDocuments({ eventType }),
    ).toBe(1)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(4)
  expect(
    send.mock.calls.some(([message]) =>
      message.text.includes('Delivery does not confirm payment collection.'),
    ),
  ).toBe(true)
  expect((await paymentModel(context.db.connection).findById(f.payment._id))?.paymentStatus).toBe(
    'pending',
  )
})

it('commerce/exception batch: cancellation email is atomic and historical messages retain immutable event references', async () => {
  const f = await cancellationReadFixture(),
    lifecycle = createOrderLifecycleService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      fulfillmentPaymentAccess(context.db.connection),
      createFulfillmentAllocationService(
        composeFulfillmentAllocationDependencies(context.db.connection),
        () => context.now,
      ),
      composeAuditAccess(context.db.connection),
      composeOrderLifecycleDependencies(context.db.connection),
      async () => {},
      () => context.now,
    )
  await lifecycle.transition(
    f.admin.credentials.customerToken,
    f.id,
    { to: 'confirmed', reason: 'Synthetic confirmation' },
    'mail-confirm',
  )
  const asked = await f.ask()
  await f.decide(asked.id)
  await f.decide(asked.id)
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(3)
  for (const [message] of send.mock.calls) {
    expect(message.text).toContain('Check your secure order status for current fulfillment')
    expect(message.text).not.toContain('Synthetic administrator review')
  }
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'order_cancellation' }),
  ).toBe(1)
})

it('commerce/exception batch: known mail rejection keeps the exact provider payload even after later cancellation', async () => {
  const f = await cancellationReadFixture(),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValueOnce({ kind: 'rejected', retryable: true, code: 'PROVIDER_RATE_LIMIT' })
      .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  const original = send.mock.calls[0]?.[0]
  if (!original) throw new Error('Missing first delivery attempt')
  const asked = await f.ask()
  await f.decide(asked.id)
  context.now = new Date(context.now.getTime() + 1001)
  await commerceDelivery({ send }).runBatch()
  const retries = send.mock.calls
    .map(([message]) => message)
    .filter((message) => message.idempotencyKey === original.idempotencyKey)
  expect(retries).toHaveLength(2)
  expect(retries[1]).toEqual(original)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'commit_cod' }),
  ).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(1)
})

it('commerce/exception batch: uncertain delivery stops automatic resend without changing committed commerce', async () => {
  const f = await cancellationReadFixture(),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValue({ kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' })
  await commerceDelivery({ send }).runBatch()
  context.now = new Date(context.now.getTime() + 100000)
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(
    (
      await context.db.connection
        .collection('notifications')
        .findOne({ orderId: new Types.ObjectId(f.id) })
    )?.status,
  ).toBe('delivery_uncertain')
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'pending',
  )
})

it('commerce/exception batch: default root worker skips order templates and explicit local activation renders commerce not welcome', async () => {
  await cancellationReadFixture()
  const config = loadEnvironment({ ...identityEnvironment(), SESSION_SECRET: authSecret }),
    send = vi
      .fn<EmailAdapter['send']>()
      .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' }),
    settings = {
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 10000,
      claimTtlMs: 30000,
      batchSize: 10,
    }
  const disabled = await composeNotificationWorker(context.db.connection, config, {
    adapter: { send },
    settings,
  })
  await disabled.runBatch()
  expect(send).not.toHaveBeenCalled()
  const enabled = await composeNotificationWorker(context.db.connection, config, {
    adapter: { send },
    settings,
    commerceEnabled: true,
  })
  await enabled.runBatch()
  expect(send).toHaveBeenCalledTimes(1)
  expect(send.mock.calls[0]?.[0].subject).toContain('order update')
  expect(send.mock.calls[0]?.[0].text).toContain('does not confirm fulfillment')
})

it('commerce/exception batch: destination tamper suppresses every order message', async () => {
  const f = await exceptionFixture()
  await context.db.connection
    .collection('notifications')
    .updateMany(
      { orderId: new Types.ObjectId(f.id) },
      { $set: { 'recipient.emailNormalized': 'wrong@example.test' } },
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).not.toHaveBeenCalled()
})

it('commerce/exception batch: tampered event proof cannot email a fabricated transition', async () => {
  await exceptionFixture()
  await context.db.connection
    .collection('notifications')
    .updateOne(
      { eventType: 'shipment_update' },
      { $set: { 'payload.operationKey': '0'.repeat(64) } },
    )
  const send = vi
    .fn<EmailAdapter['send']>()
    .mockResolvedValue({ kind: 'accepted', providerMessageId: 'synthetic-commerce' })
  await commerceDelivery({ send }).runBatch()
  expect(send).toHaveBeenCalledTimes(2)
  expect(send.mock.calls.some(([message]) => message.text.includes('was shipped'))).toBe(false)
})

it('commerce/exception batch: missing outbox protection after dispatch writes rolls back stock and fulfillment', async () => {
  const f = await lifecycleFixture()
  await f.move('confirmed')
  await f.move('processing')
  await context.db.connection
    .collection('notifications')
    .dropIndex('notifications_event_key_unique')
  try {
    await expect(f.move('shipped')).rejects.toThrow()
  } finally {
    await createNotificationService(context.db.connection).initialize()
  }
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'processing',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 10, committed: 2 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'dispatch' }),
  ).toBe(0)
  await f.move('shipped')
})

it('commerce/exception batch: exact payment notification predecessor upgrades without rewriting prior evidence', async () => {
  await cancellationReadFixture()
  const before = await context.db.connection.collection('notifications').findOne({})
  if (!before) throw new Error('Missing notification fixture')
  await context.db.connection.db?.command({
    collMod: 'notifications',
    validator: paymentNotificationValidator,
  })
  const store = createNotificationService(context.db.connection)
  await expect(store.verifyIndexes()).rejects.toThrow()
  await store.migrateFoundation()
  await store.migrateFoundation()
  expect(
    await context.db.connection.collection('notifications').findOne({ _id: before._id }),
  ).toEqual(before)
})

it('commerce/exception batch: failed attempts and delay resolution retain Shipped, contacts, deadlines and stock', async () => {
  const f = await exceptionFixture(),
    before = (await orderModels(context.db.connection).orders.findById(f.id).lean())
      ?.deliveryCommitment
  const event = await f.create()
  await f.create()
  await f.resolve(event.id, { resolution: 'Retry scheduled', contactOutcome: 'Customer contacted' })
  await f.resolve(event.id, { resolution: 'Retry scheduled', contactOutcome: 'Customer contacted' })
  expect(await deliveryExceptionModel(context.db.connection).countDocuments()).toBe(1)
  expect(
    (await deliveryExceptionModel(context.db.connection).findById(event.id))?.contactHistory,
  ).toHaveLength(2)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).lean())?.deliveryCommitment,
  ).toEqual(before)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .physical,
  ).toBe(8)
})

it('commerce/exception batch: final closure without protected custody/inspection proof is refused', async () => {
  const f = await exceptionFixture(false),
    event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Cannot establish custody', disposition: f.disposition }),
  ).rejects.toThrow()
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(0)
})

it('commerce/exception batch: final disposition must cover every unit and never restock lost/damaged goods', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Incomplete units', disposition: f.disposition.slice(0, 1) }),
  ).rejects.toThrow()
  await expect(
    f.resolve(event.id, {
      resolution: 'Invalid resale',
      disposition: f.disposition.map((d) => ({ ...d, custody: 'lost' })),
    }),
  ).rejects.toThrow()
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
})

it('commerce/exception batch: complete mixed custody closes once and restores only recovered inspected resale stock', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery'),
    body = { resolution: 'Verified final non-delivery', disposition: f.disposition }
  await f.resolve(event.id, body)
  await f.resolve(event.id, body)
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'cancelled',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock,
  ).toMatchObject({ physical: 9, committed: 0, reserved: 0 })
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'release_commit' }),
  ).toBe(0)
  expect(
    await context.db.connection
      .collection('notifications')
      .countDocuments({ eventType: 'order_cancellation' }),
  ).toBe(1)
})

it('commerce/exception batch: competing final exceptions across admins have one custody/restock winner', async () => {
  const f = await exceptionFixture(),
    other = await customer('admin'),
    one = await f.create('final_non_delivery', 'final-one'),
    two = await f.create('final_non_delivery', 'final-two'),
    body = { resolution: 'Qualified disposition', disposition: f.disposition }
  const outcomes = await Promise.allSettled([
    f.resolve(one.id, body, 'final-one'),
    f.exceptions.resolve(other.credentials.customerToken, two.id, body, 'final-two'),
  ])
  expect(outcomes.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(
    await deliveryExceptionModel(context.db.connection).countDocuments({ status: 'resolved' }),
  ).toBe(1)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(1)
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .physical,
  ).toBe(9)
})

it('commerce/exception batch: paid final closure waits for a real refund planner and preserves evidence/stock', async () => {
  const f = await exceptionFixture(),
    payment = await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const cash = createCodCollectionService(
    context.db.connection,
    f.adminAccess,
    codCollectionOrderAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
    composeCodCollectionDependencies(context.db.connection),
    async (data) => ({
      paymentId: data.paymentId,
      amountPoisha: data.amountPoisha,
      collectionReference: data.collectionReference,
      evidenceRef: data.evidenceRef,
      collectedAt: context.now,
      digest: 'a'.repeat(64),
    }),
    () => context.now,
  )
  await cash.collect(
    f.token,
    payment._id.toHexString(),
    {
      amountPoisha: payment.expectedPoisha,
      collectionReference: 'exception-cash',
      evidenceRef: 'synthetic:protected',
      reason: 'Recorded local cash',
    },
    'exception-cash',
  )
  const event = await f.create('final_non_delivery')
  await expect(
    f.resolve(event.id, { resolution: 'Paid failed delivery', disposition: f.disposition }),
  ).rejects.toThrow()
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect((await paymentModel(context.db.connection).findById(payment._id))?.paymentStatus).toBe(
    'paid',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .physical,
  ).toBe(8)
})

it('commerce/exception batch: downstream recovery failure rolls back receipt, final state and exception proof', async () => {
  const f = await exceptionFixture(),
    event = await f.create('final_non_delivery'),
    restore = createRecoveryReceiptService(context.db.connection, () => context.now)
  const failing = createDeliveryExceptionService(
    context.db.connection,
    f.adminAccess,
    cancellationPaymentAccess(context.db.connection),
    async (session, input) => {
      await restore(session, input)
      throw new Error('Synthetic downstream failure')
    },
    composeAuditAccess(context.db.connection),
    composeDeliveryExceptionDependencies(context.db.connection),
    async () => 'a'.repeat(64),
    undefined,
    () => context.now,
  )
  await expect(
    failing.resolve(
      f.token,
      event.id,
      { resolution: 'Verified custody', disposition: f.disposition },
      'recovery-failure',
    ),
  ).rejects.toThrow()
  expect((await deliveryExceptionModel(context.db.connection).findById(event.id))?.status).toBe(
    'open',
  )
  expect((await orderModels(context.db.connection).orders.findById(f.id))?.fulfillmentStatus).toBe(
    'shipped',
  )
  expect(
    (await productModels(context.db.connection).variants.findById(f.selected.row._id))?.stock
      .physical,
  ).toBe(8)
  expect(
    await inventoryMovementModel(context.db.connection).countDocuments({ type: 'return_receipt' }),
  ).toBe(0)
})

it('commerce/exception batch: ordinary model transition still cannot cancel shipped orders', async () => {
  const f = await exceptionFixture()
  await expect(
    orderModels(context.db.connection).orders.updateOne(
      { _id: f.id, fulfillmentStatus: 'shipped' },
      { $set: { fulfillmentStatus: 'cancelled' } },
    ),
  ).rejects.toThrow()
})

it('commerce/exception batch: scoped complaint contact resolution and privacy never use submitted contact as ownership proof', async () => {
  const f = await exceptionFixture(),
    other = await customer()
  const complaint = await f.complaints.submit(f.creds, f.id, {
    issue: 'Synthetic delivery concern',
  })
  const stored = await complaintModel(context.db.connection)
    .findById(complaint.id)
    .select('+contact')
  expect(stored?.contact.emailNormalized).toBe(
    (await orderModels(context.db.connection).orders.findById(f.id))?.customerSnapshot
      .emailNormalized,
  )
  const listed = await f.complaints.list(f.creds, f.id)
  expect(listed).toHaveLength(1)
  for (const key of ['contact', 'emailNormalized', 'phone', 'userId'])
    expect(JSON.stringify(listed)).not.toContain(key)
  await expect(
    f.complaints.submit({ ...other.credentials, csrfToken: other.csrf }, f.id, {
      issue: 'Wrong owner',
      contactEmail: f.who.user.emailNormalized,
    }),
  ).rejects.toThrow()
  await expect(f.complaints.list(other.credentials, f.id)).rejects.toThrow()
})

it('commerce/exception batch: complaints require documented response to resolve and preserve first response on close/replay', async () => {
  const f = await exceptionFixture(),
    complaint = await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic issue' })
  await expect(
    f.complaints.resolve(
      f.who.credentials.customerToken,
      complaint.id,
      { status: 'resolved', resolution: 'Unauthorized', contactOutcome: 'Claimed response' },
      'bad-admin',
    ),
  ).rejects.toThrow()
  await expect(
    f.complaints.resolve(
      f.token,
      complaint.id,
      { status: 'resolved', resolution: 'No response fact' },
      'no-response',
    ),
  ).rejects.toThrow()
  const reviewed = await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'in_review', resolution: 'Investigating', contactOutcome: 'Called customer' },
    'review',
  )
  context.now = new Date(context.now.getTime() + 1000)
  await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'resolved', resolution: 'Issue addressed', contactOutcome: 'Response recorded' },
    'resolve',
  )
  await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'closed', resolution: 'Case closed' },
    'close',
  )
  const replay = await f.complaints.resolve(
    f.token,
    complaint.id,
    { status: 'in_review', resolution: 'Investigating', contactOutcome: 'Called customer' },
    'review',
  )
  expect(replay.status).toBe('closed')
  expect(replay.respondedAt).toBe(reviewed.respondedAt)
  expect(replay).not.toHaveProperty('deadlineAt')
})

it('commerce/exception batch: complaint audit failure rolls back private contact/issue and does not fabricate a response', async () => {
  const f = await exceptionFixture()
  await context.db.connection.collection('auditLogs').dropIndex('audit_cause_unique')
  try {
    await expect(
      f.complaints.submit(f.creds, f.id, { issue: 'Private synthetic issue' }),
    ).rejects.toThrow()
  } finally {
    await initializeAuditPersistence(context.db.connection)
  }
  expect(await complaintModel(context.db.connection).countDocuments()).toBe(0)
  const saved = await f.complaints.submit(f.creds, f.id, { issue: 'Private synthetic issue' })
  expect(saved.status).toBe('open')
  expect(saved.respondedAt).toBeUndefined()
})

it('commerce/exception batch: compiled support/bootstrap preserves events and refuses deployed activation', async () => {
  const f = await exceptionFixture(),
    event = await f.create()
  await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic retained issue' })
  const env = {
    ...identityEnvironment(),
    MONGODB_URI: context.db.replica.getUri(),
    MONGODB_DB_NAME: context.db.connection.name,
  }
  for (let i = 0; i < 2; i++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-delivery-support.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 10000,
    })
    expect(result.status, result.stderr).toBe(0)
  }
  expect((await deliveryExceptionModel(context.db.connection).findById(event.id))?.status).toBe(
    'open',
  )
  expect(await complaintModel(context.db.connection).countDocuments()).toBe(1)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-delivery-support.mjs'], {
    env: { ...env, APP_ENV: 'production', NODE_ENV: 'production' },
    encoding: 'utf8',
    timeout: 10000,
  })
  expect(refused.status).not.toBe(0)
})

it('commerce/exception batch: verified guest complaint scope is exact and public contact data never grants order access', async () => {
  await initializeComplaintPersistence(context.db.connection)
  const held = await heldOrder(),
    customers = createCustomerAccountAccess(
      context.db.connection,
      context.identities,
      context.sessions,
    ),
    guests = createGuestSessionService(
      context.db.connection,
      context.identities,
      {
        secret: authSecret,
        customerTtlSeconds: 600,
        adminTtlSeconds: 300,
        sameSite: 'lax',
        appEnvironment: 'test',
        apiOrigin: 'https://api.example.test',
      },
      600,
      guestOrderAccess(context.db.connection).verify,
      () => context.now,
    )
  const proof = await inTransaction(context.db.connection, (session) =>
      guests.issueAfterProof(session, held.result.id),
    ),
    scope = orderScopeAccess(customers, context.sessions, guests),
    support = createComplaintService(
      context.db.connection,
      scope,
      complaintOrderAccess(context.db.connection),
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      composeAuditAccess(context.db.connection),
      () => context.now,
    ),
    credentials = { customerPresent: false, guestToken: proof.token, csrfToken: proof.csrfToken }
  await support.submit(credentials, held.result.id, {
    issue: 'Scoped guest concern',
    contactName: '😀'.repeat(120),
  })
  expect(await support.list(credentials, held.result.id)).toHaveLength(1)
  const other = await heldOrder()
  await expect(support.list(credentials, other.result.id)).rejects.toThrow()
  await expect(
    support.submit({ customerPresent: false }, held.result.id, {
      issue: 'Anonymous contact is not proof',
      contactEmail: 'synthetic@example.test',
    }),
  ).rejects.toThrow()
})

it('commerce/exception batch: strict exception/complaint persistence prevents unsupported mutable evidence writes', async () => {
  const f = await exceptionFixture(),
    event = await f.create(),
    complaint = await f.complaints.submit(f.creds, f.id, { issue: 'Synthetic integrity concern' })
  await expect(
    deliveryExceptionModel(context.db.connection).updateOne(
      { _id: event.id },
      { $set: { reason: 'Rewritten evidence' } },
    ),
  ).rejects.toThrow()
  await expect(
    complaintModel(context.db.connection).updateOne(
      { _id: complaint.id },
      { $set: { issue: 'Rewritten report' } },
    ),
  ).rejects.toThrow()
  await expect(
    context.db.connection.collection('deliveryExceptions').insertOne({
      _id: new Types.ObjectId(),
      orderId: new Types.ObjectId(f.id),
      type: 'final_non_delivery',
      reason: 'Invalid custody',
      status: 'resolved',
      operationKey: 'a'.repeat(64),
      requestDigest: 'b'.repeat(64),
      revision: 0,
      createdAt: context.now,
      updatedAt: context.now,
      resolvedAt: context.now,
      resolution: 'Invalid',
      contactHistory: [],
      disposition: [
        { orderItemId: f.item.id, quantity: 1, custody: 'lost', inspectedResellableQty: 1 },
      ],
      dispositionDigest: 'c'.repeat(64),
    }),
  ).rejects.toThrow()
})

it('commerce/exception batch: a pending-order delay concern records no fabricated confirmation or deadline', async () => {
  await initializeDeliveryExceptionPersistence(context.db.connection)
  const f = await cancellationReadFixture(),
    service = createDeliveryExceptionService(
      context.db.connection,
      createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
      cancellationPaymentAccess(context.db.connection),
      createRecoveryReceiptService(context.db.connection, () => context.now),
      composeAuditAccess(context.db.connection),
      composeDeliveryExceptionDependencies(context.db.connection),
      undefined,
      undefined,
      () => context.now,
    )
  const before = (await orderModels(context.db.connection).orders.findById(f.id).lean())
    ?.deliveryCommitment
  await service.create(
    f.admin.credentials.customerToken,
    f.id,
    { type: 'delay', reason: 'Confirmation is awaiting qualified review' },
    'pending-delay',
  )
  const after = await orderModels(context.db.connection).orders.findById(f.id).lean()
  expect(after?.fulfillmentStatus).toBe('pending')
  expect(after?.confirmedAt).toBeUndefined()
  expect(after?.deliveryCommitment).toEqual(before)
  await expect(
    service.create(
      f.admin.credentials.customerToken,
      f.id,
      { type: 'final_non_delivery', reason: 'No shipment exists' },
      'invalid-final',
    ),
  ).rejects.toThrow()
})
