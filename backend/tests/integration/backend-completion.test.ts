import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Router } from 'express'
import request from 'supertest'
import { z } from 'zod'
import { afterAll, beforeAll, expect, it, vi } from 'vitest'
import { assertOperationParity, operations } from '../../contracts/registry.js'
import { loadEnvironment } from '../../src/config/env.js'
import { composeApplication, composeNotificationWorker } from '../../src/setup.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { createLogger } from '../../src/shared/logger.js'
import { registeredOperations } from '../contracts/routes.fixture.js'
import { isolatedDatabase } from '../helpers/database.js'
import { identityEnvironment } from '../helpers/environment.js'
import { fakeMediaProvider, mediaPolicy } from '../helpers/media.js'

let database: Awaited<ReturnType<typeof isolatedDatabase>>
const environment = {
  ...identityEnvironment(),
  EMAIL_VERIFICATION_ENABLED: 'true',
  EMAIL_VERIFICATION_TTL_SECONDS: '600',
  EMAIL_VERIFICATION_COOLDOWN_SECONDS: '60',
  EMAIL_VERIFICATION_RESPONSE_FLOOR_MS: '100',
  CUSTOMER_ORDER_READ_ENABLED: 'true',
  GUEST_ACCESS_ENABLED: 'true',
  GUEST_ORDER_SESSION_TTL_SECONDS: '3600',
  GUEST_ORDER_ACCESS_TTL_SECONDS: '600',
  GUEST_ORDER_ACCESS_COOLDOWN_SECONDS: '60',
  GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '100',
  STORE_INITIAL_LOW_STOCK_THRESHOLD: '5',
}
const run = promisify(execFile)
// These are the real operator entry points, not a second initialization implementation.
const bootstrap = [
  'identity',
  'catalog',
  'media',
  'settings',
  'delivery',
  'promotions',
  'cart',
  'reviews',
  'checkout-submit',
  'payment-records',
  'payment-initiation',
  'payment-callbacks',
  'cancellations',
  'returns',
  'refunds',
  'delivery-support',
  'operations',
] as const
beforeAll(async () => {
  database = await isolatedDatabase()
  const env = {
    ...environment,
    MONGODB_URI: database.replica.getUri(),
    MONGODB_DB_NAME: database.connection.name,
  }
  for (const tool of bootstrap) {
    const result = await run(process.execPath, [`scripts/bootstrap-${tool}.mjs`], {
      env,
      timeout: 20000,
      maxBuffer: 1048576,
    })
    expect(result.stderr, tool).toBe('')
  }
}, 120000)
afterAll(async () => {
  await database?.close()
})

it('assembles every contracted endpoint in one real application without duplicate registrations or provider effects', async () => {
  const config = loadEnvironment(environment)
  const external = vi.fn(async (): Promise<never> => {
    throw new Error(
      'No external financial or approval effect is authorized in composition verification',
    )
  })
  const media = fakeMediaProvider()
  const logger = createLogger(config, () => {})
  const app = await composeApplication(
    database.connection,
    config,
    { isReady: async () => true },
    logger,
    {
      provider: media.adapter,
      policy: mediaPolicy,
      scanner: async () => 'clean',
      canDelete: async () => false,
    },
    [],
    { quoteTtlSeconds: 300, requiredPolicyTypes: ['terms'], codEnabled: true },
    [],
    { gateway: { initiate: external }, validateRequest: () => false },
    {
      options: {
        storeId: 'synthetic-store',
        mode: 'sandbox',
        storefrontOrigin: config.STOREFRONT_ORIGIN,
        rateLimit: 10,
        returns: {
          success: `${config.STOREFRONT_ORIGIN}/payment/success`,
          fail: `${config.STOREFRONT_ORIGIN}/payment/fail`,
          cancel: `${config.STOREFRONT_ORIGIN}/payment/cancel`,
        },
      },
      verificationGateway: { validate: external, queryTransaction: external },
    },
    { approvedDeadline: external, cashEvidence: external, cancellationRefund: external },
    { policyVersion: 'synthetic-completion-test', exceptions: [] },
    { options: { policyVersion: 'synthetic-completion-test', authorizations: [] } },
    true,
    {},
  )
  // The actual application mounts both exact callback and API routers at /api/v1.
  // Inspect their children with the same registration parser used by contract verification.
  const mounts = z
    .array(
      z.object({
        matchers: z
          .array(z.custom<(path: string) => unknown>((v) => typeof v === 'function'))
          .optional(),
        handle: z.unknown(),
      }),
    )
    .parse(app.router.stack)
  const router = z.custom<Router>((value) => typeof value === 'function' && 'stack' in value)
  const actual = mounts.flatMap((layer) =>
    layer.matchers?.some((match) => match('/api/v1')) && router.safeParse(layer.handle).success
      ? registeredOperations(router.parse(layer.handle))
      : [],
  )
  const ordinary = actual.filter((op) => !['HEAD', 'OPTIONS'].includes(op.method))
  // Typed contracts include local-only capabilities without activating them in hosted environments.
  assertOperationParity(ordinary, operations)

  if (!config.identity) throw new Error('Missing fixture session policy')
  const identities = createIdentityModels(database.connection)
  const cookies: Record<string, string> = {}
  for (const role of ['customer', 'admin'] as const) {
    const user = await identities.users.create({
      name: 'Synthetic completion',
      emailNormalized: `${role}-completion@example.test`,
      passwordHash: 'synthetic_hash',
      role,
    })
    const session = await createSessionService(
      database.connection,
      identities,
      config.identity.sessions,
    ).issue(role, user._id)
    cookies[role] = `sz_${role}_sid=${session.token}`
  }
  for (const path of [
    '/orders',
    '/me/claims',
    '/me/refunds',
    '/me/reviews',
    '/me/complaints',
    '/cart',
    '/wishlist',
  ]) {
    await request(app).get(`/api/v1${path}`).expect(401)
    await request(app)
      .get(`/api/v1${path}`)
      .set('Cookie', cookies.customer ?? '')
      .expect(200)
  }
  for (const path of [
    '/admin/orders',
    '/admin/claims',
    '/admin/refunds',
    '/admin/customers',
    '/admin/dashboard',
    '/admin/complaints',
  ]) {
    await request(app).get(`/api/v1${path}`).expect(401)
    await request(app)
      .get(`/api/v1${path}`)
      .set('Cookie', cookies.customer ?? '')
      .expect(401)
    await request(app)
      .get(`/api/v1${path}`)
      .set('Cookie', cookies.admin ?? '')
      .expect(200)
  }
  const worker = await composeNotificationWorker(database.connection, config, {
    adapter: { send: external },
    settings: {
      maxAttempts: 3,
      baseDelayMs: 100,
      maxDelayMs: 1000,
      claimTtlMs: 10000,
      batchSize: 5,
    },
    paymentsEnabled: true,
    commerceEnabled: true,
    afterSalesEnabled: true,
  })
  expect(await worker.runBatch()).toEqual({ processed: 0 })
  expect(external).not.toHaveBeenCalled()
  expect(media.state.deletes).toBe(0)
})
