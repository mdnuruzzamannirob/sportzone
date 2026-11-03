import { z } from 'zod'
import { ConfigurationError } from '../../shared/errors/configuration-error.js'

// Operator-controlled private scanner endpoint; no caller-selected host or executable.
const optionsSchema = z.strictObject({
  host: z.string().regex(/^[a-zA-Z0-9.:-]{1,253}$/),
  port: z.int().min(1).max(65535),
  timeoutMs: z.int().min(1).max(60000),
})
function validateClamAvOptions(input: unknown) {
  const parsed = optionsSchema.safeParse(input)
  if (!parsed.success) throw new ConfigurationError(['media_scanner_configuration'])
  return Object.freeze(parsed.data)
}

export { optionsSchema, validateClamAvOptions }
