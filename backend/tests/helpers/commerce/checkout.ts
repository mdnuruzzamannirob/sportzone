import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { Router } from 'express'
import request from 'supertest'
import { vi } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { reservationExpiryJob } from '../../../src/jobs/expire-reservations.job.js'
import { sessionCookies } from '../../../src/modules/auth/auth.composition.js'
import { createAuthQuotaStore } from '../../../src/modules/auth/sessions/auth-throttle.persistence.js'
import { createAuthThrottle } from '../../../src/modules/auth/sessions/auth-throttle.service.js'
import { createCheckoutRoutes } from '../../../src/modules/checkout/checkout.routes.js'
import {
  createCheckoutCompletionService,
  createCheckoutExpiryService,
  createCheckoutIntentService,
} from '../../../src/modules/checkout/checkout.service.js'
import { paymentAllocationOrderAccess } from '../../../src/modules/orders/order.service.js'
import { createPaymentAllocationService } from '../../../src/modules/orders/order-allocation.service.js'
import { paymentEligibility } from '../../../src/modules/payments/attempts/payment-eligibility.service.js'
import { initializePaymentInitiationPersistence } from '../../../src/modules/payments/attempts/payment-initiation.persistence.js'
import { initializePaymentRecordPersistence } from '../../../src/modules/payments/collections/payment-record.persistence.js'
import { paymentInitiationEligibilityAccess } from '../../../src/modules/payments/payment.service.js'
import { couponModels } from '../../../src/modules/promotions/promotion.model.js'
import { settingsModel } from '../../../src/modules/settings/setting.model.js'
import { createSslcommerzAdapter } from '../../../src/providers/sslcommerz/sslcommerz.client.js'
import { initiationInput } from '../../../src/providers/sslcommerz/sslcommerz.schema.js'
import {
  composeAllocationDependencies,
  composeApplication,
  composeAuditAccess,
  composeCheckoutCompletionDependencies,
  composeCheckoutExpiryDependencies,
  composeCheckoutIntentDependencies,
  composeCheckoutRoutesDependencies,
  composePaymentEligibilityDependencies,
} from '../../../src/setup.js'
import { createLogger } from '../../../src/shared/logger.js'
import { createContractCheckedApp as createApp } from '../contracts.js'
import { identityEnvironment } from '../environment.js'
import type { Browser } from './base.js'
import {
  authSecret,
  body,
  context,
  coupon,
  customer,
  deadline,
  guest,
  makeService,
  origin,
  submit,
  variant,
} from './base.js'

function submissionService(quotes = context.service) {
  return createCheckoutIntentService(
    context.db.connection,
    context.access,
    quotes,
    createCheckoutCompletionService(
      composeAuditAccess(context.db.connection),
      composeCheckoutCompletionDependencies(context.db.connection),
      () => context.now,
    ),
    composeCheckoutIntentDependencies(),
    () => context.now,
  )
}

function codApp() {
  return createApp({
    apiRouter: Router().use(
      createCheckoutRoutes(
        context.service,
        context.security,
        createAuthThrottle(
          createAuthQuotaStore(context.db.connection),
          randomBytes(32).toString('hex'),
        ).middleware('customer', 'checkout'),
        submissionService(),
        sessionCookies,
        composeCheckoutRoutesDependencies(),
      ),
    ),
  })
}

function placeCod(who: Browser, input: object, key = 'synthetic-cod-key') {
  return request(codApp())
    .post('/api/v1/checkout/orders')
    .set('Origin', origin)
    .set('Cookie', who.cookie)
    .set('X-CSRF-Token', who.csrf)
    .set('Idempotency-Key', key)
    .send(input)
}

async function heldOrder() {
  const who = await guest(),
    selected = await variant(),
    promotion =
      (await couponModels(context.db.connection).coupons.findOne({
        codeNormalized: 'SYNTHETIC',
      })) ?? (await coupon())
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  const input = { ...body([selected.item]), method: 'bkash', couponCode: 'SYNTHETIC' },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    randomUUID(),
  )
  return { result, selected, promotion }
}

const expiryJob = (batchSize = 100) =>
  reservationExpiryJob(
    context.db.connection,
    createCheckoutExpiryService(
      composeAuditAccess(context.db.connection),
      composeCheckoutExpiryDependencies(context.db.connection),
      () => context.now,
    ),
    { batchSize, leaseMs: 30000 },
    () => context.now,
  )

async function paymentAllocations() {
  await initializePaymentRecordPersistence(context.db.connection)
  return createPaymentAllocationService(
    paymentAllocationOrderAccess(
      context.db.connection,
      paymentInitiationEligibilityAccess(context.db.connection),
    ),
    composeAuditAccess(context.db.connection),
    composeAllocationDependencies(context.db.connection),
    () => context.now,
  )
}

async function initiationApp(
  enabled = true,
  verificationGateway?: Pick<
    ReturnType<typeof createSslcommerzAdapter>,
    'validate' | 'queryTransaction'
  >,
  adminEnabled = false,
  retryGateway?: Pick<ReturnType<typeof createSslcommerzAdapter>, 'validate' | 'queryTransaction'>,
  orderReadEnabled = false,
) {
  await initializePaymentRecordPersistence(context.db.connection)
  await initializePaymentInitiationPersistence(context.db.connection)
  const config = loadEnvironment({
    ...identityEnvironment(),
    ADMIN_AUTH_ENABLED: adminEnabled ? 'true' : 'false',
    CUSTOMER_ORDER_READ_ENABLED: orderReadEnabled ? 'true' : 'false',
    SESSION_SECRET: authSecret,
    GUEST_ACCESS_ENABLED: 'true',
    GUEST_ORDER_ACCESS_TTL_SECONDS: '300',
    GUEST_ORDER_ACCESS_COOLDOWN_SECONDS: '60',
    GUEST_ORDER_ACCESS_RESPONSE_FLOOR_MS: '100',
    GUEST_ORDER_SESSION_TTL_SECONDS: '600',
  })
  const merchant = createHash('sha256').update('sandbox\0synthetic-store').digest('hex')
  const transport = vi.fn<typeof fetch>().mockImplementation(
    async () =>
      new Response(
        JSON.stringify({
          status: 'SUCCESS',
          sessionkey: 'synthetic-session',
          GatewayPageURL:
            'https://sandbox.sslcommerz.com/gwprocess/v4/gw.php?Q=PAY&SESSIONKEY=synthetic-session',
        }),
      ),
  )
  const root = await composeApplication(
    context.db.connection,
    config,
    { isReady: async () => true },
    createLogger(config, () => {}),
    undefined,
    [],
    undefined,
    [
      {
        channel: 'bkash',
        appEnv: 'test',
        mode: 'sandbox',
        merchantAccountKey: merchant,
        gatewayKey: 'bkash',
        minPoisha: 1000,
        maxPoisha: 50000,
        verifiedAt: new Date(context.now.getTime() - 1000).toISOString(),
        validUntil: new Date(context.now.getTime() + 3600000).toISOString(),
        approvedBy: 'Synthetic reviewer',
        evidenceRef: 'synthetic:test',
        evidenceFile: 'synthetic.txt',
        evidenceDigest: 'a'.repeat(64),
      },
    ],
    enabled
      ? {
          ...(retryGateway ? { reconciliationGateway: retryGateway } : {}),
          gateway: createSslcommerzAdapter(
            {
              appEnv: 'test',
              mode: 'sandbox',
              storeId: 'synthetic-store',
              storePassword: 'synthetic-password',
              callbackOrigin: 'https://api.example.test',
              timeoutMs: 1000,
            },
            transport,
          ),
          validateRequest: (raw) => initiationInput.safeParse(raw).success,
          clock: () => context.now,
        }
      : undefined,
    {
      ...(verificationGateway ? { verificationGateway, clock: () => context.now } : {}),
      options: {
        mode: 'sandbox',
        storeId: 'synthetic-store',
        storefrontOrigin: 'https://shop.example.test',
        rateLimit: 60,
        returns: {
          success: 'https://shop.example.test/payment/result',
          fail: 'https://shop.example.test/payment/result',
          cancel: 'https://shop.example.test/payment/result',
        },
      },
    },
  )
  return { root, transport }
}

async function customerHeldOrder(
  withCoupon = false,
  existingVariant?: Awaited<ReturnType<typeof variant>>,
  prepaid = false,
) {
  const who = await customer(),
    selected = existingVariant ?? (await variant(2000, 1500))
  await settingsModel(context.db.connection).updateOne(
    {},
    { $set: { 'paymentChannels.bkashEnabled': true } },
  )
  const quotes = makeService({
    ...(prepaid ? { deadline: deadline('synthetic-prepaid-v1', true) } : {}),
    methods: paymentEligibility(composePaymentEligibilityDependencies(), async () => [
      { channel: 'bkash', active: true, minPoisha: 1, maxPoisha: 1000000 },
    ]),
  })
  if (
    withCoupon &&
    !(await couponModels(context.db.connection).coupons.exists({ codeNormalized: 'SYNTHETIC' }))
  )
    await coupon()
  const input = {
      ...body([selected.item]),
      method: 'bkash',
      ...(withCoupon ? { couponCode: 'SYNTHETIC' } : {}),
    },
    quote = await quotes.create(who.credentials, input)
  const result = await submissionService(quotes).submit(
    who.credentials,
    submit(input, quote),
    randomUUID(),
  )
  return { who, result, selected }
}

export {
  codApp,
  customerHeldOrder,
  expiryJob,
  heldOrder,
  initiationApp,
  paymentAllocations,
  placeCod,
  submissionService,
}
