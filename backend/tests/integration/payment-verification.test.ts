import { createHash } from 'node:crypto'
import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { createSslcommerzAdapter } from '../../src/providers/sslcommerz/sslcommerz.client.js'
import { paymentVerificationService } from '../../src/modules/payments/payment-verification.service.js'
import { paymentRecordModels } from '../../src/modules/payments/payment-record.model.js'
import { initializePaymentRecordPersistence } from '../../src/modules/payments/payment-record.persistence.js'
import { paymentInitiationModel } from '../../src/modules/payments/payment-initiation.model.js'
import { initializePaymentInitiationPersistence } from '../../src/modules/payments/payment-initiation.persistence.js'
import { checkoutPaymentAccess } from '../../src/modules/payments/payment.service.js'
import { paymentModel } from '../../src/modules/payments/payment.model.js'
import { inTransaction } from '../../src/shared/database/transaction.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
const merchantAccountKey = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
const claim = {
  merchantAccountKey,
  tranId: 'SZsynthetic',
  claimedStatus: 'FAILED',
  validationId: 'synthetic-validation',
  claimedAmount: '0.01',
  claimedCurrency: 'USD',
  bankTranId: 'forged-bank',
}
const statusClaim = { merchantAccountKey, tranId: claim.tranId, claimedStatus: 'VALID' }
const record = {
  status: 'VALIDATED',
  tran_id: claim.tranId,
  val_id: claim.validationId,
  bank_tran_id: 'synthetic-bank',
  amount: '10.01',
  currency: 'BDT',
  currency_type: 'BDT',
  currency_amount: '10.01',
  tran_date: '2026-10-29 12:00:00',
  risk_level: '0',
  card_no: 'private-card-value',
  cus_name: 'private-customer-value',
  store_id: 'synthetic-store',
}
let transport: ReturnType<typeof vi.fn<typeof fetch>>
function service() {
  return paymentVerificationService(
    db.connection,
    createSslcommerzAdapter(
      {
        appEnv: 'test',
        mode: 'sandbox',
        storeId: 'synthetic-store',
        storePassword: 'synthetic-password',
        callbackOrigin: 'https://api.example.test',
        timeoutMs: 1000,
      },
      transport,
    ),
    merchantAccountKey,
  )
}
function respond(change: object = {}) {
  transport.mockImplementation(async () => Response.json({ ...record, ...change }))
}
async function seed(
  change: { merchant?: string; orderMismatch?: boolean; expected?: number } = {},
) {
  const orderId = new Types.ObjectId(),
    attemptId = new Types.ObjectId()
  await inTransaction(db.connection, (session) =>
    checkoutPaymentAccess(db.connection).create(session, {
      orderId: orderId.toHexString(),
      method: 'online',
      expectedPoisha: 1001,
    }),
  )
  const payment = await paymentModel(db.connection).findOne({ orderId }).orFail()
  await paymentRecordModels(db.connection).attempts.create({
    _id: attemptId,
    paymentId: payment._id,
    orderId,
    provider: 'sslcommerz',
    tranId: claim.tranId,
    expectedAmountPoisha: change.expected ?? 1001,
    initiatedOutstandingPoisha: change.expected ?? 1001,
    currency: 'BDT',
    amountDisposition: 'not_checked',
    requestedChannel: 'bkash',
    state: 'uncertain',
  })
  await paymentInitiationModel(db.connection).create({
    orderId: change.orderMismatch ? new Types.ObjectId() : orderId,
    attemptId,
    merchantAccountKey: change.merchant ?? merchantAccountKey,
    gatewayKey: 'bkash',
    scopeKeyHash: 'a'.repeat(64),
    idempotencyKeyHash: 'b'.repeat(64),
    requestFingerprint: 'c'.repeat(64),
    status: 'uncertain',
  })
  return {
    orderId: orderId.toHexString(),
    paymentId: payment._id.toHexString(),
    attemptId: attemptId.toHexString(),
    expectedAmountPoisha: change.expected ?? 1001,
  }
}
beforeAll(async () => {
  db = await isolatedDatabase()
  await initializePaymentRecordPersistence(db.connection)
  await initializePaymentInitiationPersistence(db.connection)
})
beforeEach(async () => {
  for (const name of [
    'payments',
    'paymentAttempts',
    'paymentInitiations',
    'providerReceiptIntake',
    'paymentCollections',
  ])
    await db.connection.collection(name).deleteMany({})
  transport = vi.fn<typeof fetch>()
  respond()
})
afterAll(async () => db?.close())

it('uses independently validated values and immutable mapping, never callback money/status or raw personal data', async () => {
  const mapping = await seed()
  const result = await service().verify(claim)
  expect(result).toMatchObject({
    kind: 'receipts',
    receipts: [
      {
        mapping,
        amountPoisha: 1001,
        bankTranId: record.bank_tran_id,
        status: 'VALIDATED',
        amountDisposition: 'matched',
        riskStatus: 'clear',
        allocationCandidate: true,
      },
    ],
  })
  expect(JSON.stringify(result)).not.toMatch(
    /private-card|private-customer|forged-bank|synthetic-password/,
  )
  expect(transport).toHaveBeenCalledTimes(1)
  const url = new URL(String(transport.mock.calls[0]?.[0]))
  expect(url.pathname).toBe('/validator/api/validationserverAPI.php')
  expect(url.searchParams.get('val_id')).toBe(claim.validationId)
  expect(await paymentModel(db.connection).findOne().lean()).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
  expect(await paymentRecordModels(db.connection).intake.countDocuments()).toBe(0)
})
it.each([
  [1000, 'under_collected'],
  [1002, 'over_collected'],
])(
  'retains verified amount %s but refuses automatic allocation for discrepancies',
  async (amount, disposition) => {
    await seed()
    const decimal = `${Math.floor(Number(amount) / 100)}.${String(Number(amount) % 100).padStart(2, '0')}`
    respond({ amount: decimal, currency_amount: decimal })
    expect(await service().verify(claim)).toMatchObject({
      kind: 'receipts',
      receipts: [
        { amountPoisha: amount, amountDisposition: disposition, allocationCandidate: false },
      ],
    })
  },
)
it('preserves high-risk paid evidence on review hold and rejects inconsistent requested amounts for allocation', async () => {
  await seed()
  respond({ risk_level: '1' })
  expect(await service().verify(claim)).toMatchObject({
    kind: 'receipts',
    receipts: [{ riskStatus: 'review_required', allocationCandidate: false }],
  })
  respond({ currency_amount: '10.02' })
  expect(await service().verify(claim)).toMatchObject({
    kind: 'receipts',
    receipts: [{ providerAmountConsistent: false, allocationCandidate: false }],
  })
})
it.each([{}, { merchant: 'f'.repeat(64) }, { orderMismatch: true }])(
  'keeps unknown or unbound mapping unmatched without inventing an order: %j',
  async (change) => {
    if (Object.keys(change).length) await seed(change)
    expect(await service().verify(claim)).toMatchObject({
      kind: 'receipts',
      receipts: [
        { mapping: undefined, amountDisposition: 'unmatched', allocationCandidate: false },
      ],
    })
  },
)
it('never allocates a verified receipt to a forged notification transaction reference', async () => {
  await seed()
  expect(await service().verify({ ...claim, tranId: 'forged-tran' })).toMatchObject({
    kind: 'receipts',
    receipts: [{ referenceMatch: false, allocationCandidate: false }],
  })
})
it.each([
  { store_id: 'foreign-store' },
  { val_id: 'foreign-validation' },
  { status: 'FAILED' },
  { currency: 'USD' },
  { currency_type: 'USD' },
  { risk_level: '2' },
  { risk_level: undefined },
  { amount: '10.001' },
  { amount: '0.00' },
  { bank_tran_id: '' },
  { amount: '90071992547409.92' },
])('fails closed for invalid independent evidence %j', async (change) => {
  await seed()
  respond(change)
  expect(await service().verify(claim)).toEqual({ kind: 'uncertain' })
  expect(await paymentModel(db.connection).findOne().lean()).toMatchObject({
    paymentStatus: 'pending',
  })
})
it('does not call provider for a different configured merchant and keeps transport/database failures uncertain', async () => {
  await seed()
  expect(await service().verify({ ...claim, merchantAccountKey: 'f'.repeat(64) })).toEqual({
    kind: 'uncertain',
  })
  expect(transport).not.toHaveBeenCalled()
  transport.mockRejectedValue(new Error('private-provider-error'))
  expect(await service().verify(claim)).toEqual({ kind: 'uncertain' })
})
it.each(['FAILED', 'CANCELLED', 'EXPIRED'])(
  'uses independent transaction query for terminal %s, without trusting callback success',
  async (status) => {
    await seed()
    transport.mockImplementation(async () =>
      Response.json({
        APIConnect: 'DONE',
        no_of_trans_found: 1,
        element: [{ status, tran_id: claim.tranId }],
      }),
    )
    expect(await service().verify(statusClaim)).toMatchObject({ kind: 'nonpayment', status })
    expect(await paymentRecordModels(db.connection).attempts.findOne().lean()).toMatchObject({
      state: 'uncertain',
    })
  },
)
it.each(['PENDING', 'UNATTEMPTED'])('does not convert %s into verified failure', async (status) => {
  await seed()
  transport.mockImplementation(async () =>
    Response.json({
      APIConnect: 'DONE',
      no_of_trans_found: 1,
      element: [{ status, tran_id: claim.tranId }],
    }),
  )
  expect(await service().verify(statusClaim)).toEqual({
    kind: 'uncertain',
  })
})
it('validates every status-query paid receipt and prefers paid evidence over an older failed status', async () => {
  await seed()
  transport.mockImplementation(async (url) =>
    new URL(String(url)).pathname.endsWith('validationserverAPI.php')
      ? Response.json(record)
      : Response.json({
          APIConnect: 'DONE',
          no_of_trans_found: 2,
          element: [{ status: 'FAILED', tran_id: claim.tranId }, record],
        }),
  )
  expect(await service().verify(statusClaim)).toMatchObject({
    kind: 'receipts',
    receipts: [{ allocationCandidate: true }],
  })
  expect(transport).toHaveBeenCalledTimes(2)
})
it('rejects foreign transaction query results and conflicting validated collection identities', async () => {
  await seed()
  transport.mockImplementation(async (url) =>
    new URL(String(url)).pathname.endsWith('validationserverAPI.php')
      ? Response.json({ ...record, bank_tran_id: 'conflicting-bank' })
      : Response.json({ APIConnect: 'DONE', no_of_trans_found: 1, element: [record] }),
  )
  expect(await service().verify(statusClaim)).toEqual({
    kind: 'uncertain',
  })
  transport.mockImplementation(async () =>
    Response.json({
      APIConnect: 'DONE',
      no_of_trans_found: 1,
      element: [{ status: 'FAILED', tran_id: 'foreign-tran' }],
    }),
  )
  expect(await service().verify(statusClaim)).toEqual({
    kind: 'uncertain',
  })
})
it('prohibits verification inside a database transaction before provider I/O', async () => {
  await expect(inTransaction(db.connection, () => service().verify(claim))).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})

it('fails closed when canonical unique mapping protection is missing', async () => {
  await seed()
  const model = paymentRecordModels(db.connection).attempts
  await model.collection.dropIndex('payment_attempt_tran_unique')
  try {
    expect(await service().verify(claim)).toEqual({ kind: 'uncertain' })
    expect(transport).not.toHaveBeenCalled()
  } finally {
    await model.createIndexes()
  }
})

it('keeps distinct verified collections from one transaction query instead of collapsing money', async () => {
  await seed()
  const second = { ...record, val_id: 'second-validation', bank_tran_id: 'second-bank' }
  transport.mockImplementation(async (url) => {
    const parsed = new URL(String(url))
    return Response.json(
      parsed.pathname.endsWith('validationserverAPI.php')
        ? parsed.searchParams.get('val_id') === second.val_id
          ? second
          : record
        : { APIConnect: 'DONE', no_of_trans_found: 2, element: [record, second] },
    )
  })
  const result = await service().verify(statusClaim)
  expect(result.kind).toBe('receipts')
  if (result.kind !== 'receipts') throw new Error('Missing verified test receipts')
  expect(result.receipts.map((receipt) => receipt.bankTranId)).toEqual([
    record.bank_tran_id,
    second.bank_tran_id,
  ])
  expect(transport).toHaveBeenCalledTimes(3)
  expect(await paymentModel(db.connection).findOne().lean()).toMatchObject({
    paymentStatus: 'pending',
    verifiedCollectedPoisha: 0,
  })
})
it('has stable sanitized evidence identity despite changes to discarded card/customer fields', async () => {
  await seed()
  const first = await service().verify(claim)
  respond({ card_no: 'other-private-card', cus_name: 'other-private-name' })
  expect(await service().verify(claim)).toEqual(first)
})
it('does not interpret a missing provider record or an unmapped terminal status as noncollection', async () => {
  transport.mockImplementation(async () =>
    Response.json({ APIConnect: 'DONE', no_of_trans_found: 0, element: [] }),
  )
  expect(await service().verify(statusClaim)).toEqual({ kind: 'uncertain' })
  transport.mockImplementation(async () =>
    Response.json({
      APIConnect: 'DONE',
      no_of_trans_found: 1,
      element: [{ status: 'FAILED', tran_id: claim.tranId }],
    }),
  )
  expect(await service().verify(statusClaim)).toEqual({ kind: 'uncertain' })
})
