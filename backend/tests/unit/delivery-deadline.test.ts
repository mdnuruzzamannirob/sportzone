import { expect, it } from 'vitest'
import {
  createDeliveryDeadlineService,
  deliveryDeadlineDigest,
  addDeliveryCalendarDays,
} from '../../src/modules/orders/delivery-deadline.service.js'
import {
  deliveryDeadlineRule,
  type DeliveryDeadlineManifest,
} from '../../src/modules/orders/delivery-deadline.schema.js'

function manifest(legalCaps: DeliveryDeadlineManifest['rule']['legalCaps'] = []) {
  const rule = deliveryDeadlineRule.parse({
    version: 'synthetic-v1',
    timezone: 'Asia/Dhaka',
    effectiveFrom: '2026-01-01T00:00:00Z',
    target: { startEvent: 'confirmedAt', calendarDays: 14 },
    legalCaps,
  })
  return {
    rule,
    review: {
      evidenceRef: 'synthetic:review-only',
      approvedAt: '2026-01-01T00:00:00Z',
      approvedBy: 'Synthetic test reviewer',
      ruleDigest: deliveryDeadlineDigest(rule),
    },
  }
}
function fixture(policy = manifest()) {
  let current = new Date('2026-10-26T00:00:00Z')
  const service = createDeliveryDeadlineService(policy, () => current),
    basis = service.snapshotForCheckout()
  return {
    service,
    basis,
    setNow: (value: string) => {
      current = new Date(value)
    },
  }
}
it('fails closed without an approved configured basis and never substitutes the 14-day planning target', () => {
  const service = createDeliveryDeadlineService()
  expect(service.preview()).toEqual({
    status: 'under_review',
    startEvent: 'confirmedAt',
    ruleVersion: 'unconfigured',
  })
  expect(() => service.snapshotForCheckout()).toThrow('Service is temporarily unavailable')
  expect(() => service.requireConfirmation(undefined, {})).toThrow(
    'The requested operation is not available.',
  )
})
it('does not manufacture confirmedAt or an absolute deadline before its actual start', () => {
  const { service, basis } = fixture()
  expect(service.project(basis, {})).toEqual({
    status: 'awaiting_start',
    startEvent: 'confirmedAt',
    ruleVersion: 'synthetic-v1',
  })
  expect(service.projectTiming(basis, {})).toEqual({ deliveryDeadline: service.project(basis, {}) })
})
it('anchors a delayed COD target to actual confirmation rather than placement or quote creation', () => {
  const { service, basis, setNow } = fixture()
  setNow('2026-11-20T00:00:00Z')
  const result = service.requireConfirmation(basis, {
    placedAt: '2026-10-26T00:00:00Z',
    confirmedAt: '2026-10-30T09:15:00Z',
  })
  expect(result.targetDeadlineAt).toBe('2026-11-13T09:15:00.000Z')
  expect(result.effectiveAt).toBe(result.targetDeadlineAt)
  expect(result.startEventAt).toBe('2026-10-30T09:15:00.000Z')
})
it('retains an independent placement cap before confirmation without claiming a complete commitment', () => {
  const { service, basis, setNow } = fixture(
    manifest([{ ruleRef: 'synthetic-cap', startEvent: 'placedAt', calendarDays: 7 }]),
  )
  setNow('2026-10-27T00:00:00Z')
  expect(service.project(basis, { placedAt: '2026-10-26T00:00:00Z' })).toEqual({
    status: 'awaiting_start',
    startEvent: 'confirmedAt',
    ruleVersion: 'synthetic-v1',
    legalCapAt: '2026-11-02T00:00:00.000Z',
  })
})
it('selects the earliest applicable legal cap even when delayed confirmation makes that cap overdue', () => {
  const { service, basis, setNow } = fixture(
    manifest([
      { ruleRef: 'synthetic-placed', startEvent: 'placedAt', calendarDays: 7 },
      { ruleRef: 'synthetic-confirmed', startEvent: 'confirmedAt', calendarDays: 3 },
    ]),
  )
  setNow('2026-11-20T00:00:00Z')
  const result = service.project(basis, {
    placedAt: '2026-10-26T00:00:00Z',
    confirmedAt: '2026-11-05T00:00:00Z',
  })
  expect(result.targetDeadlineAt).toBe('2026-11-19T00:00:00.000Z')
  expect(result.legalCapAt).toBe('2026-11-02T00:00:00.000Z')
  expect(result.effectiveAt).toBe(result.legalCapAt)
})
it('never extends the target when the reviewed legal maximum is later', () => {
  const { service, basis, setNow } = fixture(
    manifest([{ ruleRef: 'synthetic-longer', startEvent: 'confirmedAt', calendarDays: 30 }]),
  )
  setNow('2026-10-27T00:00:00Z')
  const result = service.project(basis, {
    placedAt: basis.capturedAt,
    confirmedAt: basis.capturedAt,
  })
  expect(result.effectiveAt).toBe('2026-11-09T00:00:00.000Z')
  expect(result.legalCapAt).toBe('2026-11-25T00:00:00.000Z')
})
it('preserves Dhaka calendar time across leap days, month/year boundaries and explicit offsets', () => {
  for (const [start, days, expected] of [
    ['2026-10-26T18:30:00Z', 14, '2026-11-09T18:30:00.000Z'],
    ['2028-02-28T18:30:00Z', 1, '2028-02-29T18:30:00.000Z'],
    ['2027-02-28T00:00:00Z', 1, '2027-03-01T00:00:00.000Z'],
    ['2026-12-31T18:30:00Z', 14, '2027-01-14T18:30:00.000Z'],
    ['2026-10-26T23:00:00.123+06:00', 1, '2026-10-27T17:00:00.123Z'],
  ] as const)
    expect(addDeliveryCalendarDays(start, days)).toBe(expected)
})
it('fails closed for invalid arithmetic and a nonexistent Dhaka wall time from runtime timezone data', () => {
  for (const days of [0, -1, 1.5, 3661])
    expect(() => addDeliveryCalendarDays('2026-10-26T00:00:00Z', days)).toThrow()
  expect(() => addDeliveryCalendarDays('invalid', 1)).toThrow()
  expect(() => addDeliveryCalendarDays('2009-06-18T17:30:00Z', 1)).toThrow()
})
it('omits definitive dates for missing, contradictory or future actual events', () => {
  const { service, basis } = fixture()
  for (const events of [
    { confirmedAt: basis.capturedAt },
    { placedAt: '2026-10-25T00:00:00Z' },
    { placedAt: basis.capturedAt, confirmedAt: '2026-10-27T00:00:00Z' },
    { placedAt: basis.capturedAt, confirmedAt: '2026-10-25T00:00:00Z' },
    { placedAt: 'invalid' },
    { confirmedAt: basis.capturedAt, assumedConfirmedAt: basis.capturedAt },
  ]) {
    const result = service.project(basis, events)
    expect(result.status).toBe('under_review')
    expect(result).not.toHaveProperty('effectiveAt')
    expect(result).not.toHaveProperty('targetDeadlineAt')
    expect(() => service.requireConfirmation(basis, events)).toThrow()
  }
})
it('rejects tampered or not-yet-approved basis and refuses new snapshots outside the rule window', () => {
  const tampered = manifest()
  tampered.rule.target.calendarDays = 1
  expect(createDeliveryDeadlineService(tampered).preview().status).toBe('under_review')
  const future = manifest()
  future.review.approvedAt = '2999-01-01T00:00:00Z'
  expect(createDeliveryDeadlineService(future).preview().status).toBe('under_review')
  const policy = manifest()
  policy.rule.effectiveFrom = '2026-11-01T00:00:00Z'
  policy.review.ruleDigest = deliveryDeadlineDigest(policy.rule)
  const service = createDeliveryDeadlineService(policy, () => new Date('2026-10-26T00:00:00Z'))
  expect(() => service.snapshotForCheckout()).toThrow()
})
it('keeps accepted snapshots immutable and computes from historical basis after a new policy becomes current', () => {
  const policy = manifest(),
    { service, basis, setNow } = fixture(policy)
  expect(() => {
    basis.rule.target.calendarDays = 1
  }).toThrow(TypeError)
  expect(() => {
    basis.rule.legalCaps.push({ ruleRef: 'synthetic', calendarDays: 1, startEvent: 'placedAt' })
  }).toThrow(TypeError)
  policy.rule.target.calendarDays = 1
  setNow('2026-10-27T00:00:00Z')
  const result = service.project(basis, {
    placedAt: basis.capturedAt,
    confirmedAt: basis.capturedAt,
  })
  expect(result.effectiveAt).toBe('2026-11-09T00:00:00.000Z')
  const newer = manifest()
  newer.rule.version = 'synthetic-v2'
  newer.rule.target.calendarDays = 2
  newer.review.ruleDigest = deliveryDeadlineDigest(newer.rule)
  expect(
    createDeliveryDeadlineService(newer, () => new Date('2026-11-20T00:00:00Z')).project(basis, {
      placedAt: basis.capturedAt,
      confirmedAt: basis.capturedAt,
    }),
  ).toEqual(result)
})
it('retains historical commitments after the original rule expires for new checkouts', () => {
  const policy = manifest()
  policy.rule.effectiveTo = '2026-10-27T00:00:00Z'
  policy.review.ruleDigest = deliveryDeadlineDigest(policy.rule)
  const { service, basis, setNow } = fixture(policy)
  setNow('2026-11-20T00:00:00Z')
  expect(() => service.snapshotForCheckout()).toThrow()
  expect(
    service.project(basis, { placedAt: basis.capturedAt, confirmedAt: '2026-10-30T00:00:00Z' })
      .effectiveAt,
  ).toBe('2026-11-13T00:00:00.000Z')
})
it('keeps an approved estimate separate from the effective deadline and omits approval identities publicly', () => {
  const policy = manifest()
  policy.rule.estimate = { startEvent: 'placedAt', calendarDays: 20 }
  policy.review.ruleDigest = deliveryDeadlineDigest(policy.rule)
  const { service, basis, setNow } = fixture(policy)
  setNow('2026-10-27T00:00:00Z')
  const result = service.projectTiming(basis, {
    placedAt: basis.capturedAt,
    confirmedAt: basis.capturedAt,
  })
  expect(result.deliveryEstimate).toBe('2026-11-15T00:00:00.000Z')
  expect(result.deliveryDeadline.effectiveAt).toBe('2026-11-09T00:00:00.000Z')
  for (const secret of ['approvedBy', 'evidenceRef', 'ruleDigest', 'Synthetic test reviewer'])
    expect(JSON.stringify(result)).not.toContain(secret)
})
it('validates bounded explicit review rules without treating absence of caps as approval', () => {
  const policy = manifest()
  for (const patch of [
    { legalCaps: undefined },
    { target: { startEvent: 'placedAt', calendarDays: 14 } },
    { target: { startEvent: 'confirmedAt', calendarDays: 0 } },
    { timezone: 'UTC' },
    { version: 'unconfigured' },
    {
      legalCaps: [
        { ruleRef: 'same', startEvent: 'placedAt', calendarDays: 1 },
        { ruleRef: 'same', startEvent: 'placedAt', calendarDays: 2 },
      ],
    },
  ])
    expect(deliveryDeadlineRule.safeParse({ ...policy.rule, ...patch }).success).toBe(false)
  expect(deliveryDeadlineDigest({ ...policy.rule })).toBe(deliveryDeadlineDigest(policy.rule))
})

it('preserves the reviewed preview when the read capability is passed independently', () => {
  const { service } = fixture()
  const { preview } = service
  expect(preview()).toEqual({
    status: 'awaiting_start',
    startEvent: 'confirmedAt',
    ruleVersion: 'synthetic-v1',
  })
})
