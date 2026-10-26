import { createHash } from 'node:crypto'
import { Types, type Connection, type ClientSession } from 'mongoose'
import type { z } from 'zod'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type {
  CheckoutCredentials,
  CheckoutPrincipal,
  checkoutAccess,
} from '../auth/checkout-access.service.js'
import type { catalogCheckoutAccess } from '../catalog/catalog.service.js'
import type { checkoutDeliveryAccess } from '../delivery/delivery-coverage.service.js'
import type { checkoutSettingsAccess } from '../settings/checkout-settings.service.js'
import type { createDeliveryDeadlineService } from '../orders/delivery-deadline.service.js'
import type { couponQuoteAccess } from '../promotions/coupon.service.js'
import type { paymentEligibility } from '../payments/payment-eligibility.service.js'
import { calculatePricing } from '../promotions/pricing.service.js'
import { checkoutOptions } from '../../config/checkout.js'
import {
  type quoteCouponSnapshot,
  checkoutQuoteInput,
  checkoutSubmitInput,
  normalizedCheckoutDraft,
  checkoutCommercialSnapshot,
  checkoutQuote,
} from './checkout.schema.js'
import { checkoutQuoteModel } from './checkout-quote.model.js'
import { verifyCheckoutQuotePersistence } from './checkout-quote.persistence.js'
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex')
type Draft = z.output<typeof checkoutQuoteInput>
type Snapshot = z.output<typeof checkoutCommercialSnapshot>
export function checkoutQuoteService(
  connection: Connection,
  access: ReturnType<typeof checkoutAccess>,
  dependencies: {
    catalog: ReturnType<typeof catalogCheckoutAccess>
    delivery: ReturnType<typeof checkoutDeliveryAccess>
    settings: ReturnType<typeof checkoutSettingsAccess>
    deadline: ReturnType<typeof createDeliveryDeadlineService>
    coupon: ReturnType<typeof couponQuoteAccess>
    methods: ReturnType<typeof paymentEligibility>
  },
  rawOptions: unknown,
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
    return parseInput(normalizedCheckoutDraft, {
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
  function commercialDigest(snapshot: Snapshot) {
    // Capture time is consent evidence, not a commercial change; advisory capacity is not stored here.
    const { capturedAt, ...deadlineBasis } = snapshot.deadlineBasis
    void capturedAt
    return hash({ ...snapshot, deadlineBasis })
  }
  async function build(
    principal: CheckoutPrincipal,
    draft: z.output<typeof normalizedCheckoutDraft>,
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
    const deliveryDeadline = dependencies.deadline.project(deadlineBasis, {})
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
    let pricing: ReturnType<typeof calculatePricing>
    let coupon: z.output<typeof quoteCouponSnapshot> | undefined
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
      pricing = calculatePricing({
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
    return parseInput(checkoutCommercialSnapshot, {
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
      const input = parseInput(checkoutQuoteInput, raw)
      return access.owned(credentials, async (principal, session) => {
        await verify()
        const now = clock(),
          draft = normalize(principal, input),
          snapshot = await build(principal, draft, session)
        const expiresAt = new Date(now.getTime() + options.quoteTtlSeconds * 1000)
        const row = new model({
          scopeType: principal.scopeType,
          scopeKeyHash: principal.scopeKeyHash,
          requestFingerprint: hash(draft),
          commercialSnapshot: snapshot,
          commercialDigest: commercialDigest(snapshot),
          quotedAt: now,
          expiresAt,
        })
        await row.save({ session })
        return parseInput(checkoutQuote, {
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
      const input = parseInput(checkoutSubmitInput, raw)
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
      if (row.requestFingerprint !== hash(draft)) throw new ApiError('QUOTE_CHANGED')
      const stored = parseInput(
        checkoutCommercialSnapshot,
        row.toObject({ flattenMaps: true }).commercialSnapshot,
      )
      if (
        commercialDigest(stored) !== row.commercialDigest ||
        hash(stored.draft) !== row.requestFingerprint
      )
        throw new ApiError('STATE_CONFLICT')
      const current = await build(
        principal,
        draft,
        session,
        new Map(stored.items.map((line) => [line.variantId, line.id])),
      )
      if (
        row.commercialDigest !== commercialDigest(current) ||
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
