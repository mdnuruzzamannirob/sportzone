import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/app.js'
import { ConfigurationError, loadEnvironment } from '../src/config/environment.js'
import { createLogger, logConfigurationFailure } from '../src/observability/logger.js'
import { respond } from '../src/common/responses.js'
import { testEnvironment } from './support/environment.js'

describe('startup configuration', () => {
  it('validates current runtime inputs without mutating the environment', () => {
    const input = testEnvironment()
    const config = loadEnvironment(input)
    expect(config.PORT).toBe(4000)
    expect(config.APP_ENV).toBe('test')
    expect(input.PORT).toBe('4000')
    expect(Object.isFrozen(config)).toBe(true)
    delete input.PORT
    delete input.API_BIND_HOST
    expect(loadEnvironment(input)).toMatchObject({
      PORT: 4000,
      API_BIND_HOST: '127.0.0.1',
    })
  })
  it.each([
    'SESSION_SECRET',
    'HEALTH_MONITOR_TOKEN',
    'MONGODB_URI',
    'MONGODB_DB_NAME',
    'RELEASE_ID',
    'API_PUBLIC_ORIGIN',
    'STOREFRONT_ORIGIN',
    'ADMIN_ORIGIN',
    'CORS_ALLOWED_ORIGINS',
  ])('fails closed when %s is missing', (field) => {
    const input = testEnvironment()
    delete input[field]
    expect(() => loadEnvironment(input)).toThrow(ConfigurationError)
    try {
      loadEnvironment(input)
    } catch (error) {
      if (!(error instanceof ConfigurationError)) throw error
      expect(error.fields).toContain(field)
      expect(error.message).not.toContain(input.SESSION_SECRET)
    }
  })
  it.each(['0', '65536', '1.5', '-1', 'invalid', '1e3'])(
    'rejects invalid PORT %s',
    (PORT) =>
      expect(() => loadEnvironment({ ...testEnvironment(), PORT })).toThrow(
        ConfigurationError,
      ),
  )
  it('requires distinct strong-form monitor/session secrets', () => {
    const env = testEnvironment()
    expect(() =>
      loadEnvironment({ ...env, HEALTH_MONITOR_TOKEN: env.SESSION_SECRET }),
    ).toThrow(ConfigurationError)
    expect(() => loadEnvironment({ ...env, SESSION_SECRET: '0'.repeat(64) })).toThrow(
      ConfigurationError,
    )
    expect(() => loadEnvironment({ ...env, SESSION_SECRET: 'short' })).toThrow(
      ConfigurationError,
    )
  })
  it.each([
    'http://localhost:3000/private',
    'https://user:pass@example.com',
    'https://example.com?q=private',
    '*',
  ])('rejects non-origin configuration %s', (STOREFRONT_ORIGIN) =>
    expect(() => loadEnvironment({ ...testEnvironment(), STOREFRONT_ORIGIN })).toThrow(
      ConfigurationError,
    ),
  )
  it('requires exactly the configured storefront/admin origin pair', () => {
    expect(() =>
      loadEnvironment({
        ...testEnvironment(),
        CORS_ALLOWED_ORIGINS: 'http://localhost:3000,https://unapproved.example',
      }),
    ).toThrow(ConfigurationError)
  })
  it('requires HTTPS/non-loopback deployed origins and production NODE_ENV', () => {
    const env = testEnvironment()
    expect(() => loadEnvironment({ ...env, APP_ENV: 'production' })).toThrow(
      ConfigurationError,
    )
    expect(() =>
      loadEnvironment({ ...env, APP_ENV: 'staging', NODE_ENV: 'production' }),
    ).toThrow(ConfigurationError)
    expect(
      loadEnvironment({
        ...env,
        APP_ENV: 'staging',
        NODE_ENV: 'production',
        API_PUBLIC_ORIGIN: 'https://api.example.com',
        STOREFRONT_ORIGIN: 'https://shop.example.com',
        ADMIN_ORIGIN: 'https://admin.example.com',
        CORS_ALLOWED_ORIGINS: 'https://shop.example.com,https://admin.example.com',
      }).APP_ENV,
    ).toBe('staging')
  })
  it('never logs supplied configuration values on invalid input', () => {
    const lines: string[] = []
    logConfigurationFailure(['SESSION_SECRET', 'PORT'], (line) => lines.push(line))
    const record = JSON.parse(lines[0] ?? '{}')
    expect(record.errorCode).toBe('CONFIGURATION_INVALID')
    expect(record.configurationFields).toEqual(['SESSION_SECRET', 'PORT'])
    expect(record).toHaveProperty('timestampUtc')
  })
})
describe('health access and dependency semantics', () => {
  it('liveness remains independent of dependency failure', async () => {
    const isReady = vi.fn(async () => {
      throw new Error('private database details')
    })
    const response = await request(createApp({ health: { isReady } })).get(
      '/api/v1/health/live',
    )
    expect(response.status).toBe(200)
    expect(response.body.data).toEqual({ status: 'live' })
    expect(isReady).not.toHaveBeenCalled()
    expect(response.headers['cache-control']).toBe('no-store')
  })
  it.each(['missing', 'incorrect', 'query', 'cookie'])(
    'rejects %s monitor proof before touching readiness',
    async (mode) => {
      const config = loadEnvironment(testEnvironment())
      const isReady = vi.fn(async () => true)
      let operation = request(
        createApp({ health: { monitorToken: config.HEALTH_MONITOR_TOKEN, isReady } }),
      ).get(
        `/api/v1/health/ready${mode === 'query' ? `?token=${config.HEALTH_MONITOR_TOKEN}` : ''}`,
      )
      if (mode === 'incorrect')
        operation = operation.set('Authorization', `Bearer ${config.SESSION_SECRET}`)
      if (mode === 'cookie')
        operation = operation.set('Cookie', `monitor=${config.HEALTH_MONITOR_TOKEN}`)
      const response = await operation
      expect(response.status).toBe(401)
      expect(response.body.error.code).toBe('AUTH_REQUIRED')
      expect(isReady).not.toHaveBeenCalled()
      expect(response.headers['www-authenticate']).toBe('Bearer')
    },
  )
  it.each([true, false, 'throw'] as const)(
    'returns minimal authorized readiness for %s dependency state',
    async (state) => {
      const config = loadEnvironment(testEnvironment())
      const response = await request(
        createApp({
          health: {
            monitorToken: config.HEALTH_MONITOR_TOKEN,
            isReady: async () => {
              if (state === 'throw') throw new Error('private topology')
              return state
            },
          },
        }),
      )
        .get('/api/v1/health/ready')
        .set('Authorization', `Bearer ${config.HEALTH_MONITOR_TOKEN}`)
      expect(response.status).toBe(state === true ? 200 : 503)
      expect(state === true ? response.body.data : response.body.error).toEqual(
        state === true
          ? { status: 'ready' }
          : {
              code: 'SERVICE_UNAVAILABLE',
              message: 'Service is temporarily unavailable.',
            },
      )
      expect(JSON.stringify(response.body)).not.toMatch(/private|mongodb|topology/)
      expect(response.body.meta.requestId).toBe(response.headers['x-request-id'])
    },
  )
  it('fails closed when no valid monitor credential is configured', async () => {
    const response = await request(createApp()).get('/api/v1/health/ready')
    expect(response.status).toBe(401)
  })
})
describe('allowlisted structured logs', () => {
  it('correlates logs to server IDs without raw paths, query, headers, body or error text', async () => {
    const env = loadEnvironment(testEnvironment())
    const lines: string[] = []
    const logger = createLogger(env, (line) => lines.push(line), [
      env.SESSION_SECRET,
      env.HEALTH_MONITOR_TOKEN,
      env.MONGODB_URI,
    ])
    const router = Router()
    router.post('/sample/:id', (_req, res) => {
      respond(res, { ok: true })
    })
    router.get('/failure', async () => {
      throw new Error('Synthetic private exception')
    })
    const app = createApp({ apiRouter: router, logger })
    const response = await request(app)
      .post('/api/v1/sample/private-path?proof=private-query')
      .set('X-Request-Id', 'client-private-id')
      .set('Authorization', `Bearer ${env.HEALTH_MONITOR_TOKEN}`)
      .set('Cookie', 'private-cookie')
      .send({ password: 'private-body' })
    await request(app).get('/api/v1/failure')
    await request(app).get('/api/v1/private-unknown')
    expect(lines).toHaveLength(3)
    const first = JSON.parse(lines[0] ?? '{}')
    expect(first).toMatchObject({
      requestId: response.headers['x-request-id'],
      route: '/sample/:id',
      method: 'POST',
      status: 200,
      eventType: 'request_completed',
      service: 'backend',
      environment: 'test',
      releaseId: 'synthetic-test',
    })
    expect(first.durationMs).toBeGreaterThanOrEqual(0)
    expect(first.timestampUtc).toMatch(/Z$/)
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({
      level: 'error',
      errorCode: 'INTERNAL_ERROR',
      status: 500,
    })
    expect(JSON.parse(lines[2] ?? '{}').route).toBe('unmatched')
    expect(lines.join('')).not.toMatch(
      /private-path|private-query|private-body|private-cookie|private-unknown|client-private-id|Synthetic private exception/,
    )
    expect(lines.join('')).not.toContain(env.HEALTH_MONITOR_TOKEN)
  })
  it('scrubs configured secrets even if a trusted metadata field contains one', () => {
    const config = loadEnvironment(testEnvironment())
    const lines: string[] = []
    createLogger(
      { ...config, RELEASE_ID: config.HEALTH_MONITOR_TOKEN },
      (line) => lines.push(line),
      [config.HEALTH_MONITOR_TOKEN],
    ).lifecycle('ready')
    expect(lines.join('')).not.toContain(config.HEALTH_MONITOR_TOKEN)
    expect(lines.join('')).toContain('[redacted]')
  })
})

describe('P03-013 safe sensitive-action records', () => {
  it.each([200, 403, 500])(
    'records fixed action and outcome for HTTP %s without client material',
    async (status) => {
      const lines: string[] = []
      const logger = createLogger(loadEnvironment(testEnvironment()), (line) =>
        lines.push(line),
      )
      const router = Router()
      router.patch('/me/addresses/:addressId', (_req, res) =>
        res.status(status).json({ data: null }),
      )
      const response = await request(createApp({ apiRouter: router, logger }))
        .patch('/api/v1/me/addresses/private-id?email=private@example.test')
        .set('X-Request-Id', 'client-correlation')
        .set('Authorization', 'Bearer private-token')
        .set('Cookie', 'sz_customer_sid=private-cookie')
        .send({ role: 'admin', password: 'private-password' })
      expect(lines).toHaveLength(1)
      expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({
        eventType: 'request_completed',
        route: '/me/addresses/:addressId',
        securityAction: 'customer.address.update',
        requestId: response.headers['x-request-id'],
        status,
        outcome:
          status === 200 ? 'succeeded' : status === 403 ? 'denied' : 'failed',
      })
      expect(lines.join('')).not.toMatch(
        /private-|private@|client-correlation|"role"|"password"/,
      )
    },
  )
  it('does not classify an unregistered or lookalike route as an authorized admin action', async () => {
    const lines: string[] = []
    await request(
      createApp({
        logger: createLogger(loadEnvironment(testEnvironment()), (line) =>
          lines.push(line),
        ),
      }),
    )
      .post('/api/v1/admin/auth/login/forged')
      .send({ role: 'admin' })
      .expect(404)
    expect(JSON.parse(lines[0] ?? '{}')).not.toHaveProperty('securityAction')
  })
})
