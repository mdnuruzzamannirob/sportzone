import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'
import { errorDefinitions } from '../src/shared/errors/app-error.js'
import {
  assertOperationParity,
  type Operation,
  operationId,
  operations,
  transportOperations,
} from './registry.js'

type Schema = Record<string, unknown>
// Never replace an unsupported schema with {}. Wire inputs use Zod's input mode;
// runtime refinements/normalization remain authoritative and are documented explicitly.
export function wireSchema(schema: z.core.$ZodType): Schema {
  if (schema instanceof z.ZodUnion) {
    const options = schema.options.filter((item) => !(item instanceof z.ZodUndefined))
    if (options.length === 1 && options[0]) return wireSchema(options[0])
  }
  const { $schema: _dialect, ...result } = z.toJSONSchema(schema, {
    io: 'input',
    target: 'draft-2020-12',
  })
  return result
}
function hasBody(op: Operation) {
  return op.request !== undefined && !(op.request instanceof z.ZodUndefined)
}
function parameters(
  schema: z.ZodType,
  location: 'path' | 'query',
): { name: string; in: 'path' | 'query' | 'header'; required: boolean; schema: Schema }[] {
  const object = wireSchema(schema)
  const properties = z
    .record(z.string(), z.record(z.string(), z.unknown()))
    .parse(object.properties ?? {})
  const required = z.array(z.string()).parse(object.required ?? [])
  return Object.entries(properties).map(([name, value]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema:
      value.type === 'string' && typeof value.default === 'number'
        ? { ...value, default: String(value.default) }
        : value,
  }))
}
const requestId = z.strictObject({ requestId: z.string().uuid() })
const page = z.strictObject({
  requestId: z.string().uuid(),
  page: z.int().positive(),
  pageSize: z.int().min(1).max(100),
  totalItems: z.int().nonnegative(),
  totalPages: z.int().nonnegative(),
})
const errorEnvelope = (codes = Object.keys(errorDefinitions)) =>
  z.strictObject({
    error: z.strictObject({
      code: z.enum(codes),
      message: z.string(),
      details: z.array(z.strictObject({ field: z.string(), code: z.string() })).optional(),
    }),
    meta: requestId,
  })
function security(op: Operation) {
  if (op.access === 'monitor') return [{ MonitorBearer: [] }]
  if (op.access === 'public') return []
  const session = op.namespace === 'admin' ? 'AdminSession' : 'CustomerSession'
  const context = op.namespace === 'admin' ? 'AdminBrowserContext' : 'BrowserContext'
  if (op.access === 'public_csrf')
    return op.path.endsWith('/logout')
      ? [
          { [context]: [], CsrfHeader: [] },
          { [session]: [], CsrfHeader: [] },
        ]
      : [{ [context]: [], CsrfHeader: [] }]
  return [{ [session]: [], ...(op.csrf ? { CsrfHeader: [] } : {}) }]
}
const header = (description: string) => ({ description, schema: { type: 'string' } })
function openOperation(op: Operation) {
  const params = [...parameters(op.params, 'path'), ...parameters(op.query, 'query')]
  if (op.idempotency)
    params.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: true,
      schema: { type: 'string', minLength: 1, maxLength: 128 },
    })
  if (op.ifMatch)
    params.push({
      name: 'If-Match',
      in: 'header',
      required: true,
      schema: { type: 'string', pattern: '^"(0|[1-9][0-9]*)"$' },
    })
  if (op.csrf || op.path.endsWith('/auth/csrf'))
    params.push({
      name: 'Origin',
      in: 'header',
      required: true,
      schema: {
        type: 'string',
        format: 'uri',
        description: 'Exact approved frontend origin for this namespace',
      },
    })
  const responses: Record<string, unknown> = {
    [op.status]: {
      description: op.status === 204 ? 'Successful operation; no body' : 'Successful operation',
      headers: {
        'X-Request-Id': header('Server-generated request UUID'),
        ...(op.etag ? { ETag: header('Strong quoted numeric revision') } : {}),
        'Cache-Control': { schema: { const: 'no-store' } },
        'X-Content-Type-Options': { schema: { const: 'nosniff' } },
        ...(op.status === 201 && ['/me/addresses', '/admin/products'].includes(op.path)
          ? { Location: header('Created resource URI') }
          : {}),
        ...(op.path.includes('/auth/') ||
        op.path.includes('password-change') ||
        op.path.includes('email-changes/confirm')
          ? {
              'Set-Cookie': header(
                'Host-only HttpOnly cookie when issued/cleared; never a response-body credential',
              ),
            }
          : {}),
      },
      ...(op.status !== 204 && op.response
        ? {
            content: {
              'application/json': {
                schema: wireSchema(
                  z.strictObject({ data: op.response, meta: op.paginated ? page : requestId }),
                ),
              },
            },
          }
        : {}),
    },
  }
  for (const status of [
    ...new Set(Object.values(errorDefinitions).map((item) => item.status)),
  ].sort()) {
    responses[status] = {
      description: `Error family ${status}; applicable guards and service policies determine reachable codes`,
      content: { 'application/json': { schema: { $ref: `#/components/schemas/Error${status}` } } },
      'x-error-codes': Object.entries(errorDefinitions)
        .filter(([, value]) => value.status === status)
        .map(([key]) => key),
    }
  }
  return {
    operationId: operationId(op),
    tags: [op.path.startsWith('/admin') ? 'admin' : op.path.split('/')[1]],
    summary: `${op.method} ${op.path}`,
    description:
      'Runtime Zod validation, Unicode/phone/password policies, ownership, coverage and cross-field refinements remain mandatory. JSON Schema describes the wire shape and representable constraints; it does not replace domain validation.',
    'x-implementation-status': 'implemented',
    'x-activation': op.activation,
    'x-replay-policy': op.replay,
    'x-runtime-validation': true,
    'x-unknown-query-fields': 'rejected except health probes',
    'x-transport': op.path.startsWith('/health/')
      ? 'Restricted operational ingress required'
      : 'Exact approved-origin CORS; OPTIONS preflight, implicit HEAD on GET',
    parameters: params,
    security: security(op),
    responses,
    ...(hasBody(op) && op.request
      ? {
          requestBody: {
            required: !op.request.safeParse(undefined).success,
            content: {
              [op.multipart ? 'multipart/form-data' : 'application/json']: {
                schema: wireSchema(op.request),
              },
            },
            ...(op.multipart
              ? {
                  description:
                    'Exactly one file; approved configured MIME/bytes/pixels/scanner policy applies. Local policy values are not embedded.',
                }
              : {}),
          },
        }
      : {}),
  }
}

export function generateArtifacts(apiMarkdown: string) {
  assertOperationParity(operations)
  const matrix = apiMarkdown.split('### D.3 Endpoint response/status/error matrix')[1]
  if (!matrix) throw new Error('Missing canonical API operation matrix')
  const documented = [
    ...matrix.matchAll(/^\| `(GET|POST|PUT|PATCH|DELETE)`\s*\| `([^`]+)`\s*\| `([^`]+)`/gm),
  ].map((m) => ({
    method: z.string().parse(m[1]),
    path: z.string().parse(m[2]),
    success: z.string().parse(m[3]),
  }))
  if (
    !documented.length ||
    new Set(documented.map((op) => `${op.method} ${op.path}`)).size !== documented.length
  )
    throw new Error('Invalid canonical operation inventory')
  for (const op of operations) {
    const doc = documented.find((row) => row.method === op.method && row.path === op.path)
    if (!doc?.success.split(/\D+/).includes(String(op.status)))
      throw new Error(`Contract/specification drift: ${op.method} ${op.path}`)
  }
  const sorted = [...operations].sort((a, b) =>
    `${a.path} ${a.method}` < `${b.path} ${b.method}` ? -1 : 1,
  )
  const paths: Record<string, Record<string, unknown>> = {}
  for (const op of sorted) {
    const path = paths[op.path] ?? {}
    path[op.method.toLowerCase()] = openOperation(op)
    paths[op.path] = path
  }
  const cookie = (name: string) => ({ type: 'apiKey', in: 'cookie', name })
  const openapi = {
    openapi: '3.1.0',
    info: {
      title: 'SportZone implemented API',
      version: '1.0.0',
      description:
        'Generated from backend/contracts/registry.ts. Registered capabilities may require explicit activation; planned operations are not included.',
    },
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      schemas: {
        Error: wireSchema(errorEnvelope()),
        ...Object.fromEntries(
          [...new Set(Object.values(errorDefinitions).map((value) => value.status))]
            .sort()
            .map((status): [string, Schema] => [
              `Error${status}`,
              wireSchema(
                errorEnvelope(
                  Object.entries(errorDefinitions)
                    .filter(([, value]) => value.status === status)
                    .map(([code]) => code),
                ),
              ),
            ]),
        ),
      },
      securitySchemes: {
        CustomerSession: cookie('sz_customer_sid'),
        AdminSession: cookie('sz_admin_sid'),
        BrowserContext: cookie('sz_browser_ctx'),
        AdminBrowserContext: cookie('sz_admin_browser_ctx'),
        CsrfHeader: { type: 'apiKey', in: 'header', name: 'X-CSRF-Token' },
        MonitorBearer: {
          type: 'http',
          scheme: 'bearer',
          description: 'Separate restricted monitor token; not a customer/admin credential',
        },
      },
    },
    'x-explicit-transport-operations': transportOperations,
  }
  const item = sorted.map((op) => ({
    name: operationId(op),
    description: `Activation: ${op.activation}. Replay: ${op.replay}. No automatic mutation retry.`,
    request: {
      method: op.method,
      url: {
        raw: `{{baseUrl}}${op.path.replace(/\{([^}]+)\}/g, '{{$1}}')}`,
        query: parameters(op.query, 'query').map((param) => ({
          key: param.name,
          value: `{{${param.name}}}`,
          disabled: !param.required,
        })),
      },
      header: [
        ...(op.csrf || op.path.endsWith('/auth/csrf')
          ? [
              {
                key: 'Origin',
                value: op.namespace === 'admin' ? '{{adminOrigin}}' : '{{storefrontOrigin}}',
              },
            ]
          : []),
        ...(op.csrf
          ? [
              {
                key: 'X-CSRF-Token',
                value: op.namespace === 'admin' ? '{{adminCsrfToken}}' : '{{csrfToken}}',
              },
            ]
          : []),
        ...(op.ifMatch ? [{ key: 'If-Match', value: '{{ifMatch}}' }] : []),
        ...(op.idempotency ? [{ key: 'Idempotency-Key', value: '{{idempotencyKey}}' }] : []),
        ...(op.access === 'monitor'
          ? [{ key: 'Authorization', value: 'Bearer {{monitorToken}}' }]
          : []),
        ...(hasBody(op) && !op.multipart
          ? [{ key: 'Content-Type', value: 'application/json' }]
          : []),
      ],
      description: `Implemented conditionally: ${op.activation}. Query parameters and exact request/response schemas are in the companion OpenAPI operation ${operationId(op)}. Cookies use Postman's jar; obtain the correct namespace CSRF bootstrap manually.`,
      ...(hasBody(op)
        ? {
            body: op.multipart
              ? { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [] }] }
              : {
                  mode: 'raw',
                  raw: `{{${operationId(op)}Body}}`,
                  options: { raw: { language: 'json' } },
                },
          }
        : {}),
    },
    response: [],
  }))
  const variables = new Set([
    'baseUrl',
    'storefrontOrigin',
    'adminOrigin',
    'csrfToken',
    'adminCsrfToken',
    'monitorToken',
  ])
  for (const op of sorted) {
    for (const match of op.path.matchAll(/\{([^}]+)\}/g)) variables.add(z.string().parse(match[1]))
    if (op.ifMatch) variables.add('ifMatch')
    if (op.idempotency) variables.add('idempotencyKey')
    for (const param of parameters(op.query, 'query')) variables.add(param.name)
    if (hasBody(op) && !op.multipart) variables.add(`${operationId(op)}Body`)
  }
  return {
    'openapi.json': openapi,
    'postman.collection.json': {
      info: {
        name: 'SportZone implemented API',
        schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        description:
          'Generated; implemented capabilities only. Configure the blank environment privately. Requests are manual; no auto-login, retries, proof export or financial scripts.',
      },
      item,
    },
    'postman.environment.json': {
      name: 'SportZone blank local environment',
      values: [...variables].sort().map((key) => ({
        key,
        value: '',
        enabled: true,
        type: /Token|Body/.test(key) ? 'secret' : 'default',
      })),
      _postman_variable_scope: 'environment',
    },
    'planned-operations.json': {
      description:
        'Specification inventory only; not a runnable collection or proof of availability. DTO/access/header definitions remain in docs/API.md until implemented in the registry.',
      operations: documented.map((op) => ({
        ...op,
        operationId: operationId(op),
        implementation: operations.some((row) => row.method === op.method && row.path === op.path)
          ? 'implemented-conditional'
          : 'planned',
      })),
    },
  }
}
export function serialize(value: unknown) {
  return `${JSON.stringify(value, null, 2)}\n`
}
export function writeArtifacts(workspace: string, check: boolean) {
  const artifacts = generateArtifacts(readFileSync(resolve(workspace, '../docs/API.md'), 'utf8'))
  if (!check) mkdirSync(resolve(workspace, 'api'), { recursive: true })
  for (const [name, artifact] of Object.entries(artifacts)) {
    const file = resolve(workspace, 'api', name),
      content = serialize(artifact)
    if (check) {
      if (readFileSync(file, 'utf8') !== content)
        throw new Error(`Stale generated API artifact: ${name}`)
    } else writeFileSync(file, content)
  }
  return Object.keys(artifacts).length
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2)
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check'))
    throw new Error('Invalid API generation arguments')
  console.log(
    `API artifacts ${args.length ? 'verified' : 'generated'}: ${writeArtifacts(process.cwd(), args.length === 1)}`,
  )
}
