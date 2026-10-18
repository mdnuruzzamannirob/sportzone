import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { createApp } from '../src/app.js'
import { parseInput, validate } from '../src/middleware/validation.js'
import { ApiError } from '../src/shared/errors.js'
import { pageMeta, parsePagination } from '../src/shared/pagination.js'
import { respond } from '../src/shared/responses.js'

// Synthetic routes exist only in this test. No new public endpoint is registered.
function fixture() {
  const router = Router()
  const service = vi.fn(async (input: { name: string }) => ({ name: input.name }))
  router.post(
    '/sample',
    validate(
      z.strictObject({ name: z.string().trim().min(1).max(40) }),
      'body',
      async (input, _req, res) => {
        respond(res, await service(input), 201)
      },
    ),
  )
  router.get('/sample', (req, res) => {
    const page = parsePagination(req.query)
    respond(res, [], 200, pageMeta(page, 45))
  })
  router.get('/failure', async () => {
    throw new Error('Synthetic confidential diagnostic')
  })
  router.get('/spoof', () => {
    throw { status: 400, message: 'Synthetic confidential diagnostic' }
  })
  router.get('/safe-failure', () => {
    throw new ApiError('NOT_FOUND')
  })
  router.get('/serialization', (_req, res) => {
    respond(res, { unserializable: 1n })
  })
  router.get(
    '/params/:id',
    validate(
      z.strictObject({ id: z.string().regex(/^sample$/) }),
      'params',
      (input, _req, res) => {
        respond(res, input)
      },
    ),
  )
  return { app: createApp({ apiRouter: router, jsonBodyLimitBytes: 64 }), service }
}
describe('API transport and validation', () => {
  it('returns safe versioned 404s with independent server correlation IDs and no-store', async () => {
    const app = createApp()
    const first = await request(app)
      .get('/api/v1/unknown')
      .set('X-Request-Id', 'untrusted-client-value')
    expect(first.status).toBe(404)
    expect(first.body.error).toEqual({
      code: 'NOT_FOUND',
      message: 'Resource not found.',
    })
    expect(first.headers['x-request-id']).toMatch(/^[a-f0-9-]{36}$/)
    expect(first.body.meta.requestId).toBe(first.headers['x-request-id'])
    expect(first.headers['cache-control']).toBe('no-store')
    expect(first.headers['x-content-type-options']).toBe('nosniff')
    expect(first.headers['x-powered-by']).toBeUndefined()
    expect(first.headers.etag).toBeUndefined()
    const second = await request(app).get('/unknown')
    expect(second.status).toBe(404)
    expect(second.body.meta.requestId).not.toBe(first.body.meta.requestId)
  })
  it('validates/normalizes before the controller delegates to its async service', async () => {
    const { app, service } = fixture()
    const response = await request(app)
      .post('/api/v1/sample')
      .send({ name: '  Training ball  ' })
    expect(response.status).toBe(201)
    expect(response.body.data).toEqual({ name: 'Training ball' })
    expect(service).toHaveBeenCalledWith({ name: 'Training ball' })
    expect(response.body.meta.requestId).toBe(response.headers['x-request-id'])
  })
  it.each([
    { name: '' },
    { name: 'x', role: 'admin' },
    { name: { $ne: null } },
    { name: ['x'] },
    [],
    { name: 'x'.repeat(41) },
  ])('rejects untrusted input without reaching the service: %j', async (body) => {
    const { app, service } = fixture()
    const response = await request(app).post('/api/v1/sample').send(body)
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('VALIDATION_FAILED')
    expect(service).not.toHaveBeenCalled()
    expect(response.body.error.details.length).toBeGreaterThan(0)
    expect(JSON.stringify(response.body)).not.toContain('admin')
  })
  it.each(['{"name":', '"primitive"', JSON.stringify({ name: 'x'.repeat(80) })])(
    'maps parser/limit failures to redacted INVALID_REQUEST',
    async (body) => {
      const { app, service } = fixture()
      const response = await request(app)
        .post('/api/v1/sample')
        .set('Content-Type', 'application/json')
        .send(body)
      expect(response.status).toBe(400)
      expect(response.body.error).toEqual({
        code: 'INVALID_REQUEST',
        message: 'Invalid request.',
      })
      expect(service).not.toHaveBeenCalled()
      expect(JSON.stringify(response.body)).not.toContain('SyntaxError')
    },
  )
  it.each([
    'text/plain',
    'application/x-www-form-urlencoded',
    'multipart/form-data; boundary=test',
  ])('rejects unsupported request media %s', async (type) => {
    const { app, service } = fixture()
    const response = await request(app)
      .post('/api/v1/sample')
      .set('Content-Type', type)
      .send('name=sample')
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
    expect(service).not.toHaveBeenCalled()
  })
  it('rejects compressed JSON without reflecting bytes', async () => {
    const { app } = fixture()
    const response = await request(app)
      .post('/api/v1/sample')
      .set('Content-Type', 'application/json')
      .set('Content-Encoding', 'gzip')
      .send('invalid compressed payload')
    expect(response.status).toBe(400)
    expect(response.body.error.code).toBe('INVALID_REQUEST')
  })
  it.each(['/failure', '/spoof', '/serialization'])(
    'redacts sync/async/serialization faults: %s',
    async (path) => {
      const { app } = fixture()
      const response = await request(app).get(`/api/v1${path}`)
      expect(response.status).toBe(500)
      expect(response.body.error).toEqual({
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred.',
      })
      expect(JSON.stringify(response.body)).not.toMatch(
        /confidential|stack|unserializable|Error:/,
      )
    },
  )
  it('uses registered safe errors and validates path params', async () => {
    const { app } = fixture()
    expect((await request(app).get('/api/v1/safe-failure')).status).toBe(404)
    expect((await request(app).get('/api/v1/params/wrong')).body.error.code).toBe(
      'VALIDATION_FAILED',
    )
    expect((await request(app).get('/api/v1/params/sample')).body.data).toEqual({
      id: 'sample',
    })
  })
  it('returns pagination metadata and rejects duplicate/unknown/operator parameters', async () => {
    const { app } = fixture()
    const response = await request(app).get('/api/v1/sample?page=2&pageSize=20')
    expect(response.body.meta).toEqual({
      page: 2,
      pageSize: 20,
      totalItems: 45,
      totalPages: 3,
      requestId: response.headers['x-request-id'],
    })
    for (const query of [
      'page=1&page=2',
      'page[$gt]=1',
      'pageSize=101',
      'sort=unknown',
    ])
      expect((await request(app).get(`/api/v1/sample?${query}`)).body.error.code).toBe(
        'VALIDATION_FAILED',
      )
  })
  it('does not expose fake health/auth/data or enable credentialed CORS', async () => {
    for (const path of [
      '/api/v1',
      '/api/v1/health/live',
      '/api/v1/auth/csrf',
      '/api/v1/products',
    ]) {
      const response = await request(createApp())
        .get(path)
        .set('Origin', 'https://unapproved.example')
      expect(response.status).toBe(404)
      expect(response.headers['access-control-allow-origin']).toBeUndefined()
    }
  })
})
describe('bounded pagination', () => {
  it('defaults to page 1/20 with deterministic offset and empty metadata', () => {
    expect(parsePagination({})).toEqual({ page: 1, pageSize: 20, offset: 0 })
    expect(pageMeta({ page: 1, pageSize: 20 }, 0)).toEqual({
      page: 1,
      pageSize: 20,
      totalItems: 0,
      totalPages: 0,
    })
    expect(parsePagination({ page: '3', pageSize: '100' })).toEqual({
      page: 3,
      pageSize: 100,
      offset: 200,
    })
  })
  it.each([
    '0',
    '-1',
    '1.5',
    '1e2',
    ' 2',
    '01',
    'Infinity',
    '9007199254740992',
    '9007199254740991',
  ])('rejects malformed or unsafe page %s', (page) =>
    expect(() => parsePagination({ page })).toThrow(ApiError),
  )
  it.each(['0', '-1', '101', '1.5'])('rejects invalid size %s', (pageSize) =>
    expect(() => parsePagination({ pageSize })).toThrow(ApiError),
  )
  it('rejects invalid metadata and parser configuration', () => {
    expect(() => pageMeta({ page: 1, pageSize: 20 }, -1)).toThrow(RangeError)
    expect(() => createApp({ jsonBodyLimitBytes: 0 })).toThrow(RangeError)
  })
})

it('keeps nested validation paths canonical and suppresses custom diagnostic messages', () => {
  const schema = z.strictObject({
    items: z
      .array(
        z.strictObject({
          quantity: z.int().min(1, 'Synthetic confidential validation diagnostic'),
        }),
      )
      .max(2),
  })
  try {
    parseInput(schema, { items: [{ quantity: 0 }] })
    throw new Error('Expected validation failure')
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    if (!(error instanceof ApiError)) throw error
    expect(error.details).toEqual([{ field: 'items[0].quantity', code: 'TOO_SMALL' }])
    expect(error.message).not.toContain('confidential')
  }
})
