import { z } from 'zod'
import { readProtectedFile } from '../shared/protected-file.js'
import { claimId as id, claimText } from '../modules/returns/return.schema.js'
import { ConfigurationError } from '../shared/errors/configuration-error.js'

export const returnOperationsOptions = z.strictObject({
  policyVersion: z.string().trim().min(1).max(100),
  exceptions: z
    .array(
      z.strictObject({
        orderId: id,
        claimType: z.enum(['physical_return', 'shortage']),
        exceptionBasis: claimText,
      }),
    )
    .max(1000),
})
export type ReturnOperationsOptions = z.output<typeof returnOperationsOptions>
export async function loadReturnOperationsOptions(
  env: NodeJS.ProcessEnv,
): Promise<ReturnOperationsOptions | undefined> {
  if (env.RETURN_OPERATIONS_ENABLED === undefined || env.RETURN_OPERATIONS_ENABLED === 'false')
    return undefined
  try {
    if (
      env.RETURN_OPERATIONS_ENABLED !== 'true' ||
      !['local', 'test'].includes(env.APP_ENV ?? '') ||
      env.CUSTOMER_AUTH_ENABLED !== 'true' ||
      env.ADMIN_AUTH_ENABLED !== 'true'
    )
      throw new Error()
    // Owner-delegated PRD development baseline, not a legal approval or published policy.
    const options = env.RETURN_POLICY_FILE
      ? returnOperationsOptions.parse(
          JSON.parse((await readProtectedFile(env.RETURN_POLICY_FILE, 1000000)).toString('utf8')),
        )
      : { policyVersion: 'sportzone-returns-v1', exceptions: [] }
    if (
      new Set(options.exceptions.map((row) => `${row.orderId}:${row.claimType}`)).size !==
      options.exceptions.length
    )
      throw new Error()
    return options
  } catch {
    throw new ConfigurationError(['return_operations_configuration'])
  }
}
