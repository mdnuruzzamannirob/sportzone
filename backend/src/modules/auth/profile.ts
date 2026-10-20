import { parsePhoneNumberWithError } from 'libphonenumber-js/max'
import { Types, type ClientSession, type Connection } from 'mongoose'
import { z } from 'zod'
import { inTransaction } from '../../db/transaction.js'
import { parseInput } from '../../middleware/validation.js'
import { ApiError } from '../../shared/errors.js'
import type { AddressCoverage } from '../settings/coverage.js'
import { accountDto, addressDto } from './account-dto.js'
import type { IdentityModels } from './models.js'
import type { SessionService } from './sessions.js'

const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
export const bangladeshPhone = z
  .string()
  .max(64)
  .transform((value, ctx) => {
    try {
      const number = parsePhoneNumberWithError(value, {
        defaultCountry: 'BD',
        extract: false,
      })
      if (number.country !== 'BD' || !number.isValid() || number.ext)
        throw new Error('Invalid phone')
      return String(number.number)
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Invalid Bangladesh phone' })
      return z.NEVER
    }
  })
export const profilePatch = z
  .strictObject({
    name: text(120).optional(),
    phone: bangladeshPhone.optional(),
  })
  .refine((value) => Object.values(value).some((v) => v !== undefined))
const key = text(64).refine((value) => !value.includes(':') && value !== '*')
export const addressInput = z.strictObject({
  recipient: text(120),
  phone: bangladeshPhone,
  districtKey: key,
  areaKey: key,
  street: text(300),
  addressLine2: text(300).optional(),
})
export const addressPatch = addressInput
  .extend({ isDefault: z.boolean() })
  .partial()
  .refine((value) => Object.values(value).some((v) => v !== undefined))
export const addressId = z.string().regex(/^[a-f0-9]{24}$/)
export const deletionInput = z.strictObject({ reason: text(2000).optional() })
type User = InstanceType<IdentityModels['users']>
export function createProfileService(
  connection: Connection,
  models: IdentityModels,
  sessions: SessionService,
  coverage: AddressCoverage,
  clock: () => Date = () => new Date(),
) {
  async function owned<T>(
    token: string | undefined,
    work: (user: User, session: ClientSession) => Promise<T>,
  ) {
    const identity = await sessions.authenticate('customer', token)
    return inTransaction(connection, async (session) => {
      const credential = await models.sessions
        .findOne({
          _id: identity.sessionId,
          userId: identity.userId,
          kind: 'customer',
          revokedAt: { $exists: false },
          expiresAt: { $gt: clock() },
        })
        .select('+securityRevisionAtIssue')
        .session(session)
      if (!credential || typeof credential.securityRevisionAtIssue !== 'number')
        throw new ApiError('AUTH_REQUIRED')
      const user = await models.users
        .findOne({
          _id: identity.userId,
          role: 'customer',
          status: 'active',
          securityRevision: credential.securityRevisionAtIssue,
        })
        .session(session)
      if (!user) throw new ApiError('AUTH_REQUIRED')
      return work(user, session)
    })
  }
  async function supported(
    address: { districtKey: string; areaKey: string },
    session: ClientSession,
  ) {
    if (
      !(await coverage.supports(address.districtKey, address.areaKey, session))
    )
      throw new ApiError('UNSUPPORTED_DELIVERY_AREA')
  }
  function find(user: User, id: string) {
    const parsed = parseInput(addressId, id)
    const result = user.addresses.find(
      (item) => item.id.toHexString() === parsed,
    )
    if (!result) throw new ApiError('NOT_FOUND')
    return result
  }
  return {
    read(token: string | undefined) {
      return owned(token, async (user) => accountDto(user))
    },
    patch(token: string | undefined, raw: unknown) {
      const input = parseInput(profilePatch, raw)
      return owned(token, async (user, session) => {
        if (input.name !== undefined) user.name = input.name
        if (input.phone !== undefined) user.phone = input.phone
        await user.save({ session })
        return accountDto(user)
      })
    },
    list(token: string | undefined) {
      return owned(token, async (user) => user.addresses.map(addressDto))
    },
    add(token: string | undefined, raw: unknown) {
      const input = parseInput(addressInput, raw)
      return owned(token, async (user, session) => {
        if (user.addresses.length >= 10) throw new ApiError('STATE_CONFLICT')
        await supported(input, session)
        const id = new Types.ObjectId()
        user.addresses.push({ ...input, id, isDefault: false })
        await user.save({ session })
        return addressDto(find(user, id.toHexString()))
      })
    },
    edit(token: string | undefined, id: string, raw: unknown) {
      const input = parseInput(addressPatch, raw)
      return owned(token, async (user, session) => {
        const current = find(user, id)
        const { isDefault, ...changes } = input
        const { id: _id, isDefault: _default, ...stored } = addressDto(current)
        const merged = parseInput(addressInput, { ...stored, ...changes })
        await supported(merged, session)
        Object.assign(current, merged)
        if (isDefault === true)
          for (const item of user.addresses)
            item.isDefault = item.id.equals(current.id)
        else if (isDefault === false) current.isDefault = false
        await user.save({ session })
        return addressDto(current)
      })
    },
    remove(token: string | undefined, id: string) {
      return owned(token, async (user, session) => {
        const current = find(user, id)
        user.addresses.pull({ id: current.id })
        await user.save({ session })
      })
    },
    setDefault(token: string | undefined, id: string) {
      return owned(token, async (user, session) => {
        const current = find(user, id)
        await supported(current, session)
        for (const item of user.addresses)
          item.isDefault = item.id.equals(current.id)
        await user.save({ session })
        return addressDto(current)
      })
    },
    requestDeletion(token: string | undefined, raw: unknown) {
      const input = parseInput(deletionInput, raw)
      return owned(token, async (user, session) => {
        if (!user.emailVerifiedAt) throw new ApiError('FORBIDDEN')
        if (!user.deletionRequest) {
          const now = clock()
          user.deletionRequest = {
            id: new Types.ObjectId(),
            requestedAt: now,
            verifiedAt: now,
            status: 'requested',
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          }
          await user.save({ session })
        }
        const request = user.deletionRequest
        if (!request)
          throw new Error('Deletion request persistence unavailable.')
        return { requestId: request.id.toHexString(), status: request.status }
      })
    },
  }
}
export type ProfileService = ReturnType<typeof createProfileService>
