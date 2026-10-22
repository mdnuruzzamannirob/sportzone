import { Types, type ClientSession } from 'mongoose'
import { parseInput } from '../../shared/middleware/validate.js'
import { ApiError } from '../../shared/errors/app-error.js'
import type { AddressCoverage } from '../delivery/delivery-coverage.service.js'
import type { CustomerAccountAccess, CustomerProfile } from '../auth/customer-account.service.js'
import {
  profilePatch,
  addressInput,
  addressPatch,
  addressId,
  deletionInput,
} from './customer.schema.js'

const addressDto = (address: CustomerProfile['addresses'][number]) => ({
  ...address,
})
export function createProfileService(
  access: CustomerAccountAccess,
  coverage: AddressCoverage,
  clock: () => Date = () => new Date(),
) {
  const owned = access.owned
  async function supported(
    address: { districtKey: string; areaKey: string },
    session: ClientSession,
  ) {
    if (!(await coverage.supports(address.districtKey, address.areaKey, session)))
      throw new ApiError('UNSUPPORTED_DELIVERY_AREA')
  }
  function find(user: CustomerProfile, id: string) {
    const parsed = parseInput(addressId, id)
    const result = user.addresses.find((item) => item.id === parsed)
    if (!result) throw new ApiError('NOT_FOUND')
    return result
  }
  return {
    read(token: string | undefined) {
      return owned(token, async (_user, { view }) => view(), false)
    },
    patch(token: string | undefined, raw: unknown) {
      const input = parseInput(profilePatch, raw)
      return owned(token, async (user, { save, view }) => {
        if (input.name !== undefined) user.name = input.name
        if (input.phone !== undefined) user.phone = input.phone
        await save()
        return view()
      })
    },
    list(token: string | undefined) {
      return owned(token, async (user) => user.addresses.map(addressDto), false)
    },
    add(token: string | undefined, raw: unknown) {
      const input = parseInput(addressInput, raw)
      return owned(token, async (user, { transaction: session, save }) => {
        if (user.addresses.length >= 10) throw new ApiError('STATE_CONFLICT')
        await supported(input, session)
        const id = new Types.ObjectId()
        const { addressLine2, ...fields } = input
        user.addresses.push({
          ...fields,
          ...(addressLine2 !== undefined ? { addressLine2 } : {}),
          id: id.toHexString(),
          isDefault: false,
        })
        await save()
        return addressDto(find(user, id.toHexString()))
      })
    },
    edit(token: string | undefined, id: string, raw: unknown) {
      const input = parseInput(addressPatch, raw)
      return owned(token, async (user, { transaction: session, save }) => {
        const current = find(user, id)
        const { isDefault, ...changes } = input
        const { id: _id, isDefault: _default, ...stored } = addressDto(current)
        const merged = parseInput(addressInput, { ...stored, ...changes })
        await supported(merged, session)
        Object.assign(current, merged)
        if (isDefault === true)
          for (const item of user.addresses) item.isDefault = item.id === current.id
        else if (isDefault === false) current.isDefault = false
        await save()
        return addressDto(current)
      })
    },
    remove(token: string | undefined, id: string) {
      return owned(token, async (user, { save }) => {
        const current = find(user, id)
        user.addresses = user.addresses.filter((item) => item.id !== current.id)
        await save()
      })
    },
    setDefault(token: string | undefined, id: string) {
      return owned(token, async (user, { transaction: session, save }) => {
        const current = find(user, id)
        await supported(current, session)
        for (const item of user.addresses) item.isDefault = item.id === current.id
        await save()
        return addressDto(current)
      })
    },
    requestDeletion(token: string | undefined, raw: unknown) {
      const input = parseInput(deletionInput, raw)
      return owned(token, async (user, { save }) => {
        if (!user.emailVerified) throw new ApiError('FORBIDDEN')
        if (!user.deletionRequest) {
          const now = clock()
          user.deletionRequest = {
            id: new Types.ObjectId().toHexString(),
            requestedAt: now,
            verifiedAt: now,
            status: 'requested',
            ...(input.reason !== undefined ? { reason: input.reason } : {}),
          }
          await save()
        }
        const request = user.deletionRequest
        if (!request) throw new Error('Deletion request persistence unavailable.')
        return { requestId: request.id, status: request.status }
      })
    },
  }
}
export type ProfileService = ReturnType<typeof createProfileService>
