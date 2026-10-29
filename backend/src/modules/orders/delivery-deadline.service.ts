import { createHash } from 'node:crypto'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import {
  deliveryDeadlineRule,
  deliveryDeadlineManifest,
  deliveryDeadlineBasis,
  deliveryDeadlineEvents,
  deliveryDeadline,
  type DeliveryDeadlineManifest,
  type DeliveryDeadlineBasis,
} from './delivery-deadline.schema.js'

// Fixed field order from the owning validator, including explicit legal-cap order.
export function deliveryDeadlineDigest(raw: unknown) {
  const rule = parseInput(deliveryDeadlineRule, raw)
  return createHash('sha256').update(JSON.stringify(rule)).digest('hex')
}
const formatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
function wallTime(value: Date) {
  const parts = formatter.formatToParts(value)
  const field = (key: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === key)?.value)
  const result = new Date(0)
  result.setUTCFullYear(field('year'), field('month') - 1, field('day'))
  result.setUTCHours(field('hour'), field('minute'), field('second'), value.getUTCMilliseconds())
  return result.getTime()
}
// Calendar-day arithmetic preserves Dhaka wall-clock time, including month/year/leap boundaries.
// If a historical timezone transition has no unambiguous local result, fail closed.
export function addDeliveryCalendarDays(raw: string, calendarDays: number) {
  if (!Number.isSafeInteger(calendarDays) || calendarDays < 1 || calendarDays > 3660)
    throw new ApiError('BUSINESS_RULE_VIOLATION')
  const instant = new Date(raw)
  if (!Number.isFinite(instant.getTime())) throw new ApiError('BUSINESS_RULE_VIOLATION')
  const local = new Date(wallTime(instant))
  local.setUTCDate(local.getUTCDate() + calendarDays)
  const target = local.getTime()
  const offsets = new Set(
    [-2, 0, 2].map((days) => {
      const probe = new Date(target + days * 86400000)
      return probe.getTime() - wallTime(probe)
    }),
  )
  const matches = [...offsets]
    .map((offset) => target + offset)
    .filter((candidate) => wallTime(new Date(candidate)) === target)
  if (matches.length === 1 && matches[0] !== undefined) return new Date(matches[0]).toISOString()
  throw new ApiError('BUSINESS_RULE_VIOLATION')
}
function reviewed(manifest: DeliveryDeadlineManifest, at: Date) {
  return (
    manifest.review.ruleDigest === deliveryDeadlineDigest(manifest.rule) &&
    Date.parse(manifest.review.approvedAt) <= at.getTime()
  )
}
function active(manifest: DeliveryDeadlineManifest, at: Date) {
  return (
    reviewed(manifest, at) &&
    Date.parse(manifest.rule.effectiveFrom) <= at.getTime() &&
    (!manifest.rule.effectiveTo || at.getTime() < Date.parse(manifest.rule.effectiveTo))
  )
}
function freezeBasis(basis: DeliveryDeadlineBasis) {
  for (const cap of basis.rule.legalCaps) Object.freeze(cap)
  Object.freeze(basis.rule.legalCaps)
  if (basis.rule.estimate) Object.freeze(basis.rule.estimate)
  Object.freeze(basis.rule.target)
  Object.freeze(basis.rule)
  Object.freeze(basis.review)
  return Object.freeze(basis)
}
export function createDeliveryDeadlineService(
  manifest?: DeliveryDeadlineManifest,
  clock: () => Date = () => new Date(),
) {
  // Copy operator configuration once so caller mutation cannot rewrite accepted decisions.
  const configured = manifest ? deliveryDeadlineManifest.safeParse(manifest) : undefined
  function now() {
    const at = clock()
    if (!Number.isFinite(at.getTime())) throw new ApiError('SERVICE_UNAVAILABLE')
    return at
  }
  const fallback = (ruleVersion = 'unconfigured') =>
    parseInput(deliveryDeadline, {
      status: 'under_review',
      startEvent: 'confirmedAt',
      ruleVersion,
    })
  function project(rawBasis: unknown, rawEvents: unknown) {
    const at = now(),
      parsed = deliveryDeadlineBasis.safeParse(rawBasis)
    if (!parsed.success) return fallback()
    const basis = parsed.data,
      capturedAt = new Date(basis.capturedAt)
    if (!active(basis, capturedAt) || capturedAt > at) return fallback(basis.rule.version)
    const events = deliveryDeadlineEvents.safeParse(rawEvents)
    if (!events.success) return fallback(basis.rule.version)
    const placed = events.data.placedAt ? new Date(events.data.placedAt) : undefined
    const confirmed = events.data.confirmedAt ? new Date(events.data.confirmedAt) : undefined
    if (
      (placed && (placed > at || placed < capturedAt)) ||
      (confirmed && (!placed || confirmed < placed || confirmed > at))
    )
      return fallback(basis.rule.version)
    try {
      const target = confirmed
        ? addDeliveryCalendarDays(confirmed.toISOString(), basis.rule.target.calendarDays)
        : undefined
      const caps = basis.rule.legalCaps.map((cap) => {
        const start = cap.startEvent === 'placedAt' ? placed : confirmed
        return start ? addDeliveryCalendarDays(start.toISOString(), cap.calendarDays) : undefined
      })
      const capDates = caps.filter((value): value is string => value !== undefined)
      const legal = capDates.length
        ? capDates.reduce((a, b) => (Date.parse(a) < Date.parse(b) ? a : b))
        : undefined
      const complete = target !== undefined && caps.every((value) => value !== undefined)
      return parseInput(deliveryDeadline, {
        status: complete ? 'calculated' : 'awaiting_start',
        startEvent: 'confirmedAt',
        ruleVersion: basis.rule.version,
        ...(confirmed ? { startEventAt: confirmed.toISOString() } : {}),
        ...(target ? { targetDeadlineAt: target } : {}),
        ...(legal ? { legalCapAt: legal } : {}),
        ...(complete && target
          ? { effectiveAt: legal && Date.parse(legal) < Date.parse(target) ? legal : target }
          : {}),
      })
    } catch {
      return fallback(basis.rule.version)
    }
  }
  function snapshotForCheckout() {
    const at = now()
    if (!configured?.success || !active(configured.data, at))
      throw new ApiError('SERVICE_UNAVAILABLE')
    return freezeBasis(
      parseInput(deliveryDeadlineBasis, { ...configured.data, capturedAt: at.toISOString() }),
    )
  }
  return {
    snapshotForCheckout,
    project,
    preview() {
      try {
        return project(snapshotForCheckout(), {})
      } catch {
        return fallback()
      }
    },
    projectTiming(rawBasis: unknown, rawEvents: unknown) {
      const deliveryDeadline = project(rawBasis, rawEvents)
      if (deliveryDeadline.status === 'under_review') return { deliveryDeadline }
      const basis = parseInput(deliveryDeadlineBasis, rawBasis),
        events = parseInput(deliveryDeadlineEvents, rawEvents)
      const estimate = basis.rule.estimate
      const start = estimate ? events[estimate.startEvent] : undefined
      if (!estimate || !start) return { deliveryDeadline }
      try {
        return {
          deliveryDeadline,
          deliveryEstimate: addDeliveryCalendarDays(start, estimate.calendarDays),
        }
      } catch {
        return { deliveryDeadline }
      }
    },
    requireConfirmation(basis: unknown, events: unknown) {
      const result = project(basis, events)
      if (result.status !== 'calculated') throw new ApiError('BUSINESS_RULE_VIOLATION')
      return result
    },
  }
}
