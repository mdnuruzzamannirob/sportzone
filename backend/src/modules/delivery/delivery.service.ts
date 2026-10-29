import { createHash, randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { inTransaction } from '../../shared/database/transaction.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { parseRevision } from '../../shared/preconditions.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { deliveryModels } from './delivery.model.js'
import { verifyDeliveryPersistence } from './delivery.persistence.js'
import {
  zoneInput,
  zonePatch,
  zoneView,
  zoneQuery,
  zoneParams,
  chargeInput,
  chargeView,
  chargeQuery,
  chargeParams,
  chargeActivate,
  chargeDeactivate,
  chargeSupersede,
  chargeReplacement,
  deliveryOperationKey,
} from './delivery.schema.js'

const digest = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
function revisionOf(match?: string) {
  const revision = parseRevision(match)
  if (revision === undefined) throw new ApiError('PRECONDITION_REQUIRED')
  if (!Number.isSafeInteger(revision)) throw new ApiError('PRECONDITION_FAILED')
  return revision
}
export function deliveryService(
  connection: Connection,
  access: AdminAccountAccess,
  guard: (session: ClientSession) => Promise<void>,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const { zones, charges } = deliveryModels(connection)
  type Charge = ReturnType<typeof charges.hydrate>
  type Zone = ReturnType<typeof zones.hydrate>
  function charge(row: Charge) {
    return parseInput(chargeView, {
      id: row._id.toHexString(),
      zoneId: row.zoneId.toHexString(),
      coverageKey: row.coverageKey,
      amountPoisha: row.amountPoisha,
      ruleVersion: row.ruleVersion,
      status: row.status,
      effectiveFrom: row.effectiveFrom.toISOString(),
      ...(row.effectiveTo ? { effectiveTo: row.effectiveTo.toISOString() } : {}),
      revision: row.revision,
      ...(row.supersedesChargeId
        ? { supersedesChargeId: row.supersedesChargeId.toHexString() }
        : {}),
    })
  }
  function zone(row: Zone) {
    return parseInput(zoneView, {
      id: row._id.toHexString(),
      name: row.name,
      ...(row.description ? { description: row.description } : {}),
      status: row.status,
      revision: row.revision,
      coverageRevision: row.coverageRevision,
    })
  }
  function advance(row: Charge | Zone) {
    if (!Number.isSafeInteger(row.revision) || row.revision >= Number.MAX_SAFE_INTEGER)
      throw new ApiError('STATE_CONFLICT')
    row.revision++
  }
  async function verify() {
    try {
      await verifyDeliveryPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function log(
    session: ClientSession,
    actorId: string | undefined,
    row: Charge | Zone,
    action: string,
    reason?: string,
    cause: string = randomUUID(),
  ) {
    const isZone = action.startsWith('delivery.zone')
    await audit(session, {
      actorType: actorId ? 'admin' : 'system',
      ...(actorId ? { actorId } : {}),
      action,
      targetType: isZone ? 'delivery_zone' : 'delivery_charge',
      targetId: row._id.toHexString(),
      operationKey: cause,
      occurredAt: clock(),
      afterDigest: digest(row.toObject()),
      ...(reason ? { reason } : {}),
    })
  }
  async function zoneRow(id: string, session: ClientSession) {
    const row = await zones.findById(id).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    return row
  }
  async function chargeRow(id: string, session: ClientSession) {
    parseInput(chargeParams, { chargeId: id })
    const row = await charges.findById(id).session(session)
    if (!row) throw new ApiError('NOT_FOUND')
    return row
  }
  async function bumpZones(ids: readonly string[], session: ClientSession) {
    for (const id of [...new Set(ids)].sort()) {
      const row = await zoneRow(id, session)
      if (
        !Number.isSafeInteger(row.coverageRevision) ||
        row.coverageRevision >= Number.MAX_SAFE_INTEGER
      )
        throw new ApiError('STATE_CONFLICT')
      row.coverageRevision++
      advance(row)
      await row.save({ session })
    }
  }
  async function prepare(key: string, zoneIds: string[], session: ClientSession) {
    const expired = await charges
      .find({
        coverageKey: key,
        status: { $in: ['active', 'scheduled'] },
        effectiveTo: { $lte: clock() },
      })
      .session(session)
    await bumpZones([...zoneIds, ...expired.map((row) => row.zoneId.toHexString())], session)
    for (const row of expired) {
      row.status = 'inactive'
      advance(row)
      await row.save({ session })
      await log(session, undefined, row, 'delivery.charge.expire')
    }
  }
  async function noOverlap(
    key: string,
    from: Date,
    to: Date | undefined,
    session: ClientSession,
    exclude?: Types.ObjectId,
  ) {
    const found = await charges
      .exists({
        coverageKey: key,
        status: { $in: ['scheduled', 'active'] },
        ...(exclude ? { _id: { $ne: exclude } } : {}),
        ...(to ? { effectiveFrom: { $lt: to } } : {}),
        $or: [{ effectiveTo: { $exists: false } }, { effectiveTo: { $gt: from } }],
      })
      .session(session)
    if (found) throw new ApiError('STATE_CONFLICT')
  }
  async function createCharge(
    input: ReturnType<typeof chargeInput.parse>,
    session: ClientSession,
    supersedesChargeId?: Types.ObjectId,
  ) {
    const targetZone = await zoneRow(input.zoneId, session)
    if (targetZone.status !== 'active') throw new ApiError('BUSINESS_RULE_VIOLATION')
    const from = new Date(input.effectiveFrom),
      to = input.effectiveTo ? new Date(input.effectiveTo) : undefined
    if (from < clock()) throw new ApiError('BUSINESS_RULE_VIOLATION')
    await noOverlap(input.coverageKey, from, to, session)
    const prior = await charges
      .findOne({ coverageKey: input.coverageKey })
      .sort({ ruleVersion: -1 })
      .session(session)
    if (prior && prior.ruleVersion >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
    const row = new charges({
      ...input,
      ruleVersion: prior ? prior.ruleVersion + 1 : 1,
      status: from <= clock() ? 'active' : 'scheduled',
      ...(supersedesChargeId ? { supersedesChargeId } : {}),
    })
    await row.save({ session })
    return row
  }
  function end(row: Charge, when: Date, reason: string) {
    if (
      when < clock() ||
      when <= row.effectiveFrom ||
      (row.effectiveTo && when > row.effectiveTo) ||
      (row.endedAt && row.effectiveTo?.getTime() !== when.getTime())
    )
      throw new ApiError('BUSINESS_RULE_VIOLATION')
    row.effectiveTo = when
    row.endedAt = when
    row.endedReason = reason
    if (when <= clock()) row.status = 'inactive'
    advance(row)
  }
  async function mapped<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work()
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  return {
    async zones(token: string | undefined, raw: unknown) {
      const input = parseInput(zoneQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const total = await zones.countDocuments().session(session)
          const rows = await zones
            .find()
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return { data: rows.map(zone), page: pageMeta(input, total) }
        },
        false,
      )
    },
    async createZone(token: string | undefined, raw: unknown) {
      const input = parseInput(zoneInput, raw),
        cause = randomUUID()
      return access.owned(token, async (actorId, session) => {
        await verify()
        await guard(session)
        const row = new zones(input)
        await row.save({ session })
        await log(session, actorId, row, 'delivery.zone.create', undefined, cause)
        return zone(row)
      })
    },
    async patchZone(token: string | undefined, id: string, raw: unknown, match?: string) {
      parseInput(zoneParams, { zoneId: id })
      const input = parseInput(zonePatch, raw),
        revision = revisionOf(match),
        cause = randomUUID()
      return access.owned(token, async (actorId, session) => {
        await verify()
        if (input.status !== undefined) await guard(session)
        const row = await zoneRow(id, session)
        if (row.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
        const before = zone(row)
        row.set(input)
        if (isDeepStrictEqual(before, zone(row))) return before
        if (before.status !== row.status) {
          if (row.coverageRevision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
          row.coverageRevision++
        }
        advance(row)
        await row.save({ session })
        await log(session, actorId, row, 'delivery.zone.update', undefined, cause)
        return zone(row)
      })
    },
    async charges(token: string | undefined, raw: unknown) {
      const input = parseInput(chargeQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const filter = {
            ...(input.zoneId ? { zoneId: new Types.ObjectId(input.zoneId) } : {}),
            ...(input.status ? { status: input.status } : {}),
          }
          const total = await charges.countDocuments(filter).session(session)
          const rows = await charges
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return { data: rows.map(charge), page: pageMeta(input, total) }
        },
        false,
      )
    },
    async createCharge(token: string | undefined, raw: unknown) {
      const input = parseInput(chargeInput, raw),
        cause = randomUUID()
      return mapped(() =>
        access.owned(token, async (actorId, session) => {
          await verify()
          await guard(session)
          await prepare(input.coverageKey, [input.zoneId], session)
          const row = await createCharge(input, session)
          await log(session, actorId, row, 'delivery.charge.create', undefined, cause)
          return charge(row)
        }),
      )
    },
    async transition(
      token: string | undefined,
      id: string,
      action: 'activate' | 'deactivate' | 'supersede',
      raw: unknown,
      match?: string,
      key?: string,
    ) {
      parseInput(chargeParams, { chargeId: id })
      const revision = revisionOf(match),
        cause = parseInput(deliveryOperationKey, key)
      const input =
        action === 'activate'
          ? parseInput(chargeActivate, raw)
          : action === 'deactivate'
            ? parseInput(chargeDeactivate, raw)
            : parseInput(chargeSupersede, raw)
      return mapped(() =>
        access.owned(token, async (actorId, session) => {
          await verify()
          await guard(session)
          const row = await chargeRow(id, session),
            keyDigest = digest(cause),
            requestDigest = digest({ actorId, id, action, input, revision })
          const prior = row.toObject().operations?.find((operation) => operation.action === action)
          if (prior) {
            if (prior.keyDigest !== keyDigest || prior.requestDigest !== requestDigest)
              throw new ApiError('IDEMPOTENCY_CONFLICT')
            return prior.previous
              ? parseInput(chargeReplacement, {
                  previous: prior.previous,
                  replacement: prior.rule,
                })
              : parseInput(chargeView, prior.rule)
          }
          if (row.revision !== revision) throw new ApiError('PRECONDITION_FAILED')
          if (row.status === 'inactive' || (row.effectiveTo && row.effectiveTo <= clock()))
            throw new ApiError('STATE_CONFLICT')
          const replacement =
            action === 'supersede' ? parseInput(chargeSupersede, raw).replacement : undefined
          if (replacement && replacement.coverageKey !== row.coverageKey)
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          await prepare(
            row.coverageKey,
            [row.zoneId.toHexString(), ...(replacement ? [replacement.zoneId] : [])],
            session,
          )
          let successor: Charge | undefined
          if (action === 'activate') {
            if (
              row.status !== 'scheduled' ||
              row.effectiveFrom > clock() ||
              (input.effectiveAt && Date.parse(input.effectiveAt) !== row.effectiveFrom.getTime())
            )
              throw new ApiError('STATE_CONFLICT')
            if ((await zoneRow(row.zoneId.toHexString(), session)).status !== 'active')
              throw new ApiError('BUSINESS_RULE_VIOLATION')
            await noOverlap(
              row.coverageKey,
              row.effectiveFrom,
              row.effectiveTo ?? undefined,
              session,
              row._id,
            )
            row.status = 'active'
            advance(row)
          } else {
            if (!input.effectiveAt) throw new ApiError('VALIDATION_FAILED')
            end(row, new Date(input.effectiveAt), input.reason)
            // End the predecessor before an immediately active successor, satisfying the partial unique index.
            await row.save({ session })
            if (replacement) successor = await createCharge(replacement, session, row._id)
          }
          const result = successor ? charge(successor) : charge(row),
            previous = successor ? charge(row) : undefined
          row.set('operations', [
            ...(row.operations ?? []),
            { action, keyDigest, requestDigest, rule: result, ...(previous ? { previous } : {}) },
          ])
          await row.save({ session })
          await log(session, actorId, row, `delivery.charge.${action}`, input.reason, keyDigest)
          if (successor)
            await log(
              session,
              actorId,
              successor,
              'delivery.charge.create',
              input.reason,
              keyDigest,
            )
          return previous ? { previous, replacement: result } : result
        }),
      )
    },
    async runDue() {
      await verify()
      const due = await charges.aggregate<{ _id: Types.ObjectId }>([
        {
          $match: {
            $or: [
              { status: 'scheduled', effectiveFrom: { $lte: clock() } },
              { status: 'active', effectiveTo: { $lte: clock() } },
            ],
          },
        },
        {
          $lookup: {
            from: 'deliveryZones',
            localField: 'zoneId',
            foreignField: '_id',
            as: '_zone',
          },
        },
        // Disabled scheduled zones must not occupy every batch slot and starve other work.
        { $match: { $or: [{ status: 'active' }, { '_zone.status': 'active' }] } },
        { $sort: { effectiveFrom: 1, _id: 1 } },
        { $limit: 100 },
        { $project: { _id: 1 } },
      ])
      let processed = 0
      for (const item of due) {
        const changed = await mapped(() =>
          inTransaction(connection, async (session) => {
            await guard(session)
            const row = await chargeRow(item._id.toHexString(), session)
            if (
              row.status === 'inactive' ||
              (row.status === 'active' && (!row.effectiveTo || row.effectiveTo > clock()))
            )
              return false
            await prepare(row.coverageKey, [row.zoneId.toHexString()], session)
            const current = await chargeRow(item._id.toHexString(), session)
            if (current.status === 'inactive') return true
            if (current.effectiveFrom > clock()) return false
            if ((await zoneRow(current.zoneId.toHexString(), session)).status !== 'active')
              return false
            await noOverlap(
              current.coverageKey,
              current.effectiveFrom,
              current.effectiveTo ?? undefined,
              session,
              current._id,
            )
            current.status = 'active'
            advance(current)
            await current.save({ session })
            await log(session, undefined, current, 'delivery.charge.activate')
            return true
          }),
        )
        if (changed) processed++
      }
      return { processed }
    },
  }
}
