import { isDeepStrictEqual } from 'node:util'
import { createHash, randomUUID } from 'node:crypto'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import type { AdminAccountAccess } from '../auth/admin-account.service.js'
import { couponModels } from './coupon.model.js'
import { verifyCouponPersistence } from './coupon.persistence.js'
import {
  couponAdmin,
  couponInput,
  couponPatch,
  couponParams,
  couponDeactivate,
  couponListQuery,
  couponHistoryQuery,
  couponHistory,
  parseCouponRevision,
} from './coupon-admin.schema.js'

export function couponAdminService(
  connection: Connection,
  access: AdminAccountAccess,
  audit: (session: ClientSession, event: unknown) => Promise<void>,
  clock: () => Date = () => new Date(),
) {
  const models = couponModels(connection)
  type Coupon = ReturnType<typeof models.coupons.hydrate>
  function view(row: Coupon) {
    return parseInput(couponAdmin, {
      id: row._id.toHexString(),
      code: row.codeNormalized,
      type: row.type,
      value: row.value,
      minEligibleSubtotalPoisha: row.minEligibleSubtotalPoisha,
      startsAt: row.startsAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      status: row.status,
      heldCount: row.heldCount,
      redeemedCount: row.redeemedCount,
      termsVersion: row.termsVersion,
      revision: row.revision,
      ...(row.overallLimit != null ? { overallLimit: row.overallLimit } : {}),
      ...(row.perCustomerLimit != null ? { perCustomerLimit: row.perCustomerLimit } : {}),
      ...(row.eligibleProductIds ? { eligibleProductIds: row.eligibleProductIds.map(String) } : {}),
      ...(row.eligibleCategoryIds
        ? { eligibleCategoryIds: row.eligibleCategoryIds.map(String) }
        : {}),
    })
  }
  const digest = (value: unknown) =>
    createHash('sha256').update(JSON.stringify(value)).digest('hex')
  async function verify() {
    try {
      await verifyCouponPersistence(connection)
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function write(
    token: string | undefined,
    raw: unknown,
    couponId?: string,
    match?: string,
    reason?: string,
  ) {
    const operationKey = randomUUID()
    const expected = parseCouponRevision(match)
    if (couponId) {
      parseInput(couponParams, { couponId })
      if (expected === undefined) throw new ApiError('PRECONDITION_REQUIRED')
      if (!Number.isSafeInteger(expected)) throw new ApiError('PRECONDITION_FAILED')
    }
    const patch = couponId ? parseInput(couponPatch, raw) : undefined
    const create = couponId ? undefined : parseInput(couponInput, raw)
    try {
      return await access.owned(token, async (actorId, session) => {
        await verify()
        let row = couponId ? await models.coupons.findById(couponId).session(session) : null
        if (couponId && !row) throw new ApiError('NOT_FOUND')
        if (row && row.revision !== expected) throw new ApiError('PRECONDITION_FAILED')
        const before = row ? view(row) : undefined
        const current = before ? { ...before } : undefined
        if (current) {
          const {
            id: _id,
            heldCount: _held,
            redeemedCount: _redeemed,
            revision: _revision,
            termsVersion: _version,
            ...config
          } = current
          const original = { ...config }
          for (const [key, value] of Object.entries(patch ?? {})) {
            if (value === null) Reflect.deleteProperty(config, key)
            else Reflect.set(config, key, value)
          }
          const input = parseInput(couponInput, config)
          if (
            isDeepStrictEqual(
              {
                ...input,
                startsAt: new Date(input.startsAt).toISOString(),
                expiresAt: new Date(input.expiresAt).toISOString(),
              },
              original,
            ) &&
            !reason
          ) {
            if (!row) throw new ApiError('STATE_CONFLICT')
            return view(row)
          }
          if (!row) throw new ApiError('STATE_CONFLICT')
          if (
            row.revision >= Number.MAX_SAFE_INTEGER ||
            row.termsVersion >= Number.MAX_SAFE_INTEGER
          )
            throw new ApiError('STATE_CONFLICT')
          if (
            input.overallLimit !== undefined &&
            BigInt(row.heldCount) + BigInt(row.redeemedCount) > BigInt(input.overallLimit)
          )
            throw new ApiError('BUSINESS_RULE_VIOLATION')
          if (input.perCustomerLimit !== undefined) {
            const over = await models.customers
              .findOne({
                couponId: row._id,
                $expr: {
                  $gt: [{ $add: ['$heldCount', '$redeemedCount'] }, input.perCustomerLimit],
                },
              })
              .session(session)
            if (over) throw new ApiError('BUSINESS_RULE_VIOLATION')
          }
          const { code, ...updatedConfig } = input
          row.set({
            ...updatedConfig,
            codeNormalized: code,
            startsAt: new Date(input.startsAt),
            expiresAt: new Date(input.expiresAt),
          })
          // Only declared configuration fields change; counters and redemptions are never client-owned.
          for (const key of [
            'overallLimit',
            'perCustomerLimit',
            'eligibleProductIds',
            'eligibleCategoryIds',
          ] as const)
            if (input[key] === undefined) row.set(key, undefined)
          row.revision += 1
          row.termsVersion += 1
        } else {
          if (!create) throw new ApiError('STATE_CONFLICT')
          const { code, ...config } = create
          row = new models.coupons({
            ...config,
            codeNormalized: code,
            startsAt: new Date(config.startsAt),
            expiresAt: new Date(config.expiresAt),
          })
        }
        if (!row) throw new ApiError('STATE_CONFLICT')
        await row.save({ session })
        const result = view(row)
        await audit(session, {
          actorType: 'admin',
          actorId,
          action: reason ? 'coupon.deactivate' : couponId ? 'coupon.update' : 'coupon.create',
          targetType: 'coupon',
          targetId: result.id,
          operationKey,
          occurredAt: clock(),
          ...(before ? { beforeDigest: digest(before) } : {}),
          afterDigest: digest(result),
          ...(reason ? { reason } : {}),
        })
        return result
      })
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)
        throw new ApiError('STATE_CONFLICT')
      throw error
    }
  }
  return {
    create: (token: string | undefined, raw: unknown) => write(token, raw),
    update: (token: string | undefined, id: string, raw: unknown, match?: string) =>
      write(token, raw, id, match),
    deactivate(token: string | undefined, id: string, raw: unknown, match?: string) {
      const { reason } = parseInput(couponDeactivate, raw)
      return write(token, { status: 'inactive' }, id, match, reason)
    },
    async list(token: string | undefined, raw: unknown) {
      const input = parseInput(couponListQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          const filter = input.status ? { status: input.status } : {}
          const total = await models.coupons.countDocuments(filter).session(session)
          const rows = await models.coupons
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          return { data: rows.map(view), page: pageMeta(input, total) }
        },
        false,
      )
    },
    async history(token: string | undefined, couponId: string, raw: unknown) {
      parseInput(couponParams, { couponId })
      const input = parseInput(couponHistoryQuery, raw)
      return access.owned(
        token,
        async (_actor, session) => {
          await verify()
          if (!(await models.coupons.exists({ _id: couponId }).session(session)))
            throw new ApiError('NOT_FOUND')
          const filter = { couponId: new Types.ObjectId(couponId) }
          const total = await models.redemptions.countDocuments(filter).session(session)
          const rows = await models.redemptions
            .find(filter)
            .sort({ createdAt: -1, _id: -1 })
            .skip((input.page - 1) * input.pageSize)
            .limit(input.pageSize)
            .session(session)
          const data = rows.map((row) =>
            parseInput(couponHistory, {
              id: row._id.toHexString(),
              couponId,
              orderId: row.orderId.toHexString(),
              ...(row.userId ? { userId: row.userId.toHexString() } : {}),
              generation: row.generation,
              status: row.status,
              termsSnapshot: {
                code: row.termsSnapshot.code,
                type: row.termsSnapshot.type,
                value: row.termsSnapshot.value,
                version: row.termsSnapshot.version,
                discountPoisha: row.termsSnapshot.discountPoisha,
                eligibleLineIds: row.termsSnapshot.eligibleLineIds.map(String),
              },
              ...Object.fromEntries(
                (['heldAt', 'expiresAt', 'redeemedAt', 'releasedAt'] as const).flatMap((key) =>
                  row[key] ? [[key, row[key].toISOString()]] : [],
                ),
              ),
            }),
          )
          return { data, page: pageMeta(input, total) }
        },
        false,
      )
    },
  }
}
