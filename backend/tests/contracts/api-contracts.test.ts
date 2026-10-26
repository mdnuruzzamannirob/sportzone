import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { Ajv } from 'ajv'
import { Ajv2020 } from 'ajv/dist/2020.js'
import formatsModule from 'ajv-formats'
import { Router } from 'express'
import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  generateArtifacts,
  serialize,
  wireSchema,
  writeArtifacts,
} from '../../contracts/generate.js'
import {
  assertOperationParity,
  operationId,
  operations,
  transportOperations,
} from '../../contracts/registry.js'
import { createApp } from '../../src/app.js'
import { registeredOperations, registeredRouter } from './routes.fixture.js'

const markdown = readFileSync(resolve('../docs/API.md'), 'utf8')
const artifacts = generateArtifacts(markdown)
const openapi = artifacts['openapi.json']
const ajv = new Ajv2020({ strict: false, allErrors: true })
formatsModule.default(ajv)
ajv.addFormat('media-range', /^[\w!#$&^.+*-]+\/[\w!#$&^.+*-]+(?:\s*;.*)?$/)
ajv.addFormat('binary', { type: 'string', validate: (value) => typeof value === 'string' })
const envelope = (path: string, method = 'get', status = '200') =>
  z
    .object({ schema: z.record(z.string(), z.unknown()) })
    .parse(
      z
        .object({ content: z.record(z.string(), z.unknown()) })
        .parse(
          z
            .record(z.string(), z.unknown())
            .parse(
              z
                .object({ responses: z.record(z.string(), z.unknown()) })
                .parse(openapi.paths[path]?.[method]).responses,
            )[status],
        ).content['application/json'],
    ).schema

describe('executable API contract registry', () => {
  it('reconciles actual Express routers, including explicit transport methods', () => {
    const actual = registeredOperations(registeredRouter())
    assertOperationParity(actual.filter((op) => !['HEAD', 'OPTIONS'].includes(op.method)))
    assertOperationParity(
      actual.filter((op) => op.method === 'HEAD'),
      transportOperations,
    )
    expect(
      actual
        .filter((op) => op.method === 'OPTIONS')
        .every((op) => operations.some((item) => item.path === op.path)),
    ).toBe(true)
    expect(operations).toHaveLength(69)
    const prefixed = Router().use('/untracked', registeredRouter())
    expect(() => registeredOperations(prefixed)).toThrow(/mount prefix/)
  })
  it('fails on missing, undeclared, duplicate or status-drifted operations', () => {
    expect(() => wireSchema(z.date())).toThrow()
    expect(() => assertOperationParity(operations.slice(1))).toThrow(/parity/)
    expect(() =>
      assertOperationParity([...operations, { method: 'POST', path: '/undeclared' }]),
    ).toThrow(/parity/)
    const first = operations[0]
    if (!first) throw new Error('Missing operation fixture')
    expect(() => assertOperationParity([...operations, first])).toThrow(/parity/)
    expect(() =>
      generateArtifacts(
        markdown.replace(
          /\| `GET`\s*\| `\/health\/live`\s*\| `200`/,
          '| `GET` | `/health/live` | `201`',
        ),
      ),
    ).toThrow(/drift/)
    expect(() => generateArtifacts('missing')).toThrow(/Missing/)
  })
  it('fails when a route-owning module is added without parity fixture coverage', () => {
    const actual: string[] = []
    const visit = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const file = `${dir}/${entry.name}`
        if (entry.isDirectory()) visit(file)
        else if (file.endsWith('.routes.ts')) actual.push(file.replace('src/modules/', ''))
      }
    }
    visit('src/modules')
    expect(actual.sort()).toEqual(
      [
        'auth/credentials/admin-auth.routes.ts',
        'auth/credentials/customer-auth.routes.ts',
        'auth/recovery/password-recovery.routes.ts',
        'auth/sessions/browser-security.routes.ts',
        'auth/verification/email-change.routes.ts',
        'catalog/catalog.routes.ts',
        'catalog/categories/category-admin.routes.ts',
        'catalog/products/product-admin.routes.ts',
        'cart/cart.routes.ts',
        'cart/wishlist.routes.ts',
        'customers/customer.routes.ts',
        'health/health.routes.ts',
        'inventory/inventory-admin.routes.ts',
        'media/media.routes.ts',
        'promotions/coupon-admin.routes.ts',
        'settings/settings.routes.ts',
      ].sort(),
    )
  })
  it('validates the whole OpenAPI and Postman documents against official offline schemas', () => {
    const official = JSON.parse(
      readFileSync('tests/fixtures/contracts/openapi.schema.json', 'utf8'),
    )
    expect(official.$defs.schema).toMatchObject({
      $dynamicAnchor: 'meta',
      type: ['object', 'boolean'],
    })
    // This official base schema explicitly excludes Schema Object validation. Bind its one
    // base anchor statically for Ajv; validate emitted payload schemas separately below.
    const schema = JSON.parse(
      JSON.stringify(official).replaceAll('"$dynamicRef":"#meta"', '"$ref":"#/$defs/schema"'),
    )
    const validate = ajv.compile(schema)
    expect(validate(openapi), JSON.stringify(validate.errors?.slice(0, 5))).toBe(true)
    expect(validate({ ...openapi, openapi: '2.0' })).toBe(false)
    const postman = new Ajv({ strict: false, allErrors: true })
    formatsModule.default(postman)
    const validateCollection = postman.compile(
      JSON.parse(readFileSync('tests/fixtures/contracts/postman.schema.json', 'utf8')),
    )
    expect(
      validateCollection(artifacts['postman.collection.json']),
      JSON.stringify(validateCollection.errors),
    ).toBe(true)
    expect(validateCollection({ info: {}, item: [] })).toBe(false)
  })
  for (const op of operations)
    it(`emits compilable request/response wire schemas: ${op.method} ${op.path}`, () => {
      expect(openapi.paths[op.path]?.[op.method.toLowerCase()]).toMatchObject({
        operationId: operationId(op),
        'x-activation': op.activation,
      })
      if (op.request && !(op.request instanceof z.ZodUndefined))
        expect(ajv.validateSchema(wireSchema(op.request))).toBe(true)
      if (op.status !== 204)
        expect(
          ajv.validateSchema(envelope(op.path, op.method.toLowerCase(), String(op.status))),
        ).toBe(true)
    })
  it('keeps planned contracts non-executable and environment values blank', () => {
    const rows = artifacts['planned-operations.json'].operations
    expect(rows).toHaveLength(164)
    expect(rows.filter((op) => op.implementation === 'planned')).toHaveLength(95)
    expect(openapi.paths['/checkout/orders']).toBeUndefined()
    expect(artifacts['postman.collection.json'].item).toHaveLength(69)
    expect(artifacts['postman.environment.json'].values.every((entry) => entry.value === '')).toBe(
      true,
    )
    expect(serialize(artifacts)).not.toContain('process.env')
    expect(artifacts['postman.collection.json'].item.every((item) => !('event' in item))).toBe(true)
    expect(
      artifacts['postman.collection.json'].item.find((item) => item.name === 'get_products')
        ?.request.url.query,
    ).toContainEqual({ key: 'page', value: '{{page}}', disabled: true })
  })
  it('keeps admin/customer/monitor security separate and documents browser proof headers', () => {
    expect(openapi.paths['/admin/auth/session']?.get).toMatchObject({
      security: [{ AdminSession: [] }],
    })
    expect(openapi.paths['/auth/login']?.post).toMatchObject({
      security: [{ BrowserContext: [], CsrfHeader: [] }],
    })
    expect(openapi.paths['/health/ready']?.get).toMatchObject({ security: [{ MonitorBearer: [] }] })
    expect(openapi.paths['/admin/media/uploads']?.post).toHaveProperty('responses.200')
    expect(openapi.paths['/me/addresses/{addressId}']?.delete).toHaveProperty('responses.204')
  })
  it('rejects leaked response fields, wrong statuses and malformed error bodies', () => {
    const validate = ajv.compile(envelope('/auth/session'))
    const account = {
      id: '000000000000000000000001',
      name: 'Synthetic',
      email: 'synthetic@example.test',
      emailVerified: false,
      addresses: [],
      status: 'active',
    }
    const body = { data: { account }, meta: { requestId: '00000000-0000-4000-8000-000000000001' } }
    expect(validate(body)).toBe(true)
    expect(
      validate({ ...body, data: { account: { ...account, passwordHash: 'forbidden' } } }),
    ).toBe(false)
    expect(validate({ ...body, data: { account: { ...account, status: 'administrator' } } })).toBe(
      false,
    )
    const error = ajv.compile(openapi.components.schemas.Error)
    expect(
      error({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication is required.' },
        meta: body.meta,
      }),
    ).toBe(true)
    expect(
      error({ error: { code: 'RAW_DRIVER_ERROR', message: 'private' }, meta: body.meta }),
    ).toBe(false)
  })
  it('generates coupon CAS headers, ETags and manual Postman variables from the registry', () => {
    const op = openapi.paths['/admin/coupons/{couponId}']?.patch
    expect(op).toMatchObject({
      parameters: expect.arrayContaining([
        expect.objectContaining({ name: 'If-Match', in: 'header', required: true }),
      ]),
      responses: { '200': { headers: { ETag: expect.any(Object) } } },
    })
    const postman = artifacts['postman.collection.json'].item.find(
      (item) => item.name === 'patch_admin_coupons_couponId',
    )
    expect(postman?.request.header).toContainEqual({ key: 'If-Match', value: '{{ifMatch}}' })
  })
  it('generates required inventory adjustment replay headers and blank manual variables', () => {
    expect(openapi.paths['/admin/inventory/{variantId}/adjustments']?.post).toMatchObject({
      parameters: expect.arrayContaining([
        expect.objectContaining({ name: 'Idempotency-Key', in: 'header', required: true }),
      ]),
    })
    const item = artifacts['postman.collection.json'].item.find(
      (row) => row.name === 'post_admin_inventory_variantId_adjustments',
    )
    expect(item?.request.header).toContainEqual({
      key: 'Idempotency-Key',
      value: '{{idempotencyKey}}',
    })
    expect(artifacts['postman.environment.json'].values).toContainEqual(
      expect.objectContaining({ key: 'idempotencyKey', value: '' }),
    )
  })
  it('documents atomic product variants and complete admin variant detail without broadening public DTOs', () => {
    expect(openapi.paths['/admin/products']?.post).toMatchObject({
      requestBody: {
        content: {
          'application/json': {
            schema: {
              required: expect.arrayContaining(['variants']),
              properties: { variants: { minItems: 1, maxItems: 100 } },
            },
          },
        },
      },
    })
    expect(envelope('/admin/products/{productId}')).toMatchObject({
      properties: { data: { properties: { variants: { minItems: 1, maxItems: 100 } } } },
    })
    expect(openapi.paths['/admin/products/{productId}/variants']?.post).toMatchObject({
      requestBody: {
        content: {
          'application/json': {
            schema: {
              properties: {
                attributes: { type: 'object', additionalProperties: { type: 'string' } },
              },
            },
          },
        },
      },
    })
  })
  it('validates real HTTP health and unauthorized responses without a database', async () => {
    const app = createApp({ apiRouter: registeredRouter() })
    const live = await request(app).get('/api/v1/health/live').expect(200)
    expect(ajv.compile(envelope('/health/live'))(live.body)).toBe(true)
    const ready = await request(app).get('/api/v1/health/ready').expect(401)
    expect(ajv.compile(openapi.components.schemas.Error)(ready.body)).toBe(true)
  })
  it('is deterministic and fails stale/missing artifacts without modifying them', () => {
    expect(serialize(generateArtifacts(markdown))).toBe(serialize(generateArtifacts(markdown)))
    const root = mkdtempSync(resolve(tmpdir(), 'sportzone-contracts-'))
    try {
      mkdirSync(resolve(root, 'backend'))
      mkdirSync(resolve(root, 'docs'))
      writeFileSync(resolve(root, 'docs/API.md'), markdown)
      const workspace = resolve(root, 'backend')
      writeArtifacts(workspace, false)
      expect(writeArtifacts(workspace, true)).toBe(4)
      const path = resolve(workspace, 'api/openapi.json')
      writeFileSync(path, '{}\n')
      const before = createHash('sha256').update(readFileSync(path)).digest('hex')
      expect(() => writeArtifacts(workspace, true)).toThrow(/Stale/)
      expect(createHash('sha256').update(readFileSync(path)).digest('hex')).toBe(before)
      rmSync(path)
      expect(() => writeArtifacts(workspace, true)).toThrow()
      cpSync('api/openapi.json', path)
      expect(writeArtifacts(workspace, true)).toBe(4)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('checks artifacts in a credential-free subprocess with TCP/listeners denied', () => {
    const hook =
      'import { Socket, Server } from "node:net"; Socket.prototype.connect = () => { throw new Error("Network forbidden") }; Server.prototype.listen = () => { throw new Error("Listener forbidden") };'
    const result = spawnSync(
      process.execPath,
      [
        '--import',
        `data:text/javascript,${encodeURIComponent(hook)}`,
        '.cache/contracts/contracts/generate.js',
        '--check',
      ],
      { env: {}, encoding: 'utf8', timeout: 5000 },
    )
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout).toContain('API artifacts verified: 4')
  })
})
