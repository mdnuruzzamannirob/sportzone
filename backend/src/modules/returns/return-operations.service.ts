import type { returnLifecycleService } from './return-lifecycle.service.js'
import type { returnPhysicalService } from './return-physical.service.js'
import { claimText } from './return.schema.js'
import { createHash } from 'node:crypto'
import { Types, type Connection } from 'mongoose'
import { z } from 'zod'
import type {
  orderScopeAccess,
  PaymentInitiationCredentials,
} from '../auth/checkout-access.service.js'
import type {
  claimEligibilitySnapshotAccess,
  claimQuantityAccess,
} from '../orders/order.service.js'
import type { MediaService } from '../media/media.service.js'
import type { MediaFile } from '../media/media.types.js'
import type { returnEligibilityService } from './return-eligibility.service.js'
import type { returnHistoryService } from './return-history.service.js'
import { returnService } from './return.service.js'
import { returnModel } from './return.model.js'
import { claimCommand, claimId } from './return.schema.js'
import { auditOperationReader } from '../audit/audit.service.js'
import { paymentInitiationKey } from '../payments/payment-initiation.schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
export function returnOperationsService(
  connection: Connection,
  dependencies: {
    scope: ReturnType<typeof orderScopeAccess>
    order: ReturnType<typeof claimEligibilitySnapshotAccess>
    quantities: ReturnType<typeof claimQuantityAccess>
    eligibility: ReturnType<typeof returnEligibilityService>
    history: ReturnType<typeof returnHistoryService>
    administration?: {
      lifecycle: ReturnType<typeof returnLifecycleService>
      physical: ReturnType<typeof returnPhysicalService>
    }
    policyVersion: string
    media?: (
      credentials: PaymentInitiationCredentials,
      orderId: string,
      mutating?: boolean,
    ) => MediaService
  },
  clock: () => Date = () => new Date(),
) {
  const lookup = auditOperationReader(connection),
    model = returnModel(connection)
  return {
    async review(token: string | undefined, id: string, raw: unknown, rawKey: unknown) {
      if (!dependencies.administration) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(
        z
          .strictObject({
            decision: z.enum(['approve', 'reject']),
            approvedItems: z
              .array(z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) }))
              .min(1)
              .max(50)
              .refine(
                (items) => new Set(items.map((item) => item.orderItemId)).size === items.length,
              )
              .optional(),
            reason: claimText,
          })
          .refine((input) => (input.decision === 'approve') === Boolean(input.approvedItems)),
        raw,
      )
      const key = parseInput(paymentInitiationKey, rawKey),
        current = await dependencies.history.adminDetail(token, id)
      if (current.status === 'requested') {
        try {
          await dependencies.administration.lifecycle.transition(
            token,
            id,
            { to: 'under_review', reason: input.reason },
            hash(`review:${key}`),
          )
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error
          const latest = await dependencies.history.adminDetail(token, id)
          if (!['under_review', 'approved', 'rejected'].includes(latest.status)) throw error
        }
      }
      await dependencies.administration.lifecycle.transition(
        token,
        id,
        {
          to: input.decision === 'approve' ? 'approved' : 'rejected',
          ...(input.approvedItems ? { approvedItems: input.approvedItems } : {}),
          reason: input.reason,
        },
        key,
      )
      return dependencies.history.adminDetail(token, id)
    },
    async receive(token: string | undefined, id: string, raw: unknown, rawKey: unknown) {
      if (!dependencies.administration) throw new ApiError('SERVICE_UNAVAILABLE')
      const input = parseInput(
        z.strictObject({
          receivedItems: z
            .array(z.strictObject({ orderItemId: claimId, quantity: z.int().min(0).max(50) }))
            .min(1)
            .max(50),
          receiptReference: claimText,
          notes: claimText.optional(),
        }),
        raw,
      )
      const key = parseInput(paymentInitiationKey, rawKey),
        current = await dependencies.history.adminDetail(token, id)
      if (current.status === 'approved') {
        try {
          await dependencies.administration.lifecycle.transition(
            token,
            id,
            { to: 'awaiting_return', reason: 'Approved physical receipt' },
            hash(`await:${key}`),
          )
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'STATE_CONFLICT') throw error
          const latest = await dependencies.history.adminDetail(token, id)
          if (!['awaiting_return', 'received', 'inspected', 'completed'].includes(latest.status))
            throw error
        }
      }
      await dependencies.administration.physical.receive(
        token,
        id,
        {
          items: input.receivedItems,
          receiptReference: input.receiptReference,
          reason: input.notes ?? 'Physical receipt recorded',
        },
        key,
      )
      return dependencies.history.adminDetail(token, id)
    },
    async authorize(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const orderId = parseInput(claimId, rawId)
      await dependencies.scope.owned(
        credentials,
        orderId,
        (principal, session) => dependencies.order(session, orderId, principal),
        true,
      )
    },
    async eligibility(credentials: PaymentInitiationCredentials, rawId: unknown) {
      const orderId = parseInput(claimId, rawId)
      return dependencies.scope.owned(credentials, orderId, async (principal, session) => {
        const facts = await dependencies.order(session, orderId, principal)
        const eligibleTypes: string[] = []
        let policyVersion = dependencies.policyVersion,
          requestDeadlineAt: string | undefined
        const item = facts.items.find((item) => item.claimableQty > 0)
        const reasons: { claimType: string; code: string }[] = []
        if (item)
          for (const claimType of ['physical_return', 'shortage'] as const) {
            try {
              const authority = await dependencies.eligibility(session, principal, {
                claimId: new Types.ObjectId().toHexString(),
                orderId,
                claimType,
                items: [
                  { orderItemId: item.orderItemId, quantity: 1, reason: 'Eligibility evaluation' },
                ],
              })
              eligibleTypes.push(claimType)
              policyVersion = authority.eligibilitySnapshot.policyVersion
              if (authority.eligibilitySnapshot.requestDeadlineAt)
                requestDeadlineAt = authority.eligibilitySnapshot.requestDeadlineAt.toISOString()
            } catch (error) {
              if (!(error instanceof ApiError) || error.code !== 'BUSINESS_RULE_VIOLATION')
                throw error
              reasons.push({ claimType, code: error.details?.[0]?.code ?? 'NOT_ELIGIBLE' })
            }
          }
        return {
          items: facts.items,
          eligibleTypes,
          ...(policyVersion ? { policyVersion } : {}),
          ...(requestDeadlineAt ? { requestDeadlineAt } : {}),
          reasons,
        }
      })
    },
    async submit(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      raw: unknown,
      key: unknown,
    ) {
      const orderId = parseInput(claimId, rawId),
        input = parseInput(claimCommand.omit({ claimId: true, orderId: true }), raw)
      const requestKey = parseInput(paymentInitiationKey, key)
      const id = await dependencies.scope.owned(
        credentials,
        orderId,
        async (principal, session) => {
          await dependencies.order(session, orderId, principal)
          const scopeKey = principal.kind === 'customer' ? principal.userId : principal.orderId
          const claimId = hash(
            `claim:${orderId}:${principal.kind}:${scopeKey}:${requestKey}`,
          ).slice(0, 24)
          const command = claimCommand.parse({ claimId, orderId, ...input })
          const old = await model.findById(claimId).session(session)
          if (old) {
            const prior = await lookup(session, {
              action: 'claim.request.create',
              targetType: 'return_request',
              targetId: claimId,
              operationKey: `claim:${claimId}`,
            })
            if (!prior || prior.afterDigest !== hash(JSON.stringify(command)))
              throw new ApiError('IDEMPOTENCY_CONFLICT')
            return claimId
          }
          const media = dependencies.media?.(credentials, orderId, true)
          const service = returnService(
            connection,
            dependencies.quantities,
            (session, command) => dependencies.eligibility(session, principal, command),
            clock,
            media ? { attach: media.attach } : undefined,
          )
          await service.create(session, command)
          return claimId
        },
        true,
      )
      return dependencies.history.detail(credentials, id)
    },
    async upload(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      raw: unknown,
      file: MediaFile,
    ) {
      const orderId = parseInput(claimId, rawId),
        scope = parseInput(
          z.strictObject({
            claimType: claimCommand.shape.claimType,
            orderItemIds: z
              .array(claimId)
              .min(1)
              .max(40)
              .refine((ids) => new Set(ids).size === ids.length),
          }),
          raw,
        )
      await dependencies.scope.owned(
        credentials,
        orderId,
        async (principal, session) => {
          const facts = await dependencies.order(session, orderId, principal)
          if (
            scope.orderItemIds.some(
              (id) => !facts.items.some((item) => item.orderItemId === id && item.claimableQty > 0),
            )
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          await dependencies.eligibility(session, principal, {
            claimId: new Types.ObjectId().toHexString(),
            orderId,
            claimType: scope.claimType,
            items: scope.orderItemIds.map((orderItemId) => ({
              orderItemId,
              quantity: 1,
              reason: 'Evidence upload',
            })),
          })
        },
        true,
      )
      if (!dependencies.media) throw new ApiError('SERVICE_UNAVAILABLE')
      const result = await dependencies.media(credentials, orderId, true).uploadEvidence(
        undefined,
        {
          orderId: new Types.ObjectId(orderId),
          claimType: scope.claimType,
          orderItemIds: scope.orderItemIds.map((id) => new Types.ObjectId(id)),
        },
        file,
      )
      if (!('status' in result) || result.status !== 'private' || result.orderId !== orderId)
        throw new ApiError('SERVICE_UNAVAILABLE')
      return {
        assetId: parseInput(claimId, result.assetId),
        orderId,
        status: 'private' as const,
        ...(result.expiresAt ? { expiresAt: result.expiresAt.toISOString() } : {}),
      }
    },
    async privateEvidence(
      credentials: PaymentInitiationCredentials,
      rawId: unknown,
      rawAsset: unknown,
    ) {
      const orderId = parseInput(claimId, rawId),
        assetId = parseInput(claimId, rawAsset)
      await dependencies.scope.owned(credentials, orderId, (principal, session) =>
        dependencies.order(session, orderId, principal),
      )
      if (!dependencies.media) throw new ApiError('SERVICE_UNAVAILABLE')
      return dependencies.media(credentials, orderId).privateUrl(undefined, assetId)
    },
  }
}
