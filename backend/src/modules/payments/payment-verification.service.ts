import { createHash } from 'node:crypto'
import type { Connection } from 'mongoose'
import type { createSslcommerzAdapter } from '../../providers/sslcommerz/sslcommerz.client.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import { paymentRecordModels } from './payment-record.model.js'
import { paymentInitiationModel } from './payment-initiation.model.js'
import { paymentModel } from './payment.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { verifyPaymentInitiationPersistence } from './payment-initiation.persistence.js'
import type { PaymentCallbackClaim } from './payment-callback.service.js'

type Gateway = Pick<ReturnType<typeof createSslcommerzAdapter>, 'validate' | 'queryTransaction'>
type Validation = Extract<Awaited<ReturnType<Gateway['validate']>>, { kind: 'record' }>
const uncertain = { kind: 'uncertain' } as const

// Read/verification capability only. Its results are NOT durable receipts or callback acknowledgments.
// The receipt coordinator must recheck mapping in its transaction before applying any business effect.
export function paymentVerificationService(
  connection: Connection,
  gateway: Gateway,
  merchantAccountKey: string,
) {
  if (!/^[a-f0-9]{64}$/.test(merchantAccountKey))
    throw new Error('Invalid payment verification merchant')
  const { attempts } = paymentRecordModels(connection),
    initiations = paymentInitiationModel(connection),
    payments = paymentModel(connection)
  async function mapping(tranId: string) {
    const attempt = await attempts.findOne({ provider: 'sslcommerz', tranId }).lean()
    if (!attempt) return undefined
    const initiation = await initiations
      .findOne({ attemptId: attempt._id, merchantAccountKey, orderId: attempt.orderId })
      .lean()
    if (
      !initiation ||
      !['dispatching', 'accepted', 'uncertain', 'rejected'].includes(initiation.status)
    )
      return undefined
    const payment = await payments
      .findOne({ _id: attempt.paymentId, orderId: attempt.orderId, method: 'online' })
      .lean()
    if (!payment || attempt.currency !== 'BDT') return undefined
    return {
      attemptId: attempt._id.toHexString(),
      orderId: attempt.orderId.toHexString(),
      paymentId: attempt.paymentId.toHexString(),
      expectedAmountPoisha: attempt.expectedAmountPoisha,
    }
  }
  async function receipt(result: Validation, notificationTranId: string) {
    const record = result.record
    if (
      result.merchantAccountKey !== merchantAccountKey ||
      !['VALID', 'VALIDATED'].includes(record.status) ||
      !record.validationId ||
      !record.bankTranId ||
      !Number.isSafeInteger(record.amountPoisha) ||
      record.amountPoisha === undefined ||
      record.amountPoisha <= 0 ||
      record.currency !== 'BDT' ||
      record.requestedCurrency !== 'BDT' ||
      record.requestedAmountPoisha === undefined ||
      !record.providerCollectedAt ||
      ![0, 1].includes(record.riskLevel ?? -1)
    )
      return undefined
    const risk =
      record.riskLevel === 1 ||
      Boolean(record.riskTitle && record.riskTitle.toLowerCase() !== 'safe')
    const linked = await mapping(record.tranId),
      referenceMatch = record.tranId === notificationTranId,
      amountDisposition = !linked
        ? ('unmatched' as const)
        : record.amountPoisha < linked.expectedAmountPoisha
          ? ('under_collected' as const)
          : record.amountPoisha > linked.expectedAmountPoisha
            ? ('over_collected' as const)
            : ('matched' as const),
      providerAmountConsistent = record.requestedAmountPoisha === record.amountPoisha
    // Hash ONLY the normalized, allowlisted verified fact, never raw card/customer/credential data.
    const evidence = {
      merchantAccountKey,
      ...record,
    }
    return {
      ...evidence,
      evidenceDigest: createHash('sha256').update(JSON.stringify(evidence)).digest('hex'),
      mapping: linked,
      referenceMatch,
      amountDisposition,
      providerAmountConsistent,
      riskStatus: risk ? ('review_required' as const) : ('clear' as const),
      // Permission for later transactional consideration only, never proof of funding/fulfillment.
      allocationCandidate:
        Boolean(linked) &&
        referenceMatch &&
        amountDisposition === 'matched' &&
        providerAmountConsistent &&
        !risk,
    }
  }
  return {
    async verify(claim: PaymentCallbackClaim) {
      assertOutsideTransaction()
      if (claim.merchantAccountKey !== merchantAccountKey) return uncertain
      try {
        await verifyPaymentRecordPersistence(connection)
        await verifyPaymentInitiationPersistence(connection)
        // Claims about status, amount, currency and bank reference never become evidence.
        if (claim.validationId) {
          const validated = await gateway.validate({ validationId: claim.validationId })
          if (validated.kind !== 'record' || validated.record.validationId !== claim.validationId)
            return uncertain
          const verified = await receipt(validated, claim.tranId)
          return verified ? { kind: 'receipts' as const, receipts: [verified] } : uncertain
        }
        const queried = await gateway.queryTransaction({ tranId: claim.tranId })
        if (
          queried.kind !== 'records' ||
          queried.merchantAccountKey !== merchantAccountKey ||
          !queried.records.length ||
          queried.records.some((record) => record.tranId !== claim.tranId)
        )
          return uncertain
        const paid = queried.records.filter((record) =>
          ['VALID', 'VALIDATED'].includes(record.status),
        )
        if (paid.length) {
          const receipts = []
          for (const record of paid) {
            if (!record.validationId) return uncertain
            const validated = await gateway.validate({ validationId: record.validationId })
            if (
              validated.kind !== 'record' ||
              validated.record.validationId !== record.validationId ||
              validated.record.tranId !== claim.tranId ||
              validated.record.bankTranId !== record.bankTranId
            )
              return uncertain
            const verified = await receipt(validated, claim.tranId)
            if (!verified) return uncertain
            receipts.push(verified)
          }
          return { kind: 'receipts' as const, receipts }
        }
        const record = queried.records[0]
        if (
          queried.records.length !== 1 ||
          !record ||
          !['FAILED', 'CANCELLED', 'EXPIRED'].includes(record.status)
        )
          return uncertain
        const linked = await mapping(record.tranId)
        if (!linked) return uncertain
        return {
          kind: 'nonpayment' as const,
          status: record.status,
          mapping: linked,
          merchantAccountKey,
          evidenceDigest: createHash('sha256')
            .update(
              JSON.stringify({ merchantAccountKey, tranId: record.tranId, status: record.status }),
            )
            .digest('hex'),
        }
      } catch {
        // Provider or database uncertainty never authorizes a financial mutation or acknowledgment.
        return uncertain
      }
    },
  }
}
