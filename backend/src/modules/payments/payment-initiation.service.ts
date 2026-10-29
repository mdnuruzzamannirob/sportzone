import { paymentModel } from './payment.model.js'
import { verifyPaymentRecordPersistence } from './payment-record.persistence.js'
import { createHash } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { inTransaction, assertOutsideTransaction } from '../../shared/database/transaction.js'
import { createAuditWriter } from '../audit/audit.service.js'
import { paymentAttemptService, type PaymentAttemptAccess } from './payment-attempt.service.js'
import { paymentRecordModels } from './payment-record.model.js'
import { paymentInitiationModel } from './payment-initiation.model.js'
import { verifyPaymentInitiationPersistence } from './payment-initiation.persistence.js'
import {
  paymentInitiationInput,
  paymentInitiationKey,
  paymentInitiationResult,
} from './payment-initiation.schema.js'
import type { createSslcommerzAdapter } from '../../providers/sslcommerz/sslcommerz.client.js'
import type { initiationInput } from '../../providers/sslcommerz/sslcommerz.schema.js'

const hash = (value: string) => createHash('sha256').update(value).digest('hex')
type GatewayInput = z.output<typeof initiationInput>
type Gateway = Pick<ReturnType<typeof createSslcommerzAdapter>, 'initiate'>
export type PaymentInitiationAccess<Credentials> = Omit<PaymentAttemptAccess, 'authorize'> & {
  authorize(session: ClientSession, orderId: string): Promise<number>
  // Must authenticate + fence current principal, including CSRF for browser mutations. Scope stays
  // stable across session rotation (customer identity or proven guest-order identity, never email).
  owned<T>(
    credentials: Credentials,
    orderId: string,
    work: (scopeKeyHash: string, session: ClientSession) => Promise<T>,
    mutating?: boolean,
  ): Promise<T>
  // Trusted order mapper: existing immutable order facts only, no fabricated postcode/contact data.
  metadata(
    session: ClientSession,
    orderId: string,
  ): Promise<Omit<GatewayInput, 'tranId' | 'amountPoisha' | 'gatewayKey'>>
  channel(
    session: ClientSession,
    channel: string,
    amountPoisha: number,
  ): Promise<{
    gatewayKey: string
    merchantAccountKey: string
    validUntil: Date
  }>
  // Independently fence the order/payment and mark a durable allocation_shortfall. Must refuse
  // an intervening live/uncertain attempt and must not release its allocations.
  shortfall(session: ClientSession, orderId: string): Promise<void>
  redirectAllowed(session: ClientSession, orderId: string): Promise<boolean>
}
// No default adapter/authority: public integration is forbidden until these production capabilities exist.
export function paymentInitiationService<Credentials>(
  connection: Connection,
  access: PaymentInitiationAccess<Credentials>,
  gateway: Gateway,
  validateRequest: (request: unknown) => boolean,
  clock: () => Date = () => new Date(),
) {
  const operations = paymentInitiationModel(connection),
    { attempts } = paymentRecordModels(connection),
    prepare = paymentAttemptService(
      connection,
      {
        ...access,
        authorize: async (session, orderId) => {
          const expected = await access.authorize(session, orderId),
            current = await paymentModel(connection).findOne({ orderId }).session(session)
          if (
            !Number.isSafeInteger(expected) ||
            expected < 0 ||
            !current ||
            current.expectedPoisha !== expected ||
            current.currency !== 'BDT'
          )
            throw new ApiError('STATE_CONFLICT')
        },
      },
      clock,
    ),
    audit = createAuditWriter(connection)
  type Operation = InstanceType<typeof operations>
  async function readiness() {
    try {
      await verifyPaymentInitiationPersistence(connection)
      await verifyPaymentRecordPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function view(row: Operation, session: ClientSession) {
    if (row.status === 'allocation_shortfall')
      return parseInput(paymentInitiationResult, { state: 'allocation_shortfall' })
    if (!row.attemptId) throw new ApiError('STATE_CONFLICT')
    const attempt = await attempts
      .findOne({ _id: row.attemptId, orderId: row.orderId })
      .session(session)
    if (!attempt) throw new ApiError('STATE_CONFLICT')
    const payment = await paymentModel(connection)
      .findOne({ _id: attempt.paymentId, orderId: row.orderId })
      .session(session)
    if (!payment) throw new ApiError('STATE_CONFLICT')
    let redirectAllowed = false
    if (
      row.status === 'accepted' &&
      attempt.state === 'initiated' &&
      attempt.expiresAt &&
      attempt.expiresAt > clock() &&
      payment.riskStatus === 'clear' &&
      ['pending', 'failed'].includes(payment.paymentStatus) &&
      payment.unassignedCollectedPoisha === 0 &&
      payment.expectedPoisha - payment.merchandiseFundedPoisha === attempt.expectedAmountPoisha &&
      attempt.requestedChannel &&
      (await access.redirectAllowed(session, row.orderId.toHexString()))
    ) {
      try {
        const channel = await access.channel(
          session,
          attempt.requestedChannel,
          attempt.expectedAmountPoisha,
        )
        redirectAllowed =
          channel.merchantAccountKey === row.merchantAccountKey &&
          channel.gatewayKey === row.gatewayKey &&
          channel.validUntil > clock()
      } catch (error) {
        if (
          !(error instanceof ApiError) ||
          !['BUSINESS_RULE_VIOLATION', 'PAYMENT_AMOUNT_UNSUPPORTED'].includes(error.code)
        )
          throw error
      }
    }
    return parseInput(paymentInitiationResult, {
      attemptId: attempt._id.toHexString(),
      state: attempt.state,
      expectedAmountPoisha: attempt.expectedAmountPoisha,
      ...(attempt.expiresAt ? { expiresAt: attempt.expiresAt.toISOString() } : {}),
      ...(redirectAllowed ? { redirectUrl: row.redirectUrl } : {}),
    })
  }
  async function resolve(
    credentials: Credentials,
    orderId: string,
    keyHash: string,
    fingerprint: string,
  ) {
    return access.owned(credentials, orderId, async (scope, session) => {
      parseInput(z.string().regex(/^[a-f0-9]{64}$/), scope)
      await readiness()
      const operation = await operations
        .findOne({ orderId, scopeKeyHash: scope, idempotencyKeyHash: keyHash })
        .session(session)
      if (!operation) throw new ApiError('STATE_CONFLICT')
      if (operation.requestFingerprint !== fingerprint) throw new ApiError('IDEMPOTENCY_CONFLICT')
      return view(operation, session)
    })
  }
  return {
    async read(credentials: Credentials, rawOrderId: unknown, rawAttemptId: unknown) {
      const orderId = parseInput(z.string().regex(/^[a-f0-9]{24}$/), rawOrderId),
        attemptId = parseInput(z.string().regex(/^[a-f0-9]{24}$/), rawAttemptId)
      return access.owned(
        credentials,
        orderId,
        async (_scope, session) => {
          await readiness()
          const attempt = await attempts.findOne({ _id: attemptId, orderId }).session(session)
          if (!attempt) throw new ApiError('NOT_FOUND')
          const payment = await paymentModel(connection)
            .findOne({ _id: attempt.paymentId, orderId })
            .session(session)
          if (!payment) throw new ApiError('STATE_CONFLICT')
          return {
            id: attemptId,
            state: attempt.state,
            riskStatus: payment.riskStatus,
            ...(attempt.lastCheckedAt
              ? { lastCheckedAt: attempt.lastCheckedAt.toISOString() }
              : {}),
          }
        },
        false,
      )
    },
    async initiate(credentials: Credentials, rawOrderId: unknown, raw: unknown, key: unknown) {
      assertOutsideTransaction()
      const orderId = parseInput(z.string().regex(/^[a-f0-9]{24}$/), rawOrderId),
        input = parseInput(paymentInitiationInput, raw),
        keyHash = hash(parseInput(paymentInitiationKey, key)),
        fingerprint = hash(JSON.stringify(input))
      let dispatch:
        | {
            operationId: Types.ObjectId
            request: GatewayInput
            merchantAccountKey: string
            validUntil: Date
            expiresAt: Date
          }
        | undefined
      for (let retry = 0; retry < 2; retry++) {
        try {
          const outcome = await access.owned(
            credentials,
            orderId,
            async (scopeKeyHash, session) => {
              if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
              parseInput(z.string().regex(/^[a-f0-9]{64}$/), scopeKeyHash)
              await readiness()
              const binding = {
                orderId: new Types.ObjectId(orderId),
                scopeKeyHash,
                idempotencyKeyHash: keyHash,
              }
              const existing = await operations.findOne(binding).session(session)
              if (existing) {
                if (existing.requestFingerprint !== fingerprint)
                  throw new ApiError('IDEMPOTENCY_CONFLICT')
                return { result: await view(existing, session) }
              }
              const history = await attempts.find({ orderId }).session(session)
              const parents = new Set(
                  history.flatMap((row) =>
                    row.retryOfAttemptId ? [row.retryOfAttemptId.toHexString()] : [],
                  ),
                ),
                leaves = history.filter((row) => !parents.has(row._id.toHexString()))
              if (history.length && leaves.length !== 1) throw new ApiError('STATE_CONFLICT')
              const previous = leaves[0]
              const attempt = await prepare.prepare(session, {
                attemptId: new Types.ObjectId().toHexString(),
                orderId,
                requestedChannel: input.requestedChannel,
                ...(previous ? { retryOfAttemptId: previous._id.toHexString() } : {}),
              })
              const capability = await access.channel(
                  session,
                  input.requestedChannel,
                  attempt.expectedAmountPoisha,
                ),
                metadata = await access.metadata(session, orderId),
                now = clock()
              const request: GatewayInput = {
                ...metadata,
                tranId: attempt.tranId,
                amountPoisha: attempt.expectedAmountPoisha,
                gatewayKey: capability.gatewayKey,
              }
              if (!validateRequest(request)) throw new ApiError('BUSINESS_RULE_VIOLATION')
              if (
                !/^[a-f0-9]{64}$/.test(capability.merchantAccountKey) ||
                !Number.isFinite(capability.validUntil.getTime()) ||
                capability.validUntil <= now ||
                !attempt.expiresAt ||
                new Date(attempt.expiresAt) <= now
              )
                throw new ApiError('STATE_CONFLICT')
              const [operation] = await operations.create(
                [
                  {
                    ...binding,
                    requestFingerprint: fingerprint,
                    merchantAccountKey: capability.merchantAccountKey,
                    gatewayKey: capability.gatewayKey,
                    attemptId: new Types.ObjectId(attempt.id),
                    status: 'dispatching',
                  },
                ],
                { session },
              )
              if (!operation) throw new ApiError('STATE_CONFLICT')
              const fenced = await attempts.updateOne(
                { _id: attempt.id, state: 'created' },
                { $set: { state: 'uncertain', initiatedAt: now } },
                { session },
              )
              if (fenced.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
              await audit(session, {
                actorType: 'system',
                action: 'payment.initiation.dispatch',
                targetType: 'payment_attempt',
                targetId: attempt.id,
                operationKey: `payment-initiation:${operation._id}`,
                occurredAt: now,
              })
              return {
                dispatch: {
                  operationId: operation._id,
                  request,
                  merchantAccountKey: capability.merchantAccountKey,
                  validUntil: capability.validUntil,
                  expiresAt: new Date(attempt.expiresAt),
                },
              }
            },
          )
          if ('result' in outcome) return outcome.result
          dispatch = outcome.dispatch
          break
        } catch (error) {
          if (
            retry === 0 &&
            error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === 11000
          )
            continue
          if (
            error instanceof ApiError &&
            ['OUT_OF_STOCK', 'COUPON_UNAVAILABLE'].includes(error.code)
          ) {
            // The failed allocation transaction has fully aborted before this durable outcome is written.
            return access
              .owned(credentials, orderId, async (scopeKeyHash, session) => {
                await readiness()
                const binding = {
                  orderId: new Types.ObjectId(orderId),
                  scopeKeyHash,
                  idempotencyKeyHash: keyHash,
                }
                const existing = await operations.findOne(binding).session(session)
                if (existing) {
                  if (existing.requestFingerprint !== fingerprint)
                    throw new ApiError('IDEMPOTENCY_CONFLICT')
                  return view(existing, session)
                }
                await access.shortfall(session, orderId)
                const [operation] = await operations.create(
                  [{ ...binding, requestFingerprint: fingerprint, status: 'allocation_shortfall' }],
                  { session },
                )
                if (!operation) throw new ApiError('STATE_CONFLICT')
                await audit(session, {
                  actorType: 'system',
                  action: 'payment.initiation.shortfall',
                  targetType: 'order',
                  targetId: orderId,
                  operationKey: `payment-initiation:${operation._id}`,
                  occurredAt: clock(),
                })
                return view(operation, session)
              })
              .catch((failure: unknown) => {
                if (
                  failure &&
                  typeof failure === 'object' &&
                  'code' in failure &&
                  failure.code === 11000
                )
                  return resolve(credentials, orderId, keyHash, fingerprint)
                throw failure
              })
          }
          throw error
        }
      }
      if (!dispatch) throw new ApiError('STATE_CONFLICT')
      // Every external effect is after the successful transaction, never within a retryable callback.
      let response: Awaited<ReturnType<Gateway['initiate']>> = {
        kind: 'uncertain',
        code: 'PROVIDER_UNCERTAIN',
      }
      if (dispatch.expiresAt > clock() && dispatch.validUntil > clock()) {
        try {
          response = await gateway.initiate(dispatch.request)
        } catch {
          /* Preserve uncertain; never resend. */
        }
      }
      const approved =
        response.kind === 'accepted' && response.merchantAccountKey === dispatch.merchantAccountKey
      // Completion does not require a still-live browser session; it records an already authorized external effect.
      // If this transaction fails, the committed dispatch/uncertain attempt remains; replay never repeats the call.
      await inTransaction(connection, async (session) => {
        await readiness()
        const operation = await operations
          .findOne({ _id: dispatch.operationId, status: 'dispatching' })
          .session(session)
        if (!operation?.attemptId) throw new ApiError('STATE_CONFLICT')
        const recorded = await operations.updateOne(
          { _id: operation._id, status: 'dispatching' },
          {
            $set: {
              status: approved
                ? 'accepted'
                : response.kind === 'rejected'
                  ? 'rejected'
                  : 'uncertain',
              ...(approved && response.kind === 'accepted'
                ? { redirectUrl: response.redirectUrl }
                : {}),
            },
          },
          { session },
        )
        if (recorded.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
        await attempts.updateOne(
          { _id: operation.attemptId, state: 'uncertain' },
          {
            $set: {
              ...(approved && response.kind === 'accepted'
                ? { state: 'initiated', providerSessionId: response.sessionKey }
                : {}),
              lastCheckedAt: clock(),
            },
          },
          { session },
        )
        await audit(session, {
          actorType: 'system',
          action: 'payment.initiation.result',
          targetType: 'payment_attempt',
          targetId: operation.attemptId.toHexString(),
          operationKey: `payment-initiation:${operation._id}`,
          occurredAt: clock(),
        })
      })
      return resolve(credentials, orderId, keyHash, fingerprint)
    },
  }
}
