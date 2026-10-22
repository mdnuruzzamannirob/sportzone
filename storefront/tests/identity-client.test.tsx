import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createIdentityClient } from '../src/features/auth/auth.api'
import { ApiError } from '../src/lib/api-error'
const data = (value: unknown, status = 200) =>
  new Response(JSON.stringify({ data: value }), { status })
const csrf = { csrfToken: 'synthetic-csrf' }
describe('identity client privacy and mutation boundaries', () => {
  it('disables missing/untrusted configuration without guessing a host', async () => {
    const transport = vi.fn()
    const api = createIdentityClient(undefined, 'customer', () => {}, transport)
    await expect(api.session()).rejects.toBeInstanceOf(ApiError)
    expect(transport).not.toHaveBeenCalled()
    expect(
      createIdentityClient('https://user:secret@example.test', 'admin', () => {}).configured,
    ).toBe(false)
  })
  it.each(['customer', 'admin'] as const)(
    'uses isolated %s CSRF and credentialed uncached requests without retaining passwords',
    async (realm) => {
      const transport = vi
        .fn()
        .mockResolvedValueOnce(data(csrf))
        .mockResolvedValueOnce(data({ ok: true }))
      const api = createIdentityClient('https://api.example.test', realm, () => {}, transport)
      await api.mutate(
        `${api.prefix}/login`,
        { email: 'synthetic@example.test', password: 'synthetic password' },
        z.object({ ok: z.boolean() }),
      )
      expect(transport.mock.calls[0]?.[0]).toBe(
        `https://api.example.test/api/v1${realm === 'admin' ? '/admin/auth' : '/auth'}/csrf?sessionKind=context`,
      )
      expect(transport.mock.calls[1]?.[1]).toMatchObject({
        credentials: 'include',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        headers: { 'X-CSRF-Token': 'synthetic-csrf' },
      })
    },
  )
  it('refreshes customer session CSRF and sends the exact editable payload', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(data(csrf))
      .mockResolvedValueOnce(data({ saved: true }))
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    await api.mutate(
      '/me',
      { name: 'Synthetic' },
      z.object({ saved: z.boolean() }),
      'session',
      'PATCH',
    )
    expect(transport.mock.calls[0]?.[0]).toContain('sessionKind=customer')
    expect(transport.mock.calls[1]?.[1].body).toBe('{"name":"Synthetic"}')
  })
  it('never automatically retries a mutation on network failure', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(data(csrf))
      .mockRejectedValueOnce(new Error('private diagnostic'))
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    await expect(api.mutate('/auth/login', {}, z.unknown())).rejects.not.toThrow(
      'private diagnostic',
    )
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('does not replay a failed CSRF mutation and only displays safe registered messages', async () => {
    const transport = vi
      .fn()
      .mockResolvedValueOnce(data(csrf))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              code: 'CSRF_INVALID',
              message: 'private@example.test secret',
            },
          }),
          { status: 403 },
        ),
      )
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    await expect(api.mutate('/auth/login', {}, z.unknown())).rejects.toThrow(
      'security check expired',
    )
    expect(transport).toHaveBeenCalledTimes(2)
  })
  it('clears private state on unauthorized responses without retry', async () => {
    const clear = vi.fn(),
      transport = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'AUTH_REQUIRED' } }), {
          status: 401,
        }),
      )
    const api = createIdentityClient('https://api.example.test', 'customer', clear, transport)
    expect(await api.session()).toBeNull()
    expect(clear).toHaveBeenCalledOnce()
    expect(transport).toHaveBeenCalledOnce()
  })
  it('prevents old-identity response completion from populating a new cache', async () => {
    let complete: (response: Response) => void = () => {}
    const transport = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          complete = resolve
        }),
    )
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    const read = api.get('/me', z.unknown())
    api.reset()
    complete(data({ name: 'Previous account' }))
    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('rejects old identity changes while the response body is decoding', async () => {
    let complete: (value: unknown) => void = () => {}
    let decoding: () => void = () => {}
    const started = new Promise<void>((resolve) => {
      decoding = resolve
    })
    const body = new Promise<unknown>((resolve) => {
      complete = resolve
    })
    const response = new Response()
    vi.spyOn(response, 'json').mockImplementation(() => {
      decoding()
      return body
    })
    const api = createIdentityClient(
      'https://api.example.test',
      'customer',
      () => {},
      vi.fn().mockResolvedValue(response),
    )
    const read = api.get('/me', z.unknown())
    await started
    api.reset()
    complete({ data: { name: 'Previous account' } })
    await expect(read).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('forwards AbortSignal to cancel private reads', async () => {
    const controller = new AbortController(),
      transport = vi.fn().mockResolvedValue(data({}))
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    await api.get('/me', z.unknown(), { signal: controller.signal })
    expect(transport.mock.calls[0]?.[1].signal).toBe(controller.signal)
  })
  it('validates response envelopes and never grants access from an unexpected response', async () => {
    const transport = vi.fn().mockResolvedValue(data({ account: { role: 'admin' } }))
    await expect(
      createIdentityClient('https://api.example.test', 'admin', () => {}, transport).session(),
    ).rejects.toMatchObject({ code: 'INVALID_RESPONSE' })
  })
  it('rejects concurrent submissions before a second CSRF request', async () => {
    let complete: (response: Response) => void = () => {}
    const transport = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            complete = resolve
          }),
      )
      .mockResolvedValueOnce(data({ ok: true }))
    const api = createIdentityClient('https://api.example.test', 'customer', () => {}, transport)
    const first = api.mutate('/me', {}, z.unknown())
    await expect(api.mutate('/me', {}, z.unknown())).rejects.toMatchObject({
      code: 'STATE_CONFLICT',
    })
    expect(transport).toHaveBeenCalledTimes(1)
    complete(data(csrf))
    await first
  })
})
