import { loadNotificationWorker } from '../../src/config/notifications.js'
import { describe, expect, it, vi } from 'vitest'
import {
  createResendAdapter,
  validateEmailOptions,
} from '../../src/providers/email/resend.client.js'
import { validateRetryPolicy } from '../../src/modules/notifications/notification.schema.js'
const settings = {
  apiKey: 'synthetic-provider-key',
  from: 'sender@example.test',
  timeoutMs: 1000,
}
const message = {
  to: 'recipient@example.test',
  subject: 'Synthetic subject',
  text: 'Synthetic message',
  idempotencyKey: 'synthetic-event-key',
}
describe('server-only email adapter and policy', () => {
  it('uses a fixed origin, bearer key, no redirects and stable idempotency header', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: 'synthetic-message-id' }), {
        status: 200,
      }),
    )
    expect(await createResendAdapter(settings, transport).send(message)).toEqual({
      kind: 'accepted',
      providerMessageId: 'synthetic-message-id',
    })
    expect(transport).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST',
        redirect: 'error',
        headers: expect.objectContaining({
          Authorization: 'Bearer synthetic-provider-key',
          'Idempotency-Key': message.idempotencyKey,
        }),
      }),
    )
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
      from: settings.from,
      to: [message.to],
      subject: message.subject,
      text: message.text,
    })
  })
  it.each([400, 401, 403, 404, 422])(
    'classifies explicit HTTP %s rejection without exposing provider body',
    async (status) => {
      const transport = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('sensitive-provider-response', { status }))
      const outcome = await createResendAdapter(settings, transport).send(message)
      expect(outcome).toEqual({
        kind: 'rejected',
        retryable: false,
        code: 'PROVIDER_REJECTED',
      })
      expect(JSON.stringify(outcome)).not.toContain('sensitive')
    },
  )
  it('retries explicit rate-limit rejection only', async () => {
    const adapter = createResendAdapter(
      settings,
      vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 })),
    )
    expect(await adapter.send(message)).toEqual({
      kind: 'rejected',
      retryable: true,
      code: 'PROVIDER_RATE_LIMIT',
    })
  })
  it.each([408, 409, 500, 503, 307])(
    'preserves uncertainty for HTTP %s rather than asserting no send',
    async (status) => {
      const adapter = createResendAdapter(
        settings,
        vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status })),
      )
      expect(await adapter.send(message)).toEqual({
        kind: 'uncertain',
        code: 'PROVIDER_UNCERTAIN',
      })
    },
  )
  it.each(['not-json', '{}', '{"id":"bad\\nidentifier"}', 'x'.repeat(8193)])(
    'bounds and redacts malformed acceptance payload',
    async (body) => {
      const adapter = createResendAdapter(
        settings,
        vi.fn<typeof fetch>().mockResolvedValue(new Response(body, { status: 200 })),
      )
      expect(await adapter.send(message)).toEqual({
        kind: 'uncertain',
        code: 'PROVIDER_UNCERTAIN',
      })
    },
  )
  it('does not expose network faults, credentials or recipient data', async () => {
    const adapter = createResendAdapter(
      settings,
      vi.fn<typeof fetch>().mockRejectedValue(new Error(`${settings.apiKey}:${message.to}`)),
    )
    expect(await adapter.send(message)).toEqual({
      kind: 'uncertain',
      code: 'PROVIDER_UNCERTAIN',
    })
  })
  it('rejects invalid input before transport and applies configured test inbox override', async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(new Response('{"id":"synthetic-id"}'))
    const adapter = createResendAdapter(
      { ...settings, recipientOverride: 'approved-test@example.test' },
      transport,
    )
    expect((await adapter.send({ ...message, subject: 'Injected\r\nheader' })).kind).toBe(
      'rejected',
    )
    expect(transport).not.toHaveBeenCalled()
    await adapter.send(message)
    expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body)).to).toEqual([
      'approved-test@example.test',
    ])
  })
  it.each([{ apiKey: '' }, { apiKey: 'bad\nheader' }, { from: 'bad' }, { timeoutMs: 60001 }])(
    'fails closed on invalid provider configuration %j',
    (change) => {
      expect(() => validateEmailOptions({ ...settings, ...change })).toThrow(
        'Invalid backend configuration.',
      )
    },
  )
  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 11 },
    { batchSize: 101 },
    { claimTtlMs: 0 },
    { maxDelayMs: 99 },
  ])('bounds worker policy %j', (change) => {
    expect(() =>
      validateRetryPolicy({
        maxAttempts: 3,
        baseDelayMs: 100,
        maxDelayMs: 1000,
        claimTtlMs: 10000,
        batchSize: 5,
        ...change,
      }),
    ).toThrow()
  })
  it('requires explicit activation, nonproduction test routing and a lease longer than HTTP timeout', () => {
    const env = {
      APP_ENV: 'test',
      EMAIL_MODE: 'test',
      EMAIL_DELIVERY_ENABLED: 'true',
      EMAIL_PROVIDER: 'resend',
      RESEND_API_KEY: 'synthetic-key',
      EMAIL_FROM: 'sender@example.test',
      EMAIL_TEST_RECIPIENT: 'approved-test@example.test',
      EMAIL_TIMEOUT_MS: '1000',
      EMAIL_MAX_ATTEMPTS: '3',
      EMAIL_RETRY_BASE_MS: '100',
      EMAIL_RETRY_MAX_MS: '1000',
      EMAIL_CLAIM_TTL_MS: '10000',
      EMAIL_BATCH_SIZE: '5',
    }
    expect(loadNotificationWorker(env).settings.maxAttempts).toBe(3)
    expect(loadNotificationWorker(env).commerceEnabled).toBe(false)
    expect(
      loadNotificationWorker({ ...env, ORDER_NOTIFICATIONS_ENABLED: 'true' }).commerceEnabled,
    ).toBe(true)
    expect(() =>
      loadNotificationWorker({ ...env, ORDER_NOTIFICATIONS_ENABLED: 'true', APP_ENV: 'staging' }),
    ).toThrow()
    expect(() =>
      loadNotificationWorker({ ...env, ORDER_NOTIFICATIONS_ENABLED: 'invalid' }),
    ).toThrow()
    for (const change of [
      { EMAIL_DELIVERY_ENABLED: 'false' },
      { EMAIL_MODE: 'live' },
      { EMAIL_TEST_RECIPIENT: '' },
      { EMAIL_CLAIM_TTL_MS: '1500' },
      { EMAIL_BATCH_SIZE: '' },
      { APP_ENV: 'production' },
    ])
      expect(() => loadNotificationWorker({ ...env, ...change })).toThrow(
        'Invalid backend configuration.',
      )
    expect(
      loadNotificationWorker({
        ...env,
        APP_ENV: 'production',
        EMAIL_MODE: 'live',
      }).settings.maxAttempts,
    ).toBe(3)
  })
})
