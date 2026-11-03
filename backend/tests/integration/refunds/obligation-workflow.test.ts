import { createHash } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Types } from 'mongoose'
import request from 'supertest'
import { expect, it, vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { createAdminAccountAccess } from '../../../src/modules/auth/account-access.service.js'
import { orderModels } from '../../../src/modules/orders/order.model.js'
import {
  refundOrderSnapshotAccess,
  refundUnitReservationAccess,
} from '../../../src/modules/orders/order.service.js'
import { paymentRecordModels } from '../../../src/modules/payments/collections/payment-record.model.js'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundFundingAccess } from '../../../src/modules/payments/payment.service.js'
import { createRefundReservationService } from '../../../src/modules/refunds/obligations/refund-reservation.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { refundClaimSnapshotAccess } from '../../../src/modules/returns/return.service.js'
import type { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { startServer } from '../../../src/server.js'
import { composeAuditAccess } from '../../../src/setup.js'
import { createLogger } from '../../../src/shared/logger.js'
import {
  authSecret,
  context,
  customer,
  registerCommerceFixture,
} from '../../helpers/commerce/base.js'
import { processingFixture } from '../../helpers/commerce/payments.js'
import {
  codRefundPolicy,
  packageCPost,
  packageCRoot,
  refundDevelopmentPolicy,
  reservationFixture,
  reservations,
  reservedGatewayFixture,
} from '../../helpers/commerce/refunds.js'
import { physicalReturnFixture } from '../../helpers/commerce/returns.js'
import { identityEnvironment } from '../../helpers/environment.js'

registerCommerceFixture()

it('refund reservation: durable obligation, attempt and source/order/unit holds commit once across different replay keys', async () => {
  const f = await reservationFixture()
  const first = await f.service.reserve(f.token, f.input, 'reserve')
  expect(first.refunds).toHaveLength(1)
  expect(first.refunds[0]).toMatchObject({ status: 'approved', capacityStatus: 'reserved' })
  expect(await f.service.reserve(f.token, f.input, 'reserve')).toEqual(first)
  expect(
    await f.service.reserve(
      f.token,
      { ...f.input, reason: 'Another authorized review' },
      'changed-key',
    ),
  ).toEqual(first)
  await expect(
    f.service.reserve(f.token, { ...f.input, reason: 'Changed payload' }, 'reserve'),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  const row = await refundModel(context.db.connection).findOne({ orderId: f.id }).orFail()
  const attempt = await refundAttemptModel(context.db.connection)
    .findOne({ refundId: row._id })
    .orFail()
  expect(attempt.status).toBe('created')
  expect(attempt.amountPoisha).toBe(row.amountPoisha)
  expect(attempt.toObject()).not.toHaveProperty('confirmedAt')
  expect(row.timingSnapshot).toMatchObject({ status: 'under_review' })
  expect(row.timingSnapshot?.targetAt).toBeUndefined()
  const source = await paymentRecordModels(context.db.connection)
    .collections.findById(row.sourceCollectionId)
    .orFail()
  const payment = await paymentModel(context.db.connection).findById(row.paymentId).orFail()
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .orFail()
  expect(source.get('merchandiseRefundHeldPoisha')).toBe(row.amountPoisha)
  expect(payment.merchandiseRefundHeldPoisha).toBe(row.amountPoisha)
  expect(balance.unitCoverage.reduce((sum, unit) => sum + unit.refundHeldPoisha, 0)).toBe(
    row.amountPoisha,
  )
  expect(await refundModel(context.db.connection).countDocuments()).toBe(1)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(1)
})

it('refund reservation: different admins and keys converge on one natural business request', async () => {
  const f = await reservationFixture(),
    other = await customer('admin')
  const results = await Promise.all([
    f.service.reserve(f.token, f.input, 'first'),
    f.service.reserve(other.credentials.customerToken, f.input, 'second'),
  ])
  expect(results[0]).toEqual(results[1])
  expect(await refundModel(context.db.connection).countDocuments()).toBe(1)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(1)
})

it('refund reservation: competing quantities cannot reserve an original ordinal twice', async () => {
  const f = await reservationFixture(),
    other = await customer('admin')
  const results = await Promise.allSettled([
    f.service.reserve(f.token, f.input, 'one'),
    f.service.reserve(
      other.credentials.customerToken,
      { ...f.input, requestedItems: [{ orderItemId: f.itemId, quantity: 2 }] },
      'two',
    ),
  ])
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .orFail()
  expect(
    balance.unitCoverage.every(
      (u) => u.refundHeldPoisha + u.refundCompletedPoisha <= u.netEntitlementPoisha,
    ),
  ).toBe(true)
})

it('refund reservation: failure after actual financial, obligation, attempt and audit writes rolls everything back', async () => {
  const f = await reservationFixture(),
    admins = createAdminAccountAccess(context.db.connection, context.identities, context.sessions)
  const fail: typeof admins = {
    owned: (token, work, mutating) =>
      admins.owned(
        token,
        async (actor, session) => {
          await work(actor, session)
          throw new Error('Synthetic post-reservation failure')
        },
        mutating,
      ),
  }
  await expect(reservations(fail).reserve(f.token, f.input, 'fail')).rejects.toThrow()
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(0)
  expect(
    (await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail())
      .merchandiseRefundHeldPoisha,
  ).toBe(0)
  expect(
    (
      await orderModels(context.db.connection).balances.findOne({ orderId: f.id }).orFail()
    ).unitCoverage.every((u) => u.refundHeldPoisha === 0),
  ).toBe(true)
  expect(
    await context.db.connection
      .collection('auditLogs')
      .countDocuments({ action: 'refund.group.reserve' }),
  ).toBe(0)
})

it('refund reservation: uncollected COD, wrong basis, absent policy and unsupported gateway fail closed', async () => {
  const f = await reservationFixture(false)
  await expect(f.service.reserve(f.token, f.input, 'unfunded')).rejects.toMatchObject({
    code: 'REFUND_BALANCE_EXCEEDED',
  })
  await f.cash()
  await expect(
    f.service.reserve(f.token, { ...f.input, basis: 'physical_return' }, 'wrong-basis'),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  const missing = createRefundReservationService(
    context.db.connection,
    f.adminAccess,
    refundClaimSnapshotAccess(context.db.connection),
    refundOrderSnapshotAccess(context.db.connection),
    refundUnitReservationAccess(context.db.connection),
    refundFundingAccess(context.db.connection),
    composeAuditAccess(context.db.connection),
  )
  await expect(missing.reserve(f.token, f.input, 'no-policy')).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  })
  await expect(
    reservations(f.adminAccess, async () => ({
      policyVersion: 'synthetic',
      method: 'gateway',
      consentRequired: false,
    })).reserve(f.token, f.input, 'bad-method'),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
})

it('refund reservation: two verified sources split one original unit and retain separate durable intents', async () => {
  const f = await reservationFixture(false)
  await f.cash(1, 'first-source')
  await f.cash(f.payment.expectedPoisha - 1, 'second-source')
  const result = await f.service.reserve(f.token, f.input, 'multi-source')
  expect(result.refunds).toHaveLength(2)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(2)
  const balance = await orderModels(context.db.connection)
    .balances.findOne({ orderId: f.id })
    .orFail()
  const amount = result.refunds.reduce((sum, row) => sum + row.amountPoisha, 0)
  expect(balance.unitCoverage[0]?.refundHeldPoisha).toBe(amount)
  expect(new Set(result.refunds.map((row) => row.sourceCollectionId)).size).toBe(2)
})

it('refund reservation: existing correction intent advances once without consuming merchandise and persists gateway identity before dispatch', async () => {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({
    bank_tran_id: 'reservation-correction-bank',
    val_id: 'reservation-correction-validation',
  })
  expect(
    await f.processor().process({ ...f.claim, validationId: 'reservation-correction-validation' }),
  ).toBe('committed')
  const old = await refundModel(context.db.connection).findOne({ orderId: f.result.id }).orFail()
  const before = await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  const admin = await customer('admin')
  const service = reservations(
    createAdminAccountAccess(context.db.connection, context.identities, context.sessions),
    async () => ({
      policyVersion: 'synthetic-qualified-gateway-policy',
      method: 'gateway',
      consentRequired: false,
    }),
  )
  const command = {
    orderId: f.result.id,
    basis: 'payment_correction',
    classification: 'payment_correction',
    correctionCollectionId: old.sourceCollectionId.toHexString(),
    reason: 'Synthetic correction review',
  }
  const result = await service.reserve(admin.credentials.customerToken, command, 'correction')
  expect(result.refunds[0]?.id).toBe(old._id.toHexString())
  expect(await refundModel(context.db.connection).countDocuments()).toBe(1)
  const attempt = await refundAttemptModel(context.db.connection).findOne().orFail()
  expect(attempt.status).toBe('created')
  expect(attempt.originalBankTranId).toBe('reservation-correction-bank')
  expect(attempt.refundTransId).toHaveLength(30)
  expect(attempt.refundRefId).toBeUndefined()
  const after = await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  expect(after.correctionRefundHeldPoisha).toBe(old.amountPoisha)
  expect(after.merchandiseRefundHeldPoisha).toBe(0)
  expect(after.merchandiseFundedPoisha).toBe(before.merchandiseFundedPoisha)
  expect(after.paymentStatus).toBe('paid')
})

it('refund reservation: fallback consent and delivery authority cannot be supplied by the request body', async () => {
  const f = await reservationFixture()
  const consent = reservations(f.adminAccess, async () => ({
    policyVersion: 'synthetic',
    method: 'manual_bank',
    consentRequired: true,
  }))
  await expect(consent.reserve(f.token, f.input, 'no-consent')).rejects.toMatchObject({
    code: 'BUSINESS_RULE_VIOLATION',
  })
  await expect(
    f.service.reserve(
      f.token,
      { ...f.input, deliveryChargeRequestedPoisha: 1 },
      'no-delivery-policy',
    ),
  ).rejects.toMatchObject({ code: 'BUSINESS_RULE_VIOLATION' })
  const authorized = reservations(f.adminAccess, async () => ({
    policyVersion: 'synthetic',
    method: 'manual_bank',
    consentRequired: true,
    consentEvidenceRef: 'synthetic-protected-consent',
    deliveryApproved: true,
  }))
  const original = (await orderModels(context.db.connection).orders.findById(f.id).orFail())
    .pricingSnapshot.deliveryChargePoisha
  await expect(
    authorized.reserve(
      f.token,
      { ...f.input, deliveryChargeRequestedPoisha: original + 1 },
      'excess-delivery',
    ),
  ).rejects.toMatchObject({ code: 'REFUND_BALANCE_EXCEEDED' })
  await authorized.reserve(
    f.token,
    { ...f.input, deliveryChargeRequestedPoisha: original },
    'approved-delivery',
  )
  expect(
    (await paymentModel(context.db.connection).findOne({ orderId: f.id }).orFail())
      .deliveryRefundHeldPoisha,
  ).toBe(original)
  expect((await refundModel(context.db.connection).findOne().orFail()).consentEvidenceRef).toBe(
    'synthetic-protected-consent',
  )
})

it('Package C HTTP: canonical group, list/detail and natural replay reserve one obligation and redact protected proof', async () => {
  const f = await reservationFixture(),
    root = packageCRoot({ options: codRefundPolicy(f) })
  const before = await orderModels(context.db.connection).orders.findById(f.id).orFail()
  const first = await packageCPost(root, f.admin, '/admin/refund-groups', f.input).expect(201)
  const group = first.body.data
  expect(group.status).toBe('approved')
  expect(group.refunds[0]).toMatchObject({
    classification: 'merchandise',
    status: 'approved',
    capacityStatus: 'reserved',
  })
  expect(group.refunds[0].timing).toMatchObject({
    status: 'under_review',
    timezone: 'Asia/Dhaka',
    targetBusinessDays: 7,
  })
  expect(group.refunds[0].timing.targetAt).toBeUndefined()
  const replay = await packageCPost(
    root,
    f.admin,
    '/admin/refund-groups',
    { ...f.input, reason: 'Reviewed again' },
    'another-key',
  ).expect(201)
  expect(replay.body.data.refundGroupKey).toBe(group.refundGroupKey)
  expect(replay.body.data.refunds[0].id).toBe(group.refunds[0].id)
  await packageCPost(
    root,
    f.admin,
    '/admin/refund-groups',
    { ...f.input, reason: 'Changed' },
    'package-c',
  ).expect(409)
  const detail = await request(root)
    .get(`/api/v1/admin/refunds/${group.refunds[0].id}`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(detail.body.data.attempts[0].state).toBe('created')
  expect(JSON.stringify(detail.body)).not.toContain('synthetic:verified-consent')
  for (const field of ['originalBankTranId', 'idempotencyKey', 'manualEvidence'])
    expect(detail.body.data.attempts[0]).not.toHaveProperty(field)
  const list = await request(root)
    .get(`/api/v1/admin/refunds?status=approved&classification=merchandise&pageSize=1`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(list.body.data).toHaveLength(1)
  expect(list.body.meta.totalItems).toBe(1)
  expect(
    (await orderModels(context.db.connection).orders.findById(f.id).orFail()).toObject(),
  ).toEqual(before.toObject())
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(1)
})

it('Package C HTTP: current admin, exact Origin/CSRF, keys and strict financial DTOs gate every mutation', async () => {
  const f = await reservationFixture(),
    root = packageCRoot({ options: codRefundPolicy(f) }),
    buyer = await customer()
  await request(root).get('/api/v1/admin/refunds').expect(401)
  await request(root).get('/api/v1/admin/refunds').set('Cookie', buyer.cookie).expect(401)
  await request(root)
    .post('/api/v1/admin/refund-groups')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .set('Idempotency-Key', 'no-csrf')
    .send(f.input)
    .expect(403)
  await request(root)
    .post('/api/v1/admin/refund-groups')
    .set('Origin', 'https://evil.example.test')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .set('Idempotency-Key', 'wrong-origin')
    .send(f.input)
    .expect(403)
  await request(root)
    .post('/api/v1/admin/refund-groups')
    .set('Origin', 'http://localhost:5173')
    .set('Cookie', f.admin.cookie)
    .set('X-CSRF-Token', f.admin.csrf)
    .send(f.input)
    .expect(400)
  await packageCPost(root, f.admin, '/admin/refund-groups', { ...f.input, amountPoisha: 1 }).expect(
    400,
  )
  await request(root).get('/api/v1/admin/refunds?page=0').set('Cookie', f.admin.cookie).expect(400)
  await request(root)
    .get('/api/v1/admin/refunds?sourceCollectionId=bad')
    .set('Cookie', f.admin.cookie)
    .expect(400)
  await request(root)
    .get(`/api/v1/admin/refunds/${new Types.ObjectId()}`)
    .set('Cookie', f.admin.cookie)
    .expect(404)
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
})

it('Package C HTTP: uncollected COD, absent fallback consent, client policy and premature physical basis fail without holds', async () => {
  const f = await reservationFixture(false),
    root = packageCRoot({ options: codRefundPolicy(f) })
  await packageCPost(root, f.admin, '/admin/refund-groups', f.input).expect(409)
  await f.cash()
  await packageCPost(
    packageCRoot({ options: refundDevelopmentPolicy }),
    f.admin,
    '/admin/refund-groups',
    f.input,
  ).expect(422)
  await packageCPost(root, f.admin, '/admin/refund-groups', {
    ...f.input,
    consentEvidenceRef: 'client-proof',
  }).expect(400)
  const physical = await physicalReturnFixture()
  await physical.cash(undefined, 'separate-physical-receipt')
  const policy = {
    policyVersion: 'synthetic',
    authorizations: [
      {
        orderId: physical.id,
        basis: 'physical_return' as const,
        basisRefId: physical.claimId,
        approval: {
          policyVersion: 'synthetic',
          method: 'manual_bank' as const,
          consentRequired: false,
          deliveryApproved: false,
        },
      },
    ],
  }
  await packageCPost(packageCRoot({ options: policy }), physical.admin, '/admin/refund-groups', {
    orderId: physical.id,
    basis: 'physical_return',
    basisRefId: physical.claimId,
    classification: 'merchandise',
    requestedItems: [{ orderItemId: physical.itemId, quantity: 1 }],
    reason: 'Premature',
  }).expect(422)
  expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
})

it('Package C HTTP: concurrent natural reservations converge and competing quantities cannot exceed unit entitlement', async () => {
  const f = await reservationFixture(),
    root = packageCRoot({ options: codRefundPolicy(f) })
  const results = await Promise.all(
    ['a', 'b'].map((key) => packageCPost(root, f.admin, '/admin/refund-groups', f.input, key)),
  )
  expect(results.map((r) => r.status)).toEqual([201, 201])
  expect(results[0]?.body.data.refunds[0].id).toBe(results[1]?.body.data.refunds[0].id)
  await packageCPost(
    root,
    f.admin,
    '/admin/refund-groups',
    { ...f.input, requestedItems: [{ orderItemId: f.itemId, quantity: 2 }] },
    'overlap',
  ).expect(409)
  expect(await refundModel(context.db.connection).countDocuments()).toBe(1)
  expect(await refundAttemptModel(context.db.connection).countDocuments()).toBe(1)
})

it('Package C HTTP: gateway acceptance persists references, leaves processing, and changed-key replay never redispatches', async () => {
  const f = await reservedGatewayFixture()
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockResolvedValue({
      kind: 'accepted',
      refundRefId: 'synthetic-refund-ref',
      evidenceDigest: 'a'.repeat(64),
    })
  const root = packageCRoot({
    options: refundDevelopmentPolicy,
    gateway: {
      client: { initiateRefund },
      merchantAccountKey: createHash('sha256').update('sandbox\0synthetic-store').digest('hex'),
    },
  })
  const path = `/admin/refunds/${f.obligation._id}/payout-attempts`,
    body = { method: 'gateway', reason: 'Synthetic authorized dispatch' }
  const results = await Promise.all(
    ['one', 'two'].map((key) => packageCPost(root, f.admin, path, body, key)),
  )
  expect(results.map((r) => r.status)).toEqual([200, 200])
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  await packageCPost(root, f.admin, path, body, 'alias').expect(200)
  await packageCPost(root, f.admin, path, { ...body, reason: 'Changed' }, 'alias').expect(409)
  const detail = await request(root)
    .get(`/api/v1/admin/refunds/${f.obligation._id}`)
    .set('Cookie', f.admin.cookie)
    .expect(200)
  expect(detail.body.data.status).toBe('processing')
  expect(detail.body.data.capacityStatus).toBe('reserved')
  expect(detail.body.data.attempts[0].refundRefId).toBe('synthetic-refund-ref')
  expect(detail.body.data.completedAt).toBeUndefined()
  expect(
    (await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail())
      .correctionRefundCompletedPoisha,
  ).toBe(0)
})

it('Package C HTTP: missing transport, merchant mismatch and timeout preserve source capacity and one stable intent', async () => {
  const f = await reservedGatewayFixture(),
    path = `/admin/refunds/${f.obligation._id}/payout-attempts`,
    body = { method: 'gateway', reason: 'Synthetic dispatch' }
  await packageCPost(
    packageCRoot({ options: refundDevelopmentPolicy }),
    f.admin,
    path,
    body,
  ).expect(503)
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockRejectedValue(new Error('Synthetic timeout'))
  await packageCPost(
    packageCRoot({
      options: refundDevelopmentPolicy,
      gateway: { client: { initiateRefund }, merchantAccountKey: 'f'.repeat(64) },
    }),
    f.admin,
    path,
    body,
    'mismatch',
  ).expect(409)
  expect(initiateRefund).not.toHaveBeenCalled()
  const root = packageCRoot({
    options: refundDevelopmentPolicy,
    gateway: {
      client: { initiateRefund },
      merchantAccountKey: createHash('sha256').update('sandbox\0synthetic-store').digest('hex'),
    },
  })
  const result = await packageCPost(root, f.admin, path, body, 'uncertain').expect(200)
  expect(result.body.data.state).toBe('uncertain')
  await packageCPost(root, f.admin, path, body, 'restart-key').expect(200)
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  expect(
    (await refundModel(context.db.connection).findById(f.obligation._id).orFail()).capacityStatus,
  ).toBe('reserved')
})

it('Package C HTTP: suspended admin and missing persistence cannot create obligations or repair schema', async () => {
  const f = await reservationFixture(),
    root = packageCRoot({ options: codRefundPolicy(f) })
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'suspended' } },
  )
  await packageCPost(root, f.admin, '/admin/refund-groups', f.input).expect(403)
  await context.identities.users.updateOne(
    { _id: f.admin.user._id },
    { $set: { status: 'active' } },
  )
  await context.db.connection.db?.command({ collMod: 'refundAttempts', validator: {} })
  try {
    await packageCPost(root, f.admin, '/admin/refund-groups', f.input, 'unready').expect(503)
    expect(await refundModel(context.db.connection).countDocuments()).toBe(0)
  } finally {
    const { refundAttemptValidator } = await import(
      '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
    )
    await context.db.connection.db?.command({
      collMod: 'refundAttempts',
      validator: refundAttemptValidator,
    })
  }
})

it('Package C HTTP: default gateway policy approves the existing verified correction intent without merchandise effects', async () => {
  await initializeRefundAttemptPersistence(context.db.connection)
  const f = await processingFixture()
  expect(await f.processor().process(f.claim)).toBe('committed')
  f.change({ bank_tran_id: 'package-c-correction-bank', val_id: 'package-c-correction-validation' })
  expect(
    await f.processor().process({ ...f.claim, validationId: 'package-c-correction-validation' }),
  ).toBe('committed')
  const intent = await refundModel(context.db.connection)
      .findOne({ orderId: f.result.id })
      .orFail(),
    admin = await customer('admin')
  const root = packageCRoot({ options: refundDevelopmentPolicy })
  const result = await packageCPost(root, admin, '/admin/refund-groups', {
    orderId: f.result.id,
    basis: 'payment_correction',
    classification: 'payment_correction',
    correctionCollectionId: intent.sourceCollectionId.toHexString(),
    reason: 'Verified duplicate collection',
  }).expect(201)
  expect(result.body.data.refunds[0]).toMatchObject({
    id: intent._id.toHexString(),
    method: 'gateway',
    status: 'approved',
    classification: 'payment_correction',
    items: [],
  })
  expect(await refundModel(context.db.connection).countDocuments()).toBe(1)
  const attempt = await refundAttemptModel(context.db.connection).findOne().orFail()
  expect(attempt.originalBankTranId).toBe('package-c-correction-bank')
  expect(attempt.refundTransId).toHaveLength(30)
  const payment = await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  expect(payment.merchandiseRefundHeldPoisha).toBe(0)
  expect(payment.correctionRefundHeldPoisha).toBe(intent.amountPoisha)
  expect(payment.paymentStatus).toBe('paid')
})

it('Package C HTTP: actual server startup loads protected policy and default startup omits refund operations', async () => {
  const f = await reservationFixture(),
    directory = await mkdtemp(join(tmpdir(), 'sportzone-refund-startup-'))
  const originalEnvironment = process.env
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    const path = join(directory, 'policy.json')
    await writeFile(path, JSON.stringify(codRefundPolicy(f)), { mode: 0o600 })
    const env = {
      ...identityEnvironment(),
      SESSION_SECRET: authSecret,
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
    }
    process.env = { ...env }
    let config = { ...loadEnvironment(env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server).get('/api/v1/admin/refunds').expect(404)
    await runtime.close()
    process.env = { ...env, REFUND_OPERATIONS_ENABLED: 'true', REFUND_POLICY_FILE: path }
    config = { ...loadEnvironment(process.env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server).get('/api/v1/admin/refunds').expect(401)
    const created = await request(runtime.server)
      .post('/api/v1/admin/refund-groups')
      .set('Origin', 'https://admin.example.test')
      .set('Cookie', f.admin.cookie)
      .set('X-CSRF-Token', f.admin.csrf)
      .set('Idempotency-Key', 'startup-refund')
      .send(f.input)
      .expect(201)
    await request(runtime.server)
      .get(`/api/v1/admin/refunds/${created.body.data.refunds[0].id}`)
      .set('Cookie', f.admin.cookie)
      .expect(200)
  } finally {
    await runtime?.close()
    process.env = originalEnvironment
    await rm(directory, { recursive: true, force: true })
  }
})
