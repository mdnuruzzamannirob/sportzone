import { z } from 'zod'
import { createApiClient } from '../../lib/api-client'
import { ApiError } from '../../lib/api-error'
import { sessionSchema } from './auth.schema'

export function createIdentityClient(
  origin: string | undefined,
  realm: 'customer' | 'admin',
  clearPrivate: () => void,
  transport: typeof fetch = (...args) => fetch(...args),
) {
  const api = createApiClient(origin, realm, clearPrivate, transport)
  return {
    ...api,
    async session(signal?: AbortSignal) {
      try {
        return (await api.get(`${api.prefix}/session`, sessionSchema, { signal })).account
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null
        throw error
      }
    },
    login: (input: unknown) => api.mutate(`${api.prefix}/login`, input, sessionSchema),
    logout: () => api.mutate(`${api.prefix}/logout`, {}, z.object({ revoked: z.literal(true) })),
    requestPasswordReset: (input: unknown) =>
      api.mutate(`${api.prefix}/password-resets`, input, z.object({ accepted: z.literal(true) })),
    confirmPasswordReset: (input: Record<string, unknown>) =>
      api.mutate(
        `${api.prefix}/password-resets/confirm`,
        { token: input.token, newPassword: input.newPassword },
        z.object({ reset: z.literal(true) }),
      ),
    register: (input: unknown) =>
      api.mutate('/auth/register', input, z.object({ verificationRequired: z.boolean() })),
  }
}
export type IdentityClient = ReturnType<typeof createIdentityClient>
