import {
  emailAcceptanceSchema,
  emailMessageSchema,
  validateEmailOptions,
  type EmailOptions,
} from './resend.schema.js'
export { validateEmailOptions, type EmailOptions } from './resend.schema.js'
import type { EmailAdapter } from '../../modules/notifications/notification.types.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'

// Fixed origin, no caller-controlled URL or redirect. Tests inject a local fetch transport.
export function createResendAdapter(
  settings: EmailOptions,
  transport: typeof fetch = fetch,
): EmailAdapter {
  const options = validateEmailOptions(settings)
  return {
    async send(input) {
      assertOutsideTransaction()
      if (!emailMessageSchema.safeParse(input).success)
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
        const parsed = emailAcceptanceSchema.safeParse(body)
        return parsed.success
          ? { kind: 'accepted', providerMessageId: parsed.data.id }
          : { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
      } catch {
        return { kind: 'uncertain', code: 'PROVIDER_UNCERTAIN' }
      }
    },
  }
}
