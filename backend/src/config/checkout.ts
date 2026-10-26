import { z } from 'zod'
import { policyType } from '../modules/settings/policy.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'
import { loadDeliveryDeadlinePolicy } from './delivery.js'
export const checkoutOptions = z.strictObject({
  quoteTtlSeconds: z.int().min(1).max(86400),
  requiredPolicyTypes: z
    .array(policyType)
    .min(1)
    .max(7)
    .refine((v) => new Set(v).size === v.length && v.includes('terms')),
})
export type CheckoutOptions = z.infer<typeof checkoutOptions> & {
  deadline?: Awaited<ReturnType<typeof loadDeliveryDeadlinePolicy>>
}
export async function loadCheckoutOptions(
  env: NodeJS.ProcessEnv,
): Promise<CheckoutOptions | undefined> {
  if (env.CHECKOUT_QUOTES_ENABLED === undefined || env.CHECKOUT_QUOTES_ENABLED === 'false')
    return undefined
  try {
    if (
      env.CHECKOUT_QUOTES_ENABLED !== 'true' ||
      env.CUSTOMER_AUTH_ENABLED !== 'true' ||
      !/^[1-9]\d*$/.test(env.CHECKOUT_QUOTE_TTL_SECONDS ?? '')
    )
      throw new Error()
    const options = checkoutOptions.parse({
      quoteTtlSeconds: Number(env.CHECKOUT_QUOTE_TTL_SECONDS),
      requiredPolicyTypes: env.CHECKOUT_REQUIRED_POLICY_TYPES?.split(','),
    })
    return { ...options, deadline: await loadDeliveryDeadlinePolicy(env) }
  } catch {
    throw new ConfigurationError(['checkout_quote_configuration'])
  }
}
