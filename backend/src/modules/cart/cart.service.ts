import { Types, type Connection } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import type { CustomerAccountAccess } from '../auth/customer-account.service.js'
import type { catalogService } from '../catalog/catalog.service.js'
import { cartModel } from './cart.model.js'
import { verifyCartPersistence } from './cart.persistence.js'
import {
  cartMerge,
  cartMergeResponse,
  cartQuantity,
  cartResponse,
  variantParams,
} from './cart.schema.js'

export function cartService(
  connection: Connection,
  access: CustomerAccountAccess,
  catalog: Pick<ReturnType<typeof catalogService>, 'cartSelections'>,
  clock: () => Date = () => new Date(),
) {
  const carts = cartModel(connection)
  async function perform(
    token: string | undefined,
    mutation?: { variantId: string; quantity?: number },
    merge?: { variantId: string; quantity: number }[],
  ) {
    return access.owned(
      token,
      async (user, { transaction }) => {
        try {
          await verifyCartPersistence(connection)
        } catch {
          throw new ApiError('SERVICE_UNAVAILABLE')
        }
        const userId = new Types.ObjectId(user.id)
        let cart = await carts.findOne({ userId }).session(transaction)
        const errors: { variantId: string; code: 'BUSINESS_RULE_VIOLATION' }[] = []
        if (merge) {
          if (!cart) cart = new carts({ userId, items: [], revision: 0 })
          const quantities = new Map<string, number>()
          for (const line of merge)
            quantities.set(
              line.variantId,
              Math.max(quantities.get(line.variantId) ?? 0, line.quantity),
            )
          const eligible = await catalog.cartSelections([...quantities.keys()], transaction)
          for (const [variantId, quantity] of quantities) {
            if (!eligible.has(variantId)) {
              errors.push({ variantId, code: 'BUSINESS_RULE_VIOLATION' })
              continue
            }
            const current = cart.items.find((line) => line.variantId.toHexString() === variantId)
            if (current) current.quantity = Math.max(current.quantity, quantity)
            else {
              if (cart.items.length >= 100) throw new ApiError('BUSINESS_RULE_VIOLATION')
              cart.items.push({
                variantId: new Types.ObjectId(variantId),
                quantity,
                addedAt: clock(),
              })
            }
          }
          if (cart.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
          cart.revision += 1
          await cart.save({ session: transaction })
        }
        if (mutation) {
          if (!cart) cart = new carts({ userId, items: [], revision: 0 })
          const existing = cart.items.findIndex(
            (i) => i.variantId.toHexString() === mutation.variantId,
          )
          if (mutation.quantity !== undefined) {
            const selected = await catalog.cartSelections([mutation.variantId], transaction)
            if (!selected.has(mutation.variantId)) throw new ApiError('BUSINESS_RULE_VIOLATION')
            if (existing < 0 && cart.items.length >= 100)
              throw new ApiError('BUSINESS_RULE_VIOLATION')
            const current = cart.items[existing]
            if (current) current.quantity = mutation.quantity
            else
              cart.items.push({
                variantId: new Types.ObjectId(mutation.variantId),
                quantity: mutation.quantity,
                addedAt: clock(),
              })
          } else if (existing >= 0) cart.items.splice(existing, 1)
          if (cart.revision >= Number.MAX_SAFE_INTEGER) throw new ApiError('STATE_CONFLICT')
          cart.revision += 1
          await cart.save({ session: transaction })
        }
        const selected = await catalog.cartSelections(
          cart?.items.map((i) => i.variantId.toHexString()) ?? [],
          transaction,
        )
        let subtotal = 0
        const items = (cart?.items ?? []).map((line) => {
          const variantId = line.variantId.toHexString(),
            value = selected.get(variantId)
          if (value) {
            const total = value.estimatedUnitPoisha * line.quantity
            if (!Number.isSafeInteger(total) || !Number.isSafeInteger(subtotal + total))
              throw new ApiError('BUSINESS_RULE_VIOLATION')
            subtotal += total
          }
          return {
            variantId,
            quantity: line.quantity,
            product: value?.product ?? null,
            estimatedUnitPoisha: value?.estimatedUnitPoisha ?? null,
            availability:
              value && value.availableQty >= line.quantity ? 'available' : 'unavailable',
          }
        })
        return parseInput(merge ? cartMergeResponse : cartResponse, {
          ...(merge ? { errors } : {}),
          items,
          estimatedSubtotalPoisha: subtotal,
          revision: cart?.revision ?? 0,
        })
      },
      Boolean(mutation || merge),
    )
  }
  return {
    merge(token: string | undefined, raw: unknown) {
      const input = parseInput(cartMerge, raw)
      return perform(token, undefined, input.items)
    },
    read(token: string | undefined) {
      return perform(token)
    },
    put(token: string | undefined, variantId: string, raw: unknown) {
      const id = parseInput(variantParams, { variantId }),
        input = parseInput(cartQuantity, raw)
      return perform(token, { variantId: id.variantId, quantity: input.quantity })
    },
    remove(token: string | undefined, variantId: string) {
      const id = parseInput(variantParams, { variantId })
      return perform(token, { variantId: id.variantId })
    },
  }
}
