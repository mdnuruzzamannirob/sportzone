import { z } from 'zod'
import { assertOutsideTransaction } from '../../db/transaction.js'
import { ConfigurationError } from '../../config/environment.js'

export type DeliveryOutcome =
  | { kind: 'accepted'; providerMessageId: string }
  | {
      kind: 'rejected'
      retryable: boolean
      code: 'PROVIDER_RATE_LIMIT' | 'PROVIDER_REJECTED'
    }
  | { kind: 'uncertain'; code: 'PROVIDER_UNCERTAIN' }
export type EmailMessage = {
  to: string
  subject: string
  text: string
  idempotencyKey: string
}
export type EmailAdapter = {
  send(message: EmailMessage): Promise<DeliveryOutcome>
}
export type EmailOptions = {
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
export function validateEmailOptions(
  input: EmailOptions,
): Readonly<EmailOptions> {
  const result = optionsSchema.safeParse(input)
  if (!result.success) throw new ConfigurationError(['email_configuration'])
  return Object.freeze({
    apiKey: result.data.apiKey,
    from: result.data.from,
    timeoutMs: result.data.timeoutMs,
    ...(result.data.recipientOverride
      ? { recipientOverride: result.data.recipientOverride }
      : {}),
  })
}
// Fixed origin, no caller-controlled URL or redirect. Tests inject a local fetch transport.
export function createResendAdapter(
  settings: EmailOptions,
  transport: typeof fetch = fetch,
): EmailAdapter {
  const options = validateEmailOptions(settings)
  return {
    async send(input) {
      assertOutsideTransaction()
      if (
        !z
          .strictObject({
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
          .safeParse(input).success
      )
        return { kind: 'rejected', retryable: false, code: 'PROVIDER_REJECTED' }
      try {
        const response = await transport('https://api.resend.com/emails', {
          method: 'POST',
          redirect: 'error',
          signal: AbortSignal.timeout(options.timeoutMs),
          headers: {
            Authorization: `Bearer ${options.apiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': input.idempotencyKey,
          },
          body: JSON.stringify({
            from: options.from,
            to: [options.recipientOverride ?? input.to],
            subject: input.subject,
            text: input.text,
          }),
        })
        if (response.status === 429) {
          await response.body?.cancel()
          return {
            kind: 'rejected',
            retryable: true,
            code: 'PROVIDER_RATE_LIMIT',
          }
        }
        if ([400, 401, 403, 404, 422].includes(response.status)) {
          await response.body?.cancel()
          return {
            kind: 'rejected',
            retryable: false,
            code: 'PROVIDER_REJECTED',
          }
        }
        if (response.status < 200 || response.status >= 300) {
          await response.body?.cancel()
          return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
        }
        const reader = response.body?.getReader()
        if (!reader) return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
        const chunks: Uint8Array[] = []
        let bytes = 0
        for (;;) {
          const chunk = await reader.read()
          if (chunk.done) break
          bytes += chunk.value.length
          if (bytes > 8192) {
            await reader.cancel()
            return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
          }
          chunks.push(chunk.value)
        }
        const body: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
        const parsed = z
          .object({
            id: z
              .string()
              .min(1)
              .max(128)
              .regex(/^[A-Za-z0-9_-]+$/),
          })
          .safeParse(body)
        return parsed.success
          ? { kind: 'accepted', providerMessageId: parsed.data.id }
          : { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
      } catch {
        return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
      }
    },
  }
}
