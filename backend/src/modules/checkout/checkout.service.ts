import { createHash } from 'node:crypto'
import { type ClientSession, type Connection, Types } from 'mongoose'
import type { z } from 'zod'
import { checkoutOptions } from '../../config/checkout.js'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { AuditAccess } from '../audit/audit.public.js'
import type { CheckoutAccess, CheckoutCredentials, CheckoutPrincipal } from '../auth/auth.public.js'
import type { CatalogCheckoutAccess } from '../catalog/catalog.public.js'
import type { CheckoutDeliveryAccess } from '../delivery/delivery.public.js'
import type { InventoryAllocationFactory } from '../inventory/inventory.public.js'
import type { NotificationIntentsFactory } from '../notifications/notification.public.js'
import type {
  CheckoutOrderReader,
  DeliveryDeadlineService,
  ExpiredOrderAllocationFactory,
  InitialOrderAllocationAccess,
  OrderAllocationFactory,
  OrderCreationFactory,
  OrderCreationProofSchema,
} from '../orders/order.public.js'
import type { CheckoutPaymentAccess, PaymentEligibility } from '../payments/payment.public.js'
import type {
  CouponGenerationReader,
  CouponQuoteAccess,
  PricingCalculator,
} from '../promotions/promotion.public.js'
import type { CheckoutSettingsAccess } from '../settings/setting.public.js'
import type {
  CheckoutCommercialSnapshotSchema,
  CheckoutQuoteInputSchema,
  CheckoutQuoteSchema,
  CheckoutSubmitInputSchema,
  NormalizedCheckoutDraftSchema,
  QuoteCouponSnapshotSchema,
} from './checkout.schema.js'
import { checkoutCommercialDigest, checkoutDraftFingerprint } from './checkout-consent.policy.js'
import { checkoutIntentModel } from './checkout-intent.model.js'
import { verifyCheckoutIntentPersistence } from './checkout-intent.persistence.js'
import type {
  CheckoutOrderOutcomeSchema,
  CheckoutSubmissionFingerprint,
} from './checkout-intent.schema.js'
import { checkoutIntentScope, checkoutKeyHash } from './checkout-intent.schema.js'
import { checkoutQuoteModel } from './checkout-quote.model.js'
import { verifyCheckoutQuotePersistence } from './checkout-quote.persistence.js'

type CheckoutCompletion = {
  // Must create the order AND required allocation/payment/notification state in this transaction.
  // No provider calls. No production completion adapter is enabled by this foundation.
  complete(
    session: ClientSession,
    proof: z.output<OrderCreationProofSchema>,
    operationKey: string,
  ): Promise<void>
  // Authoritative current order projection, with order/intent/owner checks inside the order owner.
  read(
    session: ClientSession,
    principal: CheckoutPrincipal,
    orderId: string,
    intentId: string,
  ): Promise<unknown>
}

type Draft = z.output<CheckoutQuoteInputSchema>

function createCheckoutCompletionService(
  auditAccess: AuditAccess,
  moduleAccess: {
    checkoutPaymentAccess: CheckoutPaymentAccess
    createNotificationService: NotificationIntentsFactory
    createOrderAllocationService: OrderAllocationFactory
    createAllocationService: InventoryAllocationFactory
    initialOrderAllocationAccess: InitialOrderAllocationAccess
    checkoutOrderReadAccess: CheckoutOrderReader
    createOrderService: OrderCreationFactory
  },
  clock: () => Date = () => new Date(),
): CheckoutCompletion {
  const payments = moduleAccess.checkoutPaymentAccess,
    notifications = moduleAccess.createNotificationService(clock),
    allocation = moduleAccess.createOrderAllocationService(
      moduleAccess.createAllocationService(clock),
      moduleAccess.initialOrderAllocationAccess,
      clock,
    ),
    readOrder = moduleAccess.checkoutOrderReadAccess
  return {
    async complete(session, proof, operationKey) {
      await moduleAccess
        .createOrderService(
          {
            authorize: async (_session, command) => {
              if (
                command.orderId !== proof.orderId ||
                command.checkoutIntentId !== proof.checkoutIntentId
              )
                throw new ApiError('STATE_CONFLICT')
              return proof
            },
          },
          auditAccess.write,
          clock,
        )
        .create(session, {
          orderId: proof.orderId,
          checkoutIntentId: proof.checkoutIntentId,
          operationKey,
        })
      await allocation.apply(session, {
        orderId: proof.orderId,
        generation: 1,
        action: proof.snapshot.draft.method === 'cod' ? 'cod' : 'hold',
      })
      await payments.create(session, {
        orderId: proof.orderId,
        method: proof.snapshot.draft.method === 'cod' ? 'cod' : 'online',
        expectedPoisha: proof.snapshot.pricing.finalTotalPoisha,
      })
      await notifications.enqueueOrderReceived(
        {
          orderId: proof.orderId,
          ...(proof.userId ? { userId: proof.userId } : {}),
          email: proof.snapshot.draft.customer.email,
          name: proof.snapshot.draft.customer.name,
        },
        session,
      )
    },
    async read(session, principal, orderId, intentId) {
      const order = await readOrder(session, principal, orderId, intentId),
        payment = await payments.read(session, orderId)
      if (payment.expectedPoisha !== order.finalTotalPoisha || payment.currency !== order.currency)
        throw new ApiError('STATE_CONFLICT')
      return { ...order, paymentStatus: payment.paymentStatus }
    },
  }
}

function createCheckoutExpiryService(
  auditAccess: AuditAccess,
  moduleAccess: {
    createAllocationService: InventoryAllocationFactory
    couponGenerationAccess: CouponGenerationReader
    expiredOrderAllocationAccess: ExpiredOrderAllocationFactory
    checkoutPaymentAccess: CheckoutPaymentAccess
    createOrderAllocationService: OrderAllocationFactory
  },
  clock: () => Date = () => new Date(),
) {
  const stock = moduleAccess.createAllocationService(clock),
    coupon = moduleAccess.couponGenerationAccess,
    audit = auditAccess.write
  return {
    due: stock.due,
    async expire(session: ClientSession, orderId: string, generation: number) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const rows = await stock.generation(session, orderId, generation),
        now = clock(),
        first = rows[0]
      if (!first || rows.every((row) => row.status === 'released')) return false
      if (
        !first.heldAt ||
        !first.expiresAt ||
        first.expiresAt > now ||
        rows.some(
          (row) =>
            row.status !== 'held' ||
            row.heldAt?.getTime() !== first.heldAt?.getTime() ||
            row.expiresAt?.getTime() !== first.expiresAt?.getTime(),
        )
      )
        throw new ApiError('STATE_CONFLICT')
      const redemption = await coupon(session, orderId, generation)
      if (
        redemption &&
        (redemption.status !== 'held' ||
          redemption.heldAt?.getTime() !== first.heldAt.getTime() ||
          redemption.expiresAt?.getTime() !== first.expiresAt.getTime())
      )
        throw new ApiError('STATE_CONFLICT')
      const orderAccess = moduleAccess.expiredOrderAllocationAccess(
        moduleAccess.checkoutPaymentAccess.authorizeHoldExpiry,
      )
      const allocations = moduleAccess.createOrderAllocationService(
        stock,
        {
          async authorize(transaction, id, requestedGeneration, action) {
            const data = await orderAccess.authorize(transaction, id, requestedGeneration, action)
            if (
              data.pricing.items.length !== rows.length ||
              data.pricing.items.some(
                (item) =>
                  !rows.some(
                    (row) => row.variantId === item.variantId && row.quantity === item.quantity,
                  ),
              ) ||
              Boolean(data.coupon) !== Boolean(redemption)
            )
              throw new ApiError('STATE_CONFLICT')
            return data
          },
        },
        clock,
      )
      await allocations.apply(session, { orderId, generation, action: 'release_held' })
      await audit(session, {
        actorType: 'system',
        action: 'checkout.hold.expire',
        targetType: 'order',
        targetId: orderId,
        operationKey: `hold-expiry:${orderId}:${generation}`,
        occurredAt: now,
      })
      return true
    },
  }
}

function createCheckoutIntentService(
  connection: Connection,
  access: CheckoutAccess,
  quotes: Pick<ReturnType<typeof createCheckoutQuoteService>, 'revalidate'>,
  completion: CheckoutCompletion,
  moduleAccess: {
    schemaCheckoutSubmitInput: CheckoutSubmitInputSchema
    checkoutSubmissionFingerprint: CheckoutSubmissionFingerprint
    schemaCheckoutOrderOutcome: CheckoutOrderOutcomeSchema
  },
  clock: () => Date = () => new Date(),
) {
  const intents = checkoutIntentModel(connection),
    quoteModel = checkoutQuoteModel(connection)
  async function execute(credentials: CheckoutCredentials, raw: unknown, key: unknown) {
    const input = parseInput(moduleAccess.schemaCheckoutSubmitInput, raw),
      idempotencyKeyHash = checkoutKeyHash(key),
      requestFingerprint = moduleAccess.checkoutSubmissionFingerprint(input)
    // A duplicate index race aborts its transaction. Re-enter authorization in a fresh transaction
    // to observe the winner; never continue a failed session or retry an external effect.
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await access.owned(credentials, async (principal, session) => {
          if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
          const scope = parseInput(checkoutIntentScope, {
            scopeType: principal.scopeType,
            scopeKeyHash: principal.scopeKeyHash,
          })
          try {
            await verifyCheckoutIntentPersistence(connection)
          } catch {
            throw new ApiError('SERVICE_UNAVAILABLE')
          }
          const existing = await intents.findOne({ ...scope, idempotencyKeyHash }).session(session)
          if (existing) {
            if (existing.requestFingerprint !== requestFingerprint)
              throw new ApiError('IDEMPOTENCY_CONFLICT')
            if (
              !existing.orderId ||
              !existing.resultSnapshot ||
              !existing.orderId.equals(existing.resultSnapshot.orderId) ||
              existing.status === 'preparing'
            )
              throw new ApiError('STATE_CONFLICT')
            // Expired response windows still return the current resource, never reuse the key.
            const result = parseInput(
              moduleAccess.schemaCheckoutOrderOutcome,
              await completion.read(
                session,
                principal,
                existing.orderId.toHexString(),
                existing._id.toHexString(),
              ),
            )
            if (result.id !== existing.orderId.toHexString()) throw new ApiError('STATE_CONFLICT')
            return { order: result, replayed: true }
          }
          try {
            await verifyCheckoutQuotePersistence(connection)
          } catch {
            throw new ApiError('SERVICE_UNAVAILABLE')
          }
          // Another key cannot expose/rebind the order attached to this quote.
          if (await intents.exists({ quoteId: input.quoteId }).session(session))
            throw new ApiError('STATE_CONFLICT')
          const checked = await quotes.revalidate(principal, input, session),
            intentId = new Types.ObjectId(),
            orderId = new Types.ObjectId(),
            acceptedAt = clock()
          const [intent] = await intents.create(
            [
              {
                _id: intentId,
                ...scope,
                idempotencyKeyHash,
                requestFingerprint,
                quoteId: input.quoteId,
                status: 'preparing',
              },
            ],
            { session },
          )
          if (!intent || checked.quoteId !== input.quoteId) throw new ApiError('STATE_CONFLICT')
          const consumed = await quoteModel.updateOne(
            {
              _id: input.quoteId,
              ...scope,
              status: 'open',
              expiresAt: { $gt: acceptedAt },
              commercialDigest: checked.commercialDigest,
            },
            {
              $set: {
                status: 'consumed',
                checkoutIntentId: intentId,
                orderId,
                consumedAt: acceptedAt,
              },
              $inc: { revision: 1 },
            },
            { session },
          )
          if (consumed.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          await completion.complete(
            session,
            {
              orderId: orderId.toHexString(),
              checkoutIntentId: intentId.toHexString(),
              quoteId: input.quoteId,
              userId: principal.profile?.id ?? null,
              acceptedAt: acceptedAt.toISOString(),
              commercialDigest: checked.commercialDigest,
              snapshot: checked.snapshot,
              ...(input.notes ? { notes: input.notes } : {}),
            },
            `checkout:${intentId.toHexString()}`,
          )
          const result = parseInput(
            moduleAccess.schemaCheckoutOrderOutcome,
            await completion.read(
              session,
              principal,
              orderId.toHexString(),
              intentId.toHexString(),
            ),
          )
          if (result.id !== orderId.toHexString()) throw new ApiError('STATE_CONFLICT')
          const recorded = await intents.updateOne(
            { _id: intentId, status: 'preparing' },
            {
              $set: { status: 'order_created', orderId, resultSnapshot: { orderId } },
            },
            { session, runValidators: true },
          )
          if (recorded.modifiedCount !== 1) throw new ApiError('STATE_CONFLICT')
          return { order: result, replayed: false }
        })
      } catch (error) {
        const duplicate =
          typeof error === 'object' && error !== null && 'code' in error && error.code === 11000
        if (duplicate && attempt === 0) continue
        if (duplicate) throw new ApiError('STATE_CONFLICT')
        throw error
      }
    }
    throw new ApiError('STATE_CONFLICT')
  }
  return {
    async submit(credentials: CheckoutCredentials, raw: unknown, key: unknown) {
      return (await execute(credentials, raw, key)).order
    },
    submitWithOutcome: execute,
  }
}

const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')

function createCheckoutQuoteService(
  connection: Connection,
  access: CheckoutAccess,
  dependencies: {
    catalog: CatalogCheckoutAccess
    delivery: CheckoutDeliveryAccess
    settings: CheckoutSettingsAccess
    deadline: DeliveryDeadlineService
    coupon: CouponQuoteAccess
    methods: PaymentEligibility
  },
  rawOptions: unknown,
  moduleAccess: {
    calculatePricing: PricingCalculator
    schemaCheckoutCommercialSnapshot: CheckoutCommercialSnapshotSchema
    schemaCheckoutQuote: CheckoutQuoteSchema
    schemaCheckoutQuoteInput: CheckoutQuoteInputSchema
    schemaCheckoutSubmitInput: CheckoutSubmitInputSchema
    schemaNormalizedCheckoutDraft: NormalizedCheckoutDraftSchema
  },
  clock: () => Date = () => new Date(),
) {
  const options = parseInput(checkoutOptions, rawOptions),
    model = checkoutQuoteModel(connection)
  function normalize(principal: CheckoutPrincipal, input: Draft) {
    let recipient = input.recipient
    if (input.savedAddressId) {
      if (!principal.profile) throw new ApiError('FORBIDDEN')
      const saved = principal.profile.addresses.find((row) => row.id === input.savedAddressId)
      if (!saved) throw new ApiError('NOT_FOUND')
      const { id, isDefault, ...address } = saved
      void id
      void isDefault
      recipient = address
    }
    if (!recipient || (!input.email && !principal.profile)) throw new ApiError('VALIDATION_FAILED')
    return parseInput(moduleAccess.schemaNormalizedCheckoutDraft, {
      items: [...input.items].sort((a, b) => a.variantId.localeCompare(b.variantId)),
      recipient,
      customer: {
        name: principal.profile?.name ?? recipient.recipient,
        email: input.email ?? principal.profile?.email,
        phone: input.contactPhone ?? recipient.phone,
      },
      ...(input.couponCode ? { couponCode: input.couponCode } : {}),
      method: input.method,
    })
  }
  async function build(
    principal: CheckoutPrincipal,
    draft: z.output<NormalizedCheckoutDraftSchema>,
    session: ClientSession,
    ids?: Map<string, string>,
  ) {
    const now = clock(),
      selections = await dependencies.catalog(
        draft.items.map((row) => row.variantId),
        session,
      )
    const delivery = await dependencies.delivery(
      draft.recipient.districtKey,
      draft.recipient.areaKey,
      session,
    )
    const settings = await dependencies.settings(session, now),
      deadlineBasis = dependencies.deadline.snapshotForCheckout()
    const deliveryDeadline = dependencies.deadline.project(deadlineBasis, {
      paymentMethod: draft.method === 'cod' ? 'cod' : 'online',
    })
    const lines = draft.items.map((item) => {
      const selected = selections.get(item.variantId)
      if (!selected || selected.availableQty < item.quantity) throw new ApiError('OUT_OF_STOCK')
      return {
        id: ids?.get(item.variantId) ?? new Types.ObjectId().toHexString(),
        variantId: item.variantId,
        quantity: item.quantity,
        productId: selected.product.id,
        categoryIds: selected.categoryIds,
        couponEligible: false,
        regularUnitPoisha: selected.product.regularPricePoisha,
        effectiveUnitPoisha: selected.estimatedUnitPoisha,
      }
    })
    let pricing: ReturnType<PricingCalculator>
    let coupon: z.output<QuoteCouponSnapshotSchema> | undefined
    if (draft.couponCode) {
      const quoted = await dependencies.coupon(
        draft.couponCode,
        principal.profile ? { kind: 'customer', userId: principal.profile.id } : { kind: 'guest' },
        lines,
        delivery.amountPoisha,
        session,
        now,
      )
      pricing = quoted.pricing
      coupon = {
        couponId: quoted.couponId,
        code: quoted.termsSnapshot.code,
        type: quoted.termsSnapshot.type,
        value: quoted.termsSnapshot.value,
        termsVersion: quoted.termsSnapshot.version,
        eligibleSubtotalPoisha: quoted.eligibleSubtotalPoisha,
        discountPoisha: quoted.termsSnapshot.discountPoisha,
      }
    } else
      pricing = moduleAccess.calculatePricing({
        items: lines.map(({ productId, categoryIds, ...line }) => {
          void productId
          void categoryIds
          return line
        }),
        deliveryChargePoisha: delivery.amountPoisha,
      })
    const availableMethods = await dependencies.methods(
      settings.flags,
      pricing.finalTotalPoisha,
      session,
    )
    const selectedMethod = availableMethods.find((row) => row.channel === draft.method)
    if (!selectedMethod?.eligible)
      throw new ApiError(
        selectedMethod?.reasonCode === 'PAYMENT_AMOUNT_UNSUPPORTED'
          ? 'PAYMENT_AMOUNT_UNSUPPORTED'
          : 'BUSINESS_RULE_VIOLATION',
      )
    const items = pricing.items.map((item) => {
      const selected = selections.get(item.variantId)
      if (!selected) throw new ApiError('STATE_CONFLICT')
      const { saleLinePoisha, ...line } = item
      void saleLinePoisha
      return {
        ...line,
        productId: selected.product.id,
        productName: selected.product.name,
        sku: selected.sku,
        variantAttributes: selected.attributes,
      }
    })
    const { items: pricedItems, couponEligibleSubtotalPoisha, ...totals } = pricing
    void pricedItems
    void couponEligibleSubtotalPoisha
    return parseInput(moduleAccess.schemaCheckoutCommercialSnapshot, {
      draft,
      items,
      ...(coupon ? { coupon } : {}),
      pricing: { ...totals, currency: 'BDT' },
      delivery,
      deadlineBasis,
      deliveryDeadline,
      availableMethods,
      policyVersions: settings.policyVersions,
    })
  }
  async function verify() {
    try {
      await verifyCheckoutQuotePersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    async create(credentials: CheckoutCredentials, raw: unknown) {
      const input = parseInput(moduleAccess.schemaCheckoutQuoteInput, raw)
      return access.owned(credentials, async (principal, session) => {
        await verify()
        const now = clock(),
          draft = normalize(principal, input),
          snapshot = await build(principal, draft, session)
        const expiresAt = new Date(now.getTime() + options.quoteTtlSeconds * 1000)
        const row = new model({
          scopeType: principal.scopeType,
          scopeKeyHash: principal.scopeKeyHash,
          requestFingerprint: checkoutDraftFingerprint(draft, moduleAccess),
          commercialSnapshot: snapshot,
          commercialDigest: checkoutCommercialDigest(snapshot, moduleAccess),
          quotedAt: now,
          expiresAt,
        })
        await row.save({ session })
        return parseInput(moduleAccess.schemaCheckoutQuote, {
          ...snapshot.pricing,
          quoteId: row._id.toHexString(),
          items: snapshot.items,
          quoteExpiresAt: expiresAt.toISOString(),
          deliveryDeadline: snapshot.deliveryDeadline,
          availableMethods: snapshot.availableMethods,
          policyVersions: snapshot.policyVersions,
        })
      })
    },
    // Internal pre-submit check only: caller must resolve an existing intent FIRST, then consume
    // the quote and create order/allocations atomically in later owning tasks. This method neither
    // authorizes a supplied identity nor consumes/locks stock or consent by itself.
    async revalidate(principal: CheckoutPrincipal, raw: unknown, session: ClientSession) {
      if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
      const input = parseInput(moduleAccess.schemaCheckoutSubmitInput, raw)
      await verify()
      const row = await model
        .findOne({
          _id: input.quoteId,
          scopeType: principal.scopeType,
          scopeKeyHash: principal.scopeKeyHash,
        })
        .session(session)
      if (!row) throw new ApiError('NOT_FOUND')
      if (row.status !== 'open') throw new ApiError('STATE_CONFLICT')
      if (!row.expiresAt) throw new ApiError('SERVICE_UNAVAILABLE')
      if (row.expiresAt <= clock()) throw new ApiError('QUOTE_EXPIRED')
      const draft = normalize(principal, input)
      if (row.requestFingerprint !== checkoutDraftFingerprint(draft, moduleAccess))
        throw new ApiError('QUOTE_CHANGED')
      const stored = parseInput(
        moduleAccess.schemaCheckoutCommercialSnapshot,
        row.toObject({ flattenMaps: true }).commercialSnapshot,
      )
      if (
        checkoutCommercialDigest(stored, moduleAccess) !== row.commercialDigest ||
        checkoutDraftFingerprint(stored.draft, moduleAccess) !== row.requestFingerprint
      )
        throw new ApiError('STATE_CONFLICT')
      const current = await build(
        principal,
        draft,
        session,
        new Map(stored.items.map((line) => [line.variantId, line.id])),
      )
      if (
        row.commercialDigest !== checkoutCommercialDigest(current, moduleAccess) ||
        input.acceptedTermsVersion !==
          stored.policyVersions.find((policy) => policy.type === 'terms')?.version ||
        hash([...input.acceptedPolicyVersionIds].sort()) !==
          hash(stored.policyVersions.map((policy) => policy.version).sort())
      )
        throw new ApiError('QUOTE_CHANGED')
      return {
        quoteId: row._id.toHexString(),
        commercialDigest: row.commercialDigest,
        snapshot: stored,
      }
    },
  }
}

function orderPolicySnapshotAccess(connection: Connection) {
  return async (
    session: ClientSession,
    input: {
      orderId: string
      quoteId: string
      commercialDigest: string
    },
  ) => {
    if (!session.inTransaction()) throw new ApiError('STATE_CONFLICT')
    await verifyCheckoutQuotePersistence(connection)
    const row = await checkoutQuoteModel(connection)
      .findOne({
        _id: input.quoteId,
        orderId: input.orderId,
        status: 'consumed',
        commercialDigest: input.commercialDigest,
      })
      .session(session)
      .lean()
    if (!row) throw new ApiError('SERVICE_UNAVAILABLE')
    return row.commercialSnapshot.policyVersions.map((p) => ({
      type: p.type,
      version: p.version,
      effectiveAt: p.effectiveAt,
    }))
  }
}

export type { CheckoutCompletion }
export {
  createCheckoutCompletionService,
  createCheckoutExpiryService,
  createCheckoutIntentService,
  createCheckoutQuoteService,
  orderPolicySnapshotAccess,
}
