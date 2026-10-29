import { createHash } from 'node:crypto'
import { correctionObligationService } from '../refunds/correction-obligation.service.js'
import { paymentSettlementService } from './payment-settlement.service.js'
import type { ClientSession, Connection } from 'mongoose'
import { assertOutsideTransaction, inTransaction } from '../../shared/database/transaction.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { createAuditWriter } from '../audit/audit.service.js'
import type { verifiedFundingOrderAccess } from '../orders/order.service.js'
import type { verifiedAllocationService } from '../checkout/verified-allocation.service.js'
import { paymentRecordModels, collectionAmounts } from './payment-record.model.js'
import { paymentModel } from './payment.model.js'
import { paymentInitiationModel } from './payment-initiation.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { verifyPaymentInitiationPersistence } from './payment-initiation.persistence.js'
import type { paymentVerificationService } from './payment-verification.service.js'
import type { PaymentCallbackClaim } from './payment-callback.service.js'
type Verifier = ReturnType<typeof paymentVerificationService>
type Receipt = Extract<
  Awaited<ReturnType<Verifier['verify']>>,
  { kind: 'receipts' }
>['receipts'][number]
// No timezone guess: v4 offset-free dates remain retryable pending qualified operator evidence.
function collectionTime(value: string | undefined) {
  if (!value || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/.test(value))
    return undefined
  const datePart = value.slice(0, 10),
    calendar = new Date(`${datePart}T00:00:00Z`)
  if (
    !Number.isFinite(calendar.getTime()) ||
    calendar.toISOString().slice(0, 10) !== datePart ||
    !/T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d/.test(value)
  )
    return undefined
  const date = new Date(value)
  return Number.isFinite(date.getTime()) ? date : undefined
}
export function paymentProcessingService(
  connection: Connection,
  verifier: Verifier,
  orders: ReturnType<typeof verifiedFundingOrderAccess>,
  allocation: ReturnType<typeof verifiedAllocationService>,
  clock: () => Date = () => new Date(),
) {
  const { attempts, intake, collections } = paymentRecordModels(connection),
    payments = paymentModel(connection),
    initiations = paymentInitiationModel(connection),
    audit = createAuditWriter(connection, true),
    corrections = correctionObligationService(connection),
    settlement = paymentSettlementService(connection, orders, allocation, clock)
  async function applyReceipt(session: ClientSession, receipt: Receipt, now: Date) {
    const collectedAt = collectionTime(receipt.providerCollectedAt)
    if (
      !collectedAt ||
      collectedAt > now ||
      !receipt.bankTranId ||
      !receipt.validationId ||
      !receipt.amountPoisha
    )
      throw new ApiError('SERVICE_UNAVAILABLE')
    const amount = receipt.amountPoisha
    const identity = {
      provider: 'sslcommerz' as const,
      merchantAccountKey: receipt.merchantAccountKey,
      providerCollectionRef: receipt.bankTranId,
    }
    const previous = await intake.findOne(identity).session(session)
    if (previous) {
      // VALID may become VALIDATED on replay. Compare immutable money/identity facts, not status bytes.
      if (
        previous.amountPoisha !== receipt.amountPoisha ||
        previous.currency !== receipt.currency ||
        previous.validationId !== receipt.validationId ||
        previous.reportedTranId !== receipt.tranId ||
        previous.collectedAt.getTime() !== collectedAt.getTime()
      ) {
        await audit(session, {
          actorType: 'system',
          action: 'payment.receipt.conflict',
          targetType: 'provider_receipt',
          targetId: previous._id.toHexString(),
          operationKey: `receipt-conflict:${previous._id}:${receipt.evidenceDigest}`,
          afterDigest: receipt.evidenceDigest,
          occurredAt: now,
        })
      }
      if (previous.linkedCollectionId && receipt.riskStatus !== 'clear') {
        const linked = await collections.findById(previous.linkedCollectionId).session(session)
        if (!linked) throw new ApiError('STATE_CONFLICT')
        const payment = await payments.findById(linked.paymentId).session(session)
        if (!payment) throw new ApiError('STATE_CONFLICT')
        const originalAttempt = linked.attemptId
          ? await attempts.findById(linked.attemptId).session(session)
          : undefined
        if (
          payment.riskStatus === 'clear' &&
          !(
            originalAttempt &&
            originalAttempt.riskLevel === receipt.riskLevel &&
            (receipt.riskLevel === 1
              ? !receipt.riskTitle || originalAttempt.riskTitle === receipt.riskTitle
              : Boolean(receipt.riskTitle) && originalAttempt.riskTitle === receipt.riskTitle)
          )
        ) {
          await payments.updateOne(
            { _id: payment._id, revision: payment.revision },
            { $inc: { revision: 1 }, $set: { riskStatus: 'review' } },
            { session },
          )
          if (linked.attemptId)
            await attempts.updateOne(
              { _id: linked.attemptId, state: 'verified_paid' },
              {
                $set: {
                  riskLevel: receipt.riskLevel,
                  ...(receipt.riskTitle ? { riskTitle: receipt.riskTitle } : {}),
                  lastCheckedAt: now,
                },
              },
              { session },
            )
          await orders.inspect(session, payment.orderId.toHexString())
          await orders.finish(session, payment.orderId.toHexString(), false, true)
          await audit(session, {
            actorType: 'system',
            action: 'payment.receipt.risk_escalation',
            targetType: 'payment',
            targetId: payment._id.toHexString(),
            operationKey: `risk-escalation:${previous._id}:${receipt.evidenceDigest}`,
            afterDigest: receipt.evidenceDigest,
            occurredAt: now,
          })
        }
      }
      return
    }
    const [row] = await intake.create(
      [
        {
          ...identity,
          bankTranId: receipt.bankTranId,
          validationId: receipt.validationId,
          reportedTranId: receipt.tranId,
          amountPoisha: receipt.amountPoisha,
          currency: 'BDT',
          collectedAt,
          verifiedAt: now,
          validationDigest: receipt.evidenceDigest,
          matchingStatus: receipt.mapping ? 'quarantined' : 'unmatched',
        },
      ],
      { session },
    )
    if (!row) throw new ApiError('STATE_CONFLICT')
    await audit(session, {
      actorType: 'system',
      action: 'payment.receipt.intake',
      targetType: 'provider_receipt',
      targetId: row._id.toHexString(),
      operationKey: `receipt:${row._id}`,
      afterDigest: receipt.evidenceDigest,
      occurredAt: now,
    })
    const mapping = receipt.mapping
    if (
      !mapping ||
      !receipt.referenceMatch ||
      receipt.amountDisposition !== 'matched' ||
      !receipt.providerAmountConsistent
    )
      return
    const attempt = await attempts
      .findOne({
        _id: mapping.attemptId,
        orderId: mapping.orderId,
        paymentId: mapping.paymentId,
        tranId: receipt.tranId,
        expectedAmountPoisha: receipt.amountPoisha,
      })
      .session(session)
    const operation = await initiations
      .findOne({
        attemptId: mapping.attemptId,
        orderId: mapping.orderId,
        merchantAccountKey: receipt.merchantAccountKey,
      })
      .session(session)
    if (!attempt || !operation) return
    const payment = await payments
      .findOne({ _id: mapping.paymentId, orderId: mapping.orderId, method: 'online' })
      .session(session)
    if (!payment || payment.revision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    const order = await orders.inspect(session, mapping.orderId)
    if (!order || order.expectedPoisha !== payment.expectedPoisha) return
    const remaining = payment.expectedPoisha - payment.merchandiseFundedPoisha
    // Additional settled collections are preserved as unassigned, never counted as merchandise twice.
    const correction = order.cancelled ? receipt.amountPoisha : 0
    const merchandise =
      !order.cancelled && remaining === receipt.amountPoisha ? receipt.amountPoisha : 0
    const nextFunded = payment.merchandiseFundedPoisha + merchandise,
      nextCollected = payment.verifiedCollectedPoisha + receipt.amountPoisha
    if (!Number.isSafeInteger(nextCollected)) throw new ApiError('STATE_CONFLICT')
    const risk = payment.riskStatus !== 'clear' || receipt.riskStatus !== 'clear'
    const [linked] = await collections.create(
      [
        {
          paymentId: payment._id,
          orderId: payment.orderId,
          attemptId: attempt._id,
          intakeId: row._id,
          ...identity,
          bankTranId: receipt.bankTranId,
          validationId: receipt.validationId,
          amountPoisha: receipt.amountPoisha,
          currency: 'BDT',
          collectedAt,
          verifiedAt: now,
          evidenceDigest: receipt.evidenceDigest,
          verifiedBy: { type: 'provider' },
          ...Object.fromEntries(
            collectionAmounts.map((name) => [
              name,
              name === 'merchandiseAllocatedPoisha'
                ? merchandise
                : name === 'correctionAllocatedPoisha'
                  ? correction
                  : name === 'unassignedAllocatedPoisha'
                    ? amount - merchandise - correction
                    : 0,
            ]),
          ),
          revision: 0,
        },
      ],
      { session },
    )
    if (!linked) throw new ApiError('STATE_CONFLICT')
    await intake.updateOne(
      { _id: row._id, matchingStatus: row.matchingStatus },
      { $set: { matchingStatus: 'linked', linkedCollectionId: linked._id } },
      { session },
    )
    const updated = await payments.updateOne(
      { _id: payment._id, revision: payment.revision },
      {
        $inc: { revision: 1 },
        $set: {
          verifiedCollectedPoisha: nextCollected,
          merchandiseFundedPoisha: nextFunded,
          unassignedCollectedPoisha:
            payment.unassignedCollectedPoisha + receipt.amountPoisha - merchandise - correction,
          correctionCollectedPoisha: payment.correctionCollectedPoisha + correction,
          ...((nextFunded === payment.expectedPoisha || (order.cancelled && correction > 0)) &&
          !['partially_refunded', 'refunded'].includes(payment.paymentStatus)
            ? { paymentStatus: 'paid' }
            : {}),
          ...(receipt.riskStatus !== 'clear' && payment.riskStatus === 'clear'
            ? { riskStatus: 'review' }
            : {}),
          lastReconciledAt: now,
        },
      },
      { session },
    )
    if (updated.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
    // A paid proof can supersede terminal nonpayment; stale failure can never supersede this state.
    if (attempt.state !== 'verified_paid')
      await attempts.updateOne(
        { _id: attempt._id, state: attempt.state },
        {
          $set: {
            state: 'verified_paid',
            verifiedReceiptAmountPoisha: receipt.amountPoisha,
            amountDisposition: 'matched',
            providerValidationId: receipt.validationId,
            bankTranId: receipt.bankTranId,
            riskLevel: receipt.riskLevel,
            ...(receipt.riskTitle ? { riskTitle: receipt.riskTitle } : {}),
            lastCheckedAt: now,
            verification: {
              verifiedAt: now,
              verifiedStatus: receipt.status,
              merchantIdMatch: true,
              amountMatch: true,
              currencyMatch: true,
              referenceMatch: true,
              rawRecordDigest: receipt.evidenceDigest,
            },
          },
        },
        { session },
      )
    if (correction > 0)
      await corrections.create(session, {
        orderId: mapping.orderId,
        paymentId: mapping.paymentId,
        sourceCollectionId: linked._id.toHexString(),
        amountPoisha: correction,
        decisionKey: createHash('sha256').update(`late-cancelled:${linked._id}`).digest('hex'),
      })
    let committed = false
    if (order.eligible && !risk && merchandise > 0 && nextFunded === payment.expectedPoisha)
      committed = await allocation.commitLive(session, order.binding)
    if (risk || (order.eligible && merchandise > 0))
      await orders.finish(session, mapping.orderId, committed, risk)
    await audit(session, {
      actorType: 'system',
      action: 'payment.receipt.link',
      targetType: 'payment',
      targetId: payment._id.toHexString(),
      operationKey: `receipt-link:${row._id}`,
      afterDigest: receipt.evidenceDigest,
      occurredAt: now,
    })
  }
  return {
    async process(claim: PaymentCallbackClaim): Promise<'committed' | 'retry'> {
      assertOutsideTransaction()
      const verified = await verifier.verify(claim)
      if (verified.kind === 'uncertain') return 'retry'
      const now = clock()
      if (!Number.isFinite(now.getTime())) return 'retry'
      // Fresh verification happens outside all transaction retries. Unique-key contention retries
      // only local durable processing; never repeats a charge or provider request.
      for (let pass = 0; pass < 3; pass++) {
        try {
          await verifyPaymentRecordPersistence(connection)
          await verifyPaymentInitiationPersistence(connection)
          await inTransaction(connection, async (session) => {
            if (verified.kind === 'receipts') {
              for (const receipt of verified.receipts) await applyReceipt(session, receipt, now)
              return
            }
            const attempt = await attempts
              .findOne({
                _id: verified.mapping.attemptId,
                orderId: verified.mapping.orderId,
                paymentId: verified.mapping.paymentId,
              })
              .session(session)
            const operation = await initiations
              .findOne({
                attemptId: verified.mapping.attemptId,
                merchantAccountKey: verified.merchantAccountKey,
                orderId: verified.mapping.orderId,
              })
              .session(session)
            if (!attempt || !operation) throw new ApiError('STATE_CONFLICT')
            const payment = await payments.findById(attempt.paymentId).session(session)
            if (!payment || payment.revision >= Number.MAX_SAFE_INTEGER)
              throw new ApiError('STATE_CONFLICT')
            // Serialize with funding/expiry; never release any allocation on a failure message.
            await payments.updateOne(
              { _id: payment._id, revision: payment.revision },
              { $inc: { revision: 1 } },
              { session },
            )
            if (
              attempt.state === 'verified_paid' ||
              ['verified_failed', 'verified_cancelled'].includes(attempt.state)
            )
              return
            await attempts.updateOne(
              { _id: attempt._id, state: attempt.state },
              {
                $set: {
                  state: verified.status === 'CANCELLED' ? 'verified_cancelled' : 'verified_failed',
                  lastCheckedAt: now,
                  verification: {
                    verifiedAt: now,
                    verifiedStatus: verified.status,
                    merchantIdMatch: true,
                    amountMatch: false,
                    currencyMatch: true,
                    referenceMatch: true,
                    rawRecordDigest: verified.evidenceDigest,
                  },
                },
              },
              { session },
            )
            await audit(session, {
              actorType: 'system',
              action: 'payment.attempt.nonpayment',
              targetType: 'payment_attempt',
              targetId: attempt._id.toHexString(),
              operationKey: `nonpayment:${attempt._id}`,
              afterDigest: verified.evidenceDigest,
              occurredAt: now,
            })
          })
          if (verified.kind === 'receipts') {
            for (const paymentId of new Set(
              verified.receipts.flatMap((receipt) =>
                receipt.mapping && receipt.referenceMatch ? [receipt.mapping.paymentId] : [],
              ),
            )) {
              try {
                await settlement.recover(paymentId)
              } catch {
                /* Receipt remains durably Paid/on hold; capacity retry never reverses funds. */
              }
            }
          }
          return 'committed'
        } catch (error) {
          if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
            return 'retry'
        }
      }
      return 'retry'
    },
  }
}
