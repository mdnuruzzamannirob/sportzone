import { z } from 'zod'
import { ConfigurationError } from '../../shared/errors/configuration-error.js'

type EmailOptions = {
  apiKey: string
  from: string
  timeoutMs: number
  recipientOverride?: string
}
const optionsSchema = z.strictObject({
  apiKey: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[\x21-\x7e]+$/),
  from: z.email().max(254),
  timeoutMs: z.int().min(1).max(60000),
  recipientOverride: z.email().max(254).optional(),
})
function validateEmailOptions(input: EmailOptions): Readonly<EmailOptions> {
  const result = optionsSchema.safeParse(input)
  if (!result.success) throw new ConfigurationError(['email_configuration'])
  return Object.freeze({
    apiKey: result.data.apiKey,
    from: result.data.from,
    timeoutMs: result.data.timeoutMs,
    ...(result.data.recipientOverride ? { recipientOverride: result.data.recipientOverride } : {}),
  })
}
const emailMessageSchema = z.strictObject({
  to: z.email().max(254),
  subject: z
    .string()
    .min(1)
    .max(200)
    .regex(/^[^\r\n]+$/),
  text: z.string().min(1).max(20000),
  idempotencyKey: z
    .string()
    .min(1)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/),
})

const emailAcceptanceSchema = z.object({
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/),
})

export type { EmailOptions }
export { emailAcceptanceSchema, emailMessageSchema, validateEmailOptions }
