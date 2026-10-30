import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import type { codCollectionOrderAccess } from '../orders/order.service.js'
import { createAuditWriter, auditOperationReader } from '../audit/audit.service.js'
import { correctionObligationService } from '../refunds/correction-obligation.service.js'
import { paymentModel } from './payment.model.js'
import { collectionAmounts, paymentRecordModels } from './payment-record.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { paymentInitiationKey } from './payment-initiation.schema.js'
import {
  codCollectionInput,
  codCollectionProof,
  codCollectionSummary,
} from './cod-collection.schema.js'
import { orderId } from '../orders/order.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
const hash = (v: string) => createHash('sha256').update(v).digest('hex')
// A protected evidence authority, never a client assertion. No default adapter or public activation.
export function codCollectionService(
  connection: Connection,
  admin: AdminAccountAccess,
  orders: ReturnType<typeof codCollectionOrderAccess>,
  evidence?: (
    input: ReturnType<typeof codCollectionInput.parse> & { paymentId: string },
  ) => Promise<unknown>,
  clock: () => Date = () => new Date(),
) {
  const payments = paymentModel(connection),
    { collections } = paymentRecordModels(connection),
    audit = createAuditWriter(connection),
    lookup = auditOperationReader(connection),
    correction = correctionObligationService(connection)
  async function ready() {
    try {
      await verifyPaymentRecordPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    async collect(token: string | undefined, rawId: unknown, raw: unknown, key: unknown) {
      assertOutsideTransaction()
      const paymentId = parseInput(orderId, rawId),
        input = parseInput(codCollectionInput, raw),
        operationKey = hash(`cod:${paymentId}:${parseInput(paymentInitiationKey, key)}`),
        digest = hash(JSON.stringify(input)),
        ref = `cod:${hash(input.collectionReference)}`
      const cause = {
        action: 'payment.cod.collection',
        targetType: 'payment',
        targetId: paymentId,
        operationKey,
      }
      const read = async (token: string | undefined) =>
        admin.owned(
          token,
          async (_actor, session) => {
            await ready()
            const payment = await payments.findById(paymentId).session(session)
            if (!payment) throw new ApiError('NOT_FOUND')
            if (payment.method !== 'cod') throw new ApiError('STATE_CONFLICT')
            const previous = await lookup(session, cause)
            if (!previous) return undefined
            if (previous.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            const row = await collections
              .findOne({
                paymentId,
                provider: 'cod_manual',
                merchantAccountKey: 'internal',
                providerCollectionRef: ref,
              })
              .session(session)
            if (!row) throw new ApiError('STATE_CONFLICT')
            return codCollectionSummary.parse({
              id: row._id.toHexString(),
              paymentId,
              orderId: row.orderId.toHexString(),
              provider: 'cod_manual',
              amountPoisha: row.amountPoisha,
              currency: 'BDT',
              collectedAt: row.collectedAt.toISOString(),
            })
          },
          false,
        )
      const previous = await read(token)
      if (previous) return previous
      // Authorization occurs before evidence access; binding is rechecked in the committing transaction.
      if (!evidence) throw new ApiError('SERVICE_UNAVAILABLE')
      const proof = parseInput(codCollectionProof, await evidence({ ...input, paymentId }))
      if (
        proof.paymentId !== paymentId ||
        proof.amountPoisha !== input.amountPoisha ||
        proof.collectionReference !== input.collectionReference ||
        proof.evidenceRef !== input.evidenceRef
      )
        throw new ApiError('BUSINESS_RULE_VIOLATION')
      const run = () =>
        admin.owned(token, async (actorId, session) => {
          await ready()
          const payment = await payments.findById(paymentId).session(session)
          if (!payment) throw new ApiError('NOT_FOUND')
          const old = await lookup(session, cause)
          if (old) {
            if (old.afterDigest !== digest) throw new ApiError('IDEMPOTENCY_CONFLICT')
            return
          }
          if (payment.method !== 'cod' || payment.revision >= Number.MAX_SAFE_INTEGER)
            throw new ApiError('STATE_CONFLICT')
          const order = await orders(session, payment.orderId.toHexString()),
            now = clock()
          if (
            payment.expectedPoisha !== order.expectedPoisha ||
            !Number.isFinite(now.getTime()) ||
            proof.collectedAt > now ||
            proof.collectedAt < order.placedAt
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          let row = await collections
            .findOne({
              provider: 'cod_manual',
              merchantAccountKey: 'internal',
              providerCollectionRef: ref,
            })
            .session(session)
          if (row) {
            if (
              !row.paymentId.equals(payment._id) ||
              row.amountPoisha !== proof.amountPoisha ||
              row.evidenceDigest !== proof.digest ||
              row.collectedAt.getTime() !== proof.collectedAt.getTime()
            )
              throw new ApiError('STATE_CONFLICT')
          } else {
            const merchandise = order.cancelled
                ? 0
                : Math.min(
                    proof.amountPoisha,
                    Math.max(0, payment.expectedPoisha - payment.merchandiseFundedPoisha),
                  ),
              excess = proof.amountPoisha - merchandise
            if (
              !Number.isSafeInteger(payment.verifiedCollectedPoisha + proof.amountPoisha) ||
              !Number.isSafeInteger(payment.correctionCollectedPoisha + excess)
            )
              throw new ApiError('STATE_CONFLICT')
            row = new collections({
              paymentId: payment._id,
              orderId: payment.orderId,
              provider: 'cod_manual',
              merchantAccountKey: 'internal',
              providerCollectionRef: ref,
              amountPoisha: proof.amountPoisha,
              currency: 'BDT',
              collectedAt: proof.collectedAt,
              verifiedAt: now,
              evidenceDigest: proof.digest,
              verifiedBy: { type: 'admin', actorId: new Types.ObjectId(actorId) },
              ...Object.fromEntries(collectionAmounts.map((n) => [n, 0])),
              merchandiseAllocatedPoisha: merchandise,
              correctionAllocatedPoisha: excess,
              revision: 0,
            })
            await row.save({ session })
            const funded = payment.merchandiseFundedPoisha + merchandise,
              status = ['partially_refunded', 'refunded'].includes(payment.paymentStatus)
                ? payment.paymentStatus
                : funded === payment.expectedPoisha || order.cancelled
                  ? 'paid'
                  : 'pending'
            const changed = await payments.updateOne(
              { _id: payment._id, revision: payment.revision },
              {
                $inc: {
                  verifiedCollectedPoisha: proof.amountPoisha,
                  merchandiseFundedPoisha: merchandise,
                  correctionCollectedPoisha: excess,
                  revision: 1,
                },
                $set: { paymentStatus: status },
              },
              { session },
            )
            if (changed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
            if (excess)
              await correction.create(session, {
                orderId: payment.orderId.toHexString(),
                paymentId,
                sourceCollectionId: row._id.toHexString(),
                amountPoisha: excess,
                decisionKey: hash(`cod-correction:${row._id}`),
              })
          }
          await audit(session, {
            ...cause,
            actorType: 'admin',
            actorId,
            afterDigest: digest,
            reason: input.reason,
            occurredAt: now,
          })
        })
      try {
        await run()
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000))
          throw error
        await run()
      }
      const result = await read(token)
      if (!result) throw new ApiError('STATE_CONFLICT')
      return result
    },
  }
}
