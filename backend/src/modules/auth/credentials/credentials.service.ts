import { z } from 'zod'
import { accountDto } from './account.dto.js'
import { parseInput } from '../../../shared/middleware/validate.js'
import { ApiError } from '../../../shared/errors/app-error.js'
import type { RegistrationNotifications } from '../../notifications/notification.service.js'
import type { IdentityModels } from '../auth.model.js'
import type { SessionService, SessionKind } from '../sessions/session.service.js'
import type { BrowserSecurity } from '../sessions/browser-security.service.js'
import { hashPassword, newPasswordPolicy, verifyPassword } from './password.service.js'

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
  kind: SessionKind = 'customer',
) {
  const audience = kind === 'admin' ? 'admin' : 'storefront'
  return {
    async register(raw: unknown, context: string, csrf: string) {
      if (kind !== 'customer') throw new ApiError('FORBIDDEN')
      const input = parseInput(registrationInput, raw)
      const passwordHash = await hashPassword(input.password)
      try {
        return await security.consumeContext(audience, context, csrf, async (session) => {
          const user = new models.users({
            name: input.name,
            emailNormalized: input.email,
            passwordHash,
            role: kind,
            status: 'active',
          })
          await user.save({ session })
          await notifications.enqueue(
            { userId: user._id, email: input.email, name: input.name },
            session,
          )
          return { account: accountDto(user), verificationRequired: true }
        })
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error && error.code === 11000)
          throw new ApiError('STATE_CONFLICT')
        throw error
      }
    },
    async login(raw: unknown, context: string, csrf: string, previous?: string) {
      const input = parseInput(loginInput, raw)
      const user = await models.users
        .findOne({ emailNormalized: input.email, role: kind })
        .select('+passwordHash +securityRevision')
      const matches = await verifyPassword(input.password, user?.passwordHash)
      if (!matches || !user || user.status !== 'active') throw new ApiError('INVALID_CREDENTIALS')
      return security.consumeContext(audience, context, csrf, async (session) => {
        // A real conditional write serializes login with password/status/revision changes.
        const checked = await models.users.findOneAndUpdate(
          {
            _id: user._id,
            role: kind,
            status: 'active',
            passwordHash: user.passwordHash,
            securityRevision: user.securityRevision,
            updatedAt: user.updatedAt,
          },
          {
            $set: {
              updatedAt: new Date(Math.max(Date.now(), user.updatedAt.getTime() + 1)),
            },
          },
          { session, returnDocument: 'after', timestamps: false },
        )
        if (!checked) throw new ApiError('INVALID_CREDENTIALS')
        const issued = await sessions.issue(kind, checked._id, previous, session)
        return { account: accountDto(checked), issued }
      })
    },
    async current(token: string | undefined) {
      const identity = await sessions.authenticate(kind, token)
      const user = await models.users.findOne({
        _id: identity.userId,
        role: kind,
        status: 'active',
      })
      if (!user) throw new ApiError('AUTH_REQUIRED')
      return { account: accountDto(user) }
    },
    async logout(token: string | undefined) {
      return sessions.logout(kind, token)
    },
  }
}
export type CustomerService = ReturnType<typeof createCustomerService>
