import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { checkoutCommercialDigest } from '../checkout/checkout-consent.service.js'
import { calculatePricing } from '../promotions/pricing.service.js'
import { createDeliveryDeadlineService } from './delivery-deadline.service.js'
import { orderCreationProof } from './order.schema.js'
export function buildOrderSnapshot(raw: unknown, placedAt: Date) {
  const proof = parseInput(orderCreationProof, raw),
    snapshot = proof.snapshot
  const acceptedAt = new Date(proof.acceptedAt)
  const rule = snapshot.deadlineBasis.rule
  if (
    acceptedAt < new Date(rule.effectiveFrom) ||
    (rule.effectiveTo && acceptedAt >= new Date(rule.effectiveTo))
  )
    throw new ApiError('BUSINESS_RULE_VIOLATION')
  if (
    !Number.isFinite(placedAt.getTime()) ||
    acceptedAt > placedAt ||
    acceptedAt < new Date(snapshot.deadlineBasis.capturedAt) ||
    proof.commercialDigest !== checkoutCommercialDigest(snapshot)
  )
    throw new ApiError('STATE_CONFLICT')
  if (
    snapshot.delivery.amountPoisha !== snapshot.pricing.deliveryChargePoisha ||
    !snapshot.policyVersions.some((policy) => policy.type === 'terms') ||
    new Set(snapshot.policyVersions.map((policy) => policy.type)).size !==
      snapshot.policyVersions.length ||
    new Set(snapshot.availableMethods.map((method) => method.channel)).size !== 4 ||
    !snapshot.availableMethods.some(
      (method) => method.channel === snapshot.draft.method && method.active && method.eligible,
    )
  )
    throw new ApiError('STATE_CONFLICT')
  const terms = snapshot.policyVersions.find((policy) => policy.type === 'terms')
  if (!terms) throw new ApiError('STATE_CONFLICT')
  const policyVersions = snapshot.policyVersions.map((policy) => policy.version)
  if (
    new Set(policyVersions).size !== policyVersions.length ||
    snapshot.policyVersions.some((policy) => new Date(policy.effectiveAt) > acceptedAt)
  )
    throw new ApiError('STATE_CONFLICT')
  if (
    Boolean(snapshot.coupon) !== Boolean(snapshot.draft.couponCode) ||
    (snapshot.coupon && snapshot.coupon.code !== snapshot.draft.couponCode)
  )
    throw new ApiError('STATE_CONFLICT')
  const calculated = calculatePricing({
    items: snapshot.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      regularUnitPoisha: item.regularUnitPoisha,
      effectiveUnitPoisha: item.effectiveUnitPoisha,
      couponEligible: item.couponEligible,
    })),
    deliveryChargePoisha: snapshot.delivery.amountPoisha,
    ...(snapshot.coupon
      ? { coupon: { type: snapshot.coupon.type, value: snapshot.coupon.value } }
      : {}),
  })
  for (const key of [
    'regularSubtotalPoisha',
    'productDiscountPoisha',
    'saleSubtotalPoisha',
    'couponDiscountPoisha',
    'deliveryChargePoisha',
    'finalTotalPoisha',
  ] as const)
    if (calculated[key] !== snapshot.pricing[key]) throw new ApiError('STATE_CONFLICT')
  if (
    snapshot.coupon &&
    (snapshot.coupon.eligibleSubtotalPoisha !== calculated.couponEligibleSubtotalPoisha ||
      snapshot.coupon.discountPoisha !== calculated.couponDiscountPoisha)
  )
    throw new ApiError('STATE_CONFLICT')
  if (
    snapshot.items.length !== snapshot.draft.items.length ||
    snapshot.items.some(
      (item) =>
        !snapshot.draft.items.some(
          (line) => line.variantId === item.variantId && line.quantity === item.quantity,
        ),
    )
  )
    throw new ApiError('STATE_CONFLICT')
  const items = snapshot.items.map((item) => {
    const expected = calculated.items.find((line) => line.id === item.id)
    if (
      !expected ||
      expected.regularLinePoisha !== item.regularLinePoisha ||
      expected.productDiscountPoisha !== item.productDiscountPoisha ||
      expected.couponAllocatedPoisha !== item.couponAllocatedPoisha ||
      expected.netMerchandisePoisha !== item.netMerchandisePoisha
    )
      throw new ApiError('STATE_CONFLICT')
    const base = BigInt(item.netMerchandisePoisha) / BigInt(item.quantity),
      remainder = BigInt(item.netMerchandisePoisha) % BigInt(item.quantity)
    return {
      ...item,
      unitRefundBasePoisha: Number(base),
      unitRefundRemainderQty: Number(remainder),
    }
  })
  const deadline = createDeliveryDeadlineService(undefined, () => placedAt)
  const timing = deadline.projectTiming(snapshot.deadlineBasis, {
    placedAt: placedAt.toISOString(),
  })
  if (timing.deliveryDeadline.status === 'under_review')
    throw new ApiError('BUSINESS_RULE_VIOLATION')
  const commitment = timing.deliveryDeadline
  return {
    proof,
    items,
    customerSnapshot: {
      name: snapshot.draft.customer.name,
      emailNormalized: snapshot.draft.customer.email,
      phone: snapshot.draft.customer.phone,
    },
    deliverySnapshot: {
      ...snapshot.draft.recipient,
      zoneId: snapshot.delivery.zoneId,
      chargeRuleId: snapshot.delivery.chargeRuleId,
      chargePoisha: snapshot.delivery.amountPoisha,
      deadlineRuleVersion: snapshot.deadlineBasis.rule.version,
      deadlineBasis: snapshot.deadlineBasis,
      ...(timing.deliveryEstimate ? { estimateAtCheckout: new Date(timing.deliveryEstimate) } : {}),
    },
    deliveryCommitment: {
      status: commitment.status,
      ...(commitment.startEventAt ? { startEventAt: new Date(commitment.startEventAt) } : {}),
      ...(commitment.targetDeadlineAt
        ? { targetDeadlineAt: new Date(commitment.targetDeadlineAt) }
        : {}),
      ...(commitment.legalCapAt ? { legalDeadlineAt: new Date(commitment.legalCapAt) } : {}),
      ...(commitment.effectiveAt ? { effectiveDeadlineAt: new Date(commitment.effectiveAt) } : {}),
      calculatedAt: placedAt,
      revision: 0,
    },
    pricingSnapshot: snapshot.pricing,
    termsSnapshot: {
      acceptedAt,
      policyVersionIds: policyVersions,
      termsVersion: terms.version,
      quoteId: proof.quoteId,
      commercialDigest: proof.commercialDigest,
    },
    couponSnapshot: snapshot.coupon,
    paymentMethod: snapshot.draft.method === 'cod' ? ('cod' as const) : ('online' as const),
  }
}
