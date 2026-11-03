import { Types } from 'mongoose'
import request from 'supertest'
import { it } from 'vitest'
import { loadEnvironment } from '../../../src/config/env.js'
import { initializeRefundAttemptPersistence } from '../../../src/modules/refunds/payouts/refund-attempt.persistence.js'
import { initializeCorrectionPersistence } from '../../../src/modules/refunds/refund.persistence.js'
import { startServer } from '../../../src/server.js'
import { createLogger } from '../../../src/shared/logger.js'
import { authSecret, context, registerCommerceFixture } from '../../helpers/commerce/base.js'
import { packageBFixture } from '../../helpers/commerce/returns.js'
import { identityEnvironment } from '../../helpers/environment.js'
import { mediaPolicy } from '../../helpers/media.js'

registerCommerceFixture()

it('Package B/E HTTP: real server startup activates configured claims and histories while default startup keeps them absent', async () => {
  const f = await packageBFixture()
  await initializeCorrectionPersistence(context.db.connection)
  await initializeRefundAttemptPersistence(context.db.connection)
  const originalEnvironment = process.env
  let runtime: Awaited<ReturnType<typeof startServer>> | undefined
  try {
    const env = {
      ...identityEnvironment(),
      SESSION_SECRET: authSecret,
      MONGODB_URI: context.db.replica.getUri(),
      MONGODB_DB_NAME: context.db.connection.name,
    }
    process.env = { ...env }
    let config = { ...loadEnvironment(env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server).get(`/api/v1/orders/${f.orderId}/claim-eligibility`).expect(404)
    await runtime.close()
    const { temporaryTtlSeconds, ...policy } = mediaPolicy
    process.env = {
      ...env,
      RETURN_OPERATIONS_ENABLED: 'true',
      AFTER_SALES_HISTORY_ENABLED: 'true',
      MEDIA_ENABLED: 'true',
      MEDIA_SCANNER: 'clamav',
      MEDIA_SCANNER_HOST: '127.0.0.1',
      MEDIA_SCANNER_PORT: '3310',
      MEDIA_SCANNER_TIMEOUT_MS: '1000',
      MEDIA_POLICY_JSON: JSON.stringify(policy),
      MEDIA_TEMP_TTL_SECONDS: String(temporaryTtlSeconds),
      CLOUDINARY_CLOUD_NAME: 'synthetic',
      CLOUDINARY_API_KEY: '12345',
      CLOUDINARY_API_SECRET: 'synthetic-secret',
      MEDIA_PROVIDER_TIMEOUT_MS: '1000',
    }

    config = { ...loadEnvironment(process.env), PORT: 0 }
    runtime = await startServer(
      config,
      createLogger(config, () => {}),
    )
    await request(runtime.server).get(`/api/v1/orders/${f.orderId}/claim-eligibility`).expect(401)
    await request(runtime.server)
      .get(`/api/v1/orders/${f.orderId}/claim-eligibility`)
      .set('Cookie', f.buyer.cookie)
      .expect(200)
    for (const path of ['/me/reviews', '/me/claims', '/me/refunds'])
      await request(runtime.server).get(`/api/v1${path}`).set('Cookie', f.buyer.cookie).expect(200)
    // File validation rejects before scanner/provider I/O; no live credentials or calls.
    await request(runtime.server)
      .post(`/api/v1/orders/${f.orderId}/claims/evidence-uploads`)
      .set('Origin', 'https://shop.example.test')
      .set('Cookie', f.buyer.cookie)
      .set('X-CSRF-Token', f.buyer.csrf)
      .field('claimType', 'physical_return')
      .field('orderItemIds[]', f.orderItemId)
      .attach('file', Buffer.from('invalid'), { filename: 'bad.png', contentType: 'image/png' })
      .expect(400)
    await request(runtime.server)
      .get(`/api/v1/orders/${f.orderId}/claims/evidence/${new Types.ObjectId()}`)
      .set('Cookie', f.buyer.cookie)
      .expect(404)
    await request(runtime.server)
      .post(`/api/v1/orders/${f.orderId}/claims`)
      .set('Origin', 'https://shop.example.test')
      .set('Cookie', f.buyer.cookie)
      .set('X-CSRF-Token', f.buyer.csrf)
      .set('Idempotency-Key', 'startup-return')
      .send(f.body())
      .expect(201)
  } finally {
    await runtime?.close()
    process.env = originalEnvironment
  }
})
