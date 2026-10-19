import { z } from 'zod'
import { parseInput } from '../../middleware/validation.js'
import { ApiError } from '../../shared/errors.js'
import type { RegistrationNotifications } from '../notifications/registration.js'
import type { IdentityModels } from './models.js'
import type { SessionService } from './sessions.js'
import type { BrowserSecurity } from './browser-security.js'
import { hashPassword, newPasswordPolicy, verifyPassword } from './passwords.js'

const email = z.string().trim().toLowerCase().pipe(z.email().max(254))
export const registrationInput = z.strictObject({
  name: z
    .string()
    .trim()
    .min(1)
    .refine((s) => [...s].length <= 120),
  email,
  password: newPasswordPolicy,
})
export const loginInput = z.strictObject({
  email,
  password: z
    .string()
    .min(1)
    .refine((s) => Buffer.byteLength(s) <= 4096 && !/[\uD800-\uDFFF]/u.test(s)),
})
export function createCustomerService(
  models: IdentityModels,
  sessions: SessionService,
  security: BrowserSecurity,
  notifications: RegistrationNotifications,
) {
  const account = (user: InstanceType<typeof models.users>) => ({
    id: user._id.toHexString(),
    name: user.name,
    email: user.emailNormalized,
    ...(user.phone ? { phone: user.phone } : {}),
    emailVerified: Boolean(user.emailVerifiedAt),
    addresses: user.addresses.map((address) => ({
      id: address.id.toHexString(),
      recipient: address.recipient,
      phone: address.phone,
      districtKey: address.districtKey,
      areaKey: address.areaKey,
      street: address.street,
      ...(address.addressLine2 ? { addressLine2: address.addressLine2 } : {}),
      isDefault: address.isDefault,
    })),
    status: user.status,
  })
  return {
    async register(raw: unknown, context: string, csrf: string) {
      const input = parseInput(registrationInput, raw)
      const passwordHash = await hashPassword(input.password)
      try {
        return await security.consumeContext(
          'storefront',
          context,
          csrf,
          async (session) => {
            const user = new models.users({
              name: input.name,
              emailNormalized: input.email,
              passwordHash,
              role: 'customer',
              status: 'active',
            })
            await user.save({ session })
            await notifications.enqueue(
              { userId: user._id, email: input.email, name: input.name },
              session,
            )
            return { account: account(user), verificationRequired: true }
          },
        )
      } catch (error) {
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          error.code === 11000
        )
          throw new ApiError('STATE_CONFLICT')
        throw error
      }
    },
    async login(
      raw: unknown,
      context: string,
      csrf: string,
      previous?: string,
    ) {
      const input = parseInput(loginInput, raw)
      const user = await models.users
        .findOne({ emailNormalized: input.email, role: 'customer' })
        .select('+passwordHash +securityRevision')
      const matches = await verifyPassword(input.password, user?.passwordHash)
      if (!matches || !user || user.status !== 'active')
        throw new ApiError('INVALID_CREDENTIALS')
      return security.consumeContext(
        'storefront',
        context,
        csrf,
        async (session) => {
          // A real conditional write serializes login with password/status/revision changes.
          const checked = await models.users.findOneAndUpdate(
            {
              _id: user._id,
              role: 'customer',
              status: 'active',
              passwordHash: user.passwordHash,
              securityRevision: user.securityRevision,
              updatedAt: user.updatedAt,
            },
            {
              $set: {
                updatedAt: new Date(
                  Math.max(Date.now(), user.updatedAt.getTime() + 1),
                ),
              },
            },
            { session, returnDocument: 'after', timestamps: false },
          )
          if (!checked) throw new ApiError('INVALID_CREDENTIALS')
          const issued = await sessions.issue(
            'customer',
            checked._id,
            previous,
            session,
          )
          return { account: account(checked), issued }
        },
      )
    },
    async current(token: string | undefined) {
      const identity = await sessions.authenticate('customer', token)
      const user = await models.users.findOne({
        _id: identity.userId,
        role: 'customer',
        status: 'active',
      })
      if (!user) throw new ApiError('AUTH_REQUIRED')
      return { account: account(user) }
    },
    async logout(token: string | undefined) {
      return sessions.logout('customer', token)
    },
  }
}
export type CustomerService = ReturnType<typeof createCustomerService>
