import { expect, it, vi } from 'vitest'
import { paymentModel } from '../../../src/modules/payments/payment.model.js'
import { refundFundingAccess } from '../../../src/modules/payments/payment.service.js'
import { refundAttemptModel } from '../../../src/modules/refunds/payouts/refund-attempt.model.js'
import { createRefundDispatchService } from '../../../src/modules/refunds/payouts/refund-dispatch.service.js'
import { refundModel } from '../../../src/modules/refunds/refund.model.js'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { composeAuditAccess } from '../../../src/setup.js'
import {
  assertOutsideTransaction,
  inTransaction,
} from '../../../src/shared/database/transaction.js'
import { context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { reservedGatewayFixture } from '../../helpers/commerce/refunds.js'

registerCommerceFixture()

it('refund dispatch: concurrent requests submit one persisted identity outside the transaction and acceptance remains processing', async () => {
  const f = await reservedGatewayFixture()
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockImplementation(async () => {
      assertOutsideTransaction()
      expect((await refundAttemptModel(context.db.connection).findOne().orFail()).status).toBe(
        'submitted',
      )
      expect(
        (await refundModel(context.db.connection).findById(f.obligation._id).orFail()).status,
      ).toBe('processing')
      return {
        kind: 'accepted',
        refundRefId: 'synthetic-provider-refund',
        evidenceDigest: 'a'.repeat(64),
      }
    })
  const service = createRefundDispatchService(
    context.db.connection,
    f.admins,
    refundFundingAccess(context.db.connection),
    { initiateRefund },
    composeAuditAccess(context.db.connection),
  )
  const command = { method: 'gateway', reason: 'Synthetic dispatch review' }
  const result = await Promise.all([
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      command,
      'send',
    ),
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      command,
      'send',
    ),
  ])
  expect(result.every((r) => r.state === 'submitted')).toBe(true)
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  const attempt = await refundAttemptModel(context.db.connection).findOne().orFail()
  expect(attempt.refundRefId).toBe('synthetic-provider-refund')
  expect(attempt.confirmedAt).toBeUndefined()
  const payment = await paymentModel(context.db.connection).findById(f.attempt.paymentId).orFail()
  expect(payment.correctionRefundHeldPoisha).toBe(f.obligation.amountPoisha)
  expect(payment.correctionRefundCompletedPoisha).toBe(0)
})

it('refund dispatch: timeout preserves held funds and stable identity without automatic redispatch', async () => {
  const f = await reservedGatewayFixture()
  const initiateRefund = vi
    .fn<ReturnType<typeof createSslcommerzAdapter>['initiateRefund']>()
    .mockRejectedValue(new Error('Synthetic ambiguous external timeout'))
  const service = createRefundDispatchService(
    context.db.connection,
    f.admins,
    refundFundingAccess(context.db.connection),
    { initiateRefund },
    composeAuditAccess(context.db.connection),
  )
  const command = { method: 'gateway', reason: 'Synthetic dispatch review' }
  const result = await service.dispatch(
    f.admin.credentials.customerToken,
    f.obligation._id.toHexString(),
    command,
    'uncertain',
  )
  expect(result.state).toBe('uncertain')
  expect(
    (
      await service.dispatch(
        f.admin.credentials.customerToken,
        f.obligation._id.toHexString(),
        command,
        'different-key',
      )
    ).state,
  ).toBe('uncertain')
  expect(initiateRefund).toHaveBeenCalledTimes(1)
  await expect(
    service.dispatch(
      f.admin.credentials.customerToken,
      f.obligation._id.toHexString(),
      { ...command, reason: 'Changed' },
      'uncertain',
    ),
  ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' })
  expect(
    (await refundModel(context.db.connection).findById(f.obligation._id).orFail()).capacityStatus,
  ).toBe('reserved')
  await expect(
    inTransaction(context.db.connection, () =>
      service.dispatch(
        f.admin.credentials.customerToken,
        f.obligation._id.toHexString(),
        command,
        'inside-transaction',
      ),
    ),
  ).rejects.toThrow()
})

it('refund transport local: provider request is forbidden inside a MongoDB transaction', async () => {
  const transport = vi.fn<typeof fetch>()
  const provider = createSslcommerzAdapter(
    {
      appEnv: 'test',
      mode: 'sandbox',
      storeId: 'synthetic-store',
      storePassword: 'synthetic-password',
      callbackOrigin: 'https://api.example.test',
      timeoutMs: 1000,
    },
    transport,
  )
  await expect(
    inTransaction(context.db.connection, (session) => {
      expect(session.inTransaction()).toBe(true)
      return provider.initiateRefund({
        bankTranId: 'bank',
        refundTransId: 'refund',
        amountPoisha: 100,
        remarks: 'synthetic',
      })
    }),
  ).rejects.toThrow()
  expect(transport).not.toHaveBeenCalled()
})
