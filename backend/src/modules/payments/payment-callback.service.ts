import type { Connection } from 'mongoose'
import { createHash, createHmac } from 'node:crypto'
import { inTransaction, assertOutsideTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { createAuditWriter } from '../audit/audit.service.js'
import {
  paymentCallbackOptions,
  paymentIpnForm,
  type PaymentCallbackOptions,
} from './payment-callback.schema.js'
// Claims are notifications only. The independent processor owns provider verification and all durable
// business transitions; it must return committed ONLY after its transaction/recoverable poll intent commits.
export type PaymentCallbackClaim = Readonly<{
  merchantAccountKey: string
  tranId: string
  claimedStatus: string
  validationId?: string
  bankTranId?: string
  claimedAmount?: string
  claimedCurrency?: string
}>
export type PaymentCallbackProcessor = (
  claim: PaymentCallbackClaim,
) => Promise<'committed' | 'retry'>
export function paymentCallbackService(
  connection: Connection,
  rawOptions: PaymentCallbackOptions,
  secret: string,
  process?: PaymentCallbackProcessor,
  clock: () => Date = () => new Date(),
) {
  if (!/^[a-f0-9]{64}$/.test(secret)) throw new Error('Invalid callback protection configuration')
  const options = paymentCallbackOptions.parse(rawOptions),
    audit = createAuditWriter(connection),
    merchantAccountKey = createHash('sha256')
      .update(`${options.mode}\0${options.storeId}`)
      .digest('hex')
  async function record(
    reason: 'malformed' | 'merchant_mismatch' | 'unverified',
    claim?: PaymentCallbackClaim,
  ) {
    const now = clock()
    if (!Number.isFinite(now.getTime())) throw new ApiError('SERVICE_UNAVAILABLE')
    const fingerprint = createHmac('sha256', Buffer.from(secret, 'hex'))
      .update(JSON.stringify(['sportzone:payment-callback:v1', reason, claim ?? null]))
      .digest('hex')
    try {
      await inTransaction(connection, (session) =>
        audit(session, {
          actorType: 'system',
          action: `payment.callback.${reason}`,
          targetType: 'payment_callback',
          operationKey: `${fingerprint}:${Math.floor(now.getTime() / 60000)}`,
          afterDigest: fingerprint,
          reason,
          occurredAt: now,
        }),
      )
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
        throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    malformed: () => record('malformed'),
    async receive(raw: unknown) {
      assertOutsideTransaction()
      const parsed = paymentIpnForm.safeParse(raw)
      if (!parsed.success) {
        await record('malformed')
        throw new ApiError('INVALID_REQUEST')
      }
      const input = parsed.data
      const claim: PaymentCallbackClaim = Object.freeze({
        merchantAccountKey,
        tranId: input.tran_id,
        claimedStatus: input.status,
        ...(input.val_id ? { validationId: input.val_id } : {}),
        ...(input.bank_tran_id ? { bankTranId: input.bank_tran_id } : {}),
        ...(input.amount ? { claimedAmount: input.amount } : {}),
        ...(input.currency ? { claimedCurrency: input.currency } : {}),
      })
      if (input.store_id && input.store_id !== options.storeId) {
        await record('merchant_mismatch', claim)
        throw new ApiError('FORBIDDEN')
      }
      await record('unverified', claim)
      if (!process) throw new ApiError('SERVICE_UNAVAILABLE')
      try {
        if ((await process(claim)) === 'committed') return
      } catch {
        throw new ApiError('SERVICE_UNAVAILABLE')
      }
      throw new ApiError('SERVICE_UNAVAILABLE')
    },
    redirect(result: 'success' | 'fail' | 'cancel') {
      return options.returns[result]
    },
  }
}
