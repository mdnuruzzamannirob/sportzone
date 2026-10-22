import { z } from 'zod'
import type { IdentityClient } from '../auth/auth.api'
import { accountSchema, addressSchema } from '../auth/auth.schema'

export function createAccountClient(api: Pick<IdentityClient, 'mutate'>) {
  return {
    saveProfile: (input: unknown) => api.mutate('/me', input, z.unknown(), 'session', 'PATCH'),
    saveAddress: (id: string | undefined, input: unknown) =>
      api.mutate(
        id ? `/me/addresses/${id}` : '/me/addresses',
        input,
        addressSchema,
        'session',
        id ? 'PATCH' : 'POST',
      ),
    makeDefaultAddress: (id: string) =>
      api.mutate(`/me/addresses/${id}/default`, {}, z.unknown(), 'session'),
    removeAddress: (id: string) =>
      api.mutate(`/me/addresses/${id}`, {}, z.unknown(), 'session', 'DELETE'),
    changePassword: (input: unknown) =>
      api.mutate('/me/password-change', input, z.object({ changed: z.literal(true) }), 'session'),
    requestEmailChange: (input: unknown) =>
      api.mutate(
        '/me/email-changes',
        input,
        z.object({ verificationSent: z.literal(true) }),
        'session',
      ),
    confirmEmailChange: (input: unknown) =>
      api.mutate('/me/email-changes/confirm', input, accountSchema, 'session'),
  }
}
