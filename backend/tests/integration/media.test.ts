import { randomBytes, randomUUID } from 'node:crypto'
import { createServer } from 'node:net'
import { Schema, Types } from 'mongoose'
import { Router } from 'express'
import request from 'supertest'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { createApp } from '../../src/app.js'
import { ApiError } from '../../src/shared/errors/app-error.js'
import { inTransaction } from '../../src/shared/database/transaction.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { authorizeAccount } from '../../src/modules/auth/sessions/authorization.service.js'
import { createBrowserSecurity } from '../../src/modules/auth/sessions/browser-security.service.js'
import { createMediaAdminAccess } from '../../src/modules/auth/media-access.service.js'
import { createCloudinaryAdapter } from '../../src/providers/cloudinary/cloudinary.client.js'
import { createClamAvScanner } from '../../src/providers/antivirus/clamav.client.js'
import { createMediaService } from '../../src/modules/media/media.service.js'
import { mediaRoutes } from '../../src/modules/media/media.routes.js'
import { mediaModel } from '../../src/modules/media/media.model.js'
import {
  initializeMediaPersistence,
  verifyMediaPersistence,
} from '../../src/modules/media/media.persistence.js'
import type {
  MediaReference,
  EvidenceScope,
  MediaScanner,
} from '../../src/modules/media/media.types.js'
import { isolatedDatabase } from '../helpers/database.js'
import { fakeMediaProvider, imageFile, mediaPolicy, png } from '../helpers/media.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>,
  sessions: ReturnType<typeof createSessionService>
let service: ReturnType<typeof createMediaService>, provider: ReturnType<typeof fakeMediaProvider>
let admin: Awaited<ReturnType<typeof sessions.issue>>,
  customer: Awaited<ReturnType<typeof sessions.issue>>,
  other: Awaited<ReturnType<typeof sessions.issue>>
let scope: EvidenceScope,
  time: number,
  allowedDelete = true,
  verdict: Awaited<ReturnType<MediaScanner>> = 'clean'
let app: ReturnType<typeof createApp>
const clock = () => new Date(time),
  origin = 'http://localhost:5173'
const orderSchema = new Schema({
  customerId: Schema.Types.ObjectId,
  itemIds: [Schema.Types.ObjectId],
})
const targetSchema = new Schema({ assetId: Schema.Types.ObjectId })
const target = (): MediaReference => ({
  targetType: 'product',
  targetId: new Types.ObjectId(),
  slot: 'image:0',
})
const asset = (id: string) => mediaModel(fixture.connection).findById(id).orFail()
beforeAll(async () => {
  fixture = await isolatedDatabase()
  models = createIdentityModels(fixture.connection)
  await initializeIdentityPersistence(fixture.connection, models)
  await initializeMediaPersistence(fixture.connection)
  await fixture.connection
    .model('MediaOrderFixture', orderSchema, 'media_order_fixture')
    .createCollection()
  await fixture.connection
    .model('MediaTargetFixture', targetSchema, 'media_target_fixture')
    .createCollection()
  sessions = createSessionService(
    fixture.connection,
    models,
    {
      secret: randomBytes(32).toString('hex'),
      customerTtlSeconds: 3600,
      adminTtlSeconds: 3600,
      sameSite: 'lax',
      appEnvironment: 'test',
      apiOrigin: 'http://localhost:4000',
    },
    clock,
  )
})
beforeEach(async () => {
  time = Date.now()
  allowedDelete = true
  verdict = 'clean'
  await mediaModel(fixture.connection).deleteMany({})
  provider = fakeMediaProvider()
  const user = async (role: 'admin' | 'customer') =>
    new models.users({
      name: 'Synthetic',
      emailNormalized: `${randomUUID()}@example.test`,
      role,
      passwordHash: 'synthetic_hash',
    }).save()
  const adminUser = await user('admin'),
    customerUser = await user('customer'),
    otherUser = await user('customer')
  admin = await sessions.issue('admin', adminUser._id)
  customer = await sessions.issue('customer', customerUser._id)
  other = await sessions.issue('customer', otherUser._id)
  const order = await new (fixture.connection.model('MediaOrderFixture'))({
    customerId: customerUser._id,
    itemIds: [new Types.ObjectId()],
  }).save()
  scope = { orderId: order._id, claimType: 'physical_return', orderItemIds: order.itemIds }
  service = createMediaService(
    fixture.connection,
    {
      access: {
        admin: createMediaAdminAccess(models, sessions, clock),
        async evidence(credential, input, transaction) {
          const order = await fixture.connection
            .model('MediaOrderFixture')
            .findById(input.orderId)
            .session(transaction)
          if (
            !order ||
            input.orderItemIds.some(
              (id) => !order.itemIds.some((item: Types.ObjectId) => item.equals(id)),
            )
          )
            throw new ApiError('FORBIDDEN')
          if (credential === 'synthetic_scoped_guest' && input.orderId.equals(scope.orderId))
            return { kind: 'guest_order', principalId: input.orderId }
          const identity = await sessions.authenticate('customer', credential)
          await authorizeAccount(models, identity, 'customer', transaction, clock())
          if (!identity.userId.equals(order.customerId)) throw new ApiError('FORBIDDEN')
          return { kind: 'customer', principalId: identity.userId }
        },
      },
      provider: provider.adapter,
      scanner: async () => verdict,
      policy: mediaPolicy,
      canDelete: async () => allowedDelete,
    },
    clock,
  )
  const security = createBrowserSecurity(
    fixture.connection,
    models,
    sessions,
    {
      secret: randomBytes(32).toString('hex'),
      contextTtlSeconds: 120,
      storefrontOrigin: 'http://localhost:3000',
      adminOrigin: origin,
    },
    clock,
  )
  const router = Router()
  router.use(
    mediaRoutes(service, security, sessions, mediaPolicy.maxBytes, (_req, _res, next) => next()),
  )
  app = createApp({ apiRouter: router, mediaUploadsEnabled: true })
})
afterAll(async () => {
  await fixture?.close()
})
it('bootstraps strictly and preserves one canonical ledger without TTL deletion', async () => {
  await initializeMediaPersistence(fixture.connection)
  await verifyMediaPersistence(fixture.connection)
  const model = mediaModel(fixture.connection)
  expect(mediaModel(fixture.connection)).toBe(model)
  expect(
    (await model.collection.indexes()).some((index) => index.expireAfterSeconds !== undefined),
  ).toBe(false)
  expect(model.schema.options.autoIndex).toBe(false)
})
it('allows only real active admin sessions to upload public assets; no untrusted owner field', async () => {
  await expect(service.uploadPublic(customer.token, imageFile())).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  await expect(service.uploadPublic(undefined, imageFile())).rejects.toThrow()
  expect(provider.state.uploads).toBe(0)
  const result = await service.uploadPublic(admin.token, imageFile())
  expect(result).toMatchObject({
    publicId: expect.stringMatching(/^sportzone\//),
    mimeType: 'image/png',
  })
  expect(await asset(result.assetId)).toMatchObject({
    assetKind: 'public_media',
    access: 'public',
    status: 'temporary',
    scanStatus: 'clean',
    owner: { kind: 'admin' },
  })
})
it('rejects revoked/suspended administrators at the service boundary', async () => {
  const identity = await sessions.authenticate('admin', admin.token)
  await models.users.updateOne(
    { _id: identity.userId },
    { $set: { status: 'suspended' }, $inc: { securityRevision: 1 } },
  )
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  expect(provider.state.uploads).toBe(0)
})
it('quarantines rejected/unknown scans before upload and rejects provider metadata mismatch', async () => {
  verdict = 'rejected'
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toThrow()
  expect(provider.state.uploads).toBe(0)
  expect((await mediaModel(fixture.connection).findOne().orFail()).status).toBe('quarantined')
  verdict = 'uncertain'
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toThrow()
  verdict = 'clean'
  provider.state.wrongMetadata = true
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  })
  expect(await mediaModel(fixture.connection).countDocuments({ status: 'quarantined' })).toBe(3)
})
it('retains uncertain upload intent and reconciles by deterministic identity without reuploading', async () => {
  provider.state.uncertainUpload = true
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  })
  const pending = await mediaModel(fixture.connection).findOne().orFail()
  expect(pending.status).toBe('uploading')
  await expect(service.cleanup(pending.id)).rejects.toThrow()
  await service.reconcileUpload(pending.id)
  expect((await asset(pending.id)).status).toBe('temporary')
  expect(provider.state.uploads).toBe(1)
})
it('commits target changes and references together, rolls back callback failures and rejects duplicate refs', async () => {
  const result = await service.uploadPublic(admin.token, imageFile()),
    ref = target()
  const targets = fixture.connection.model('MediaTargetFixture')
  await expect(
    inTransaction(fixture.connection, (tx) =>
      service.attach(admin.token, result.assetId, ref, tx, async (_asset, session) => {
        await new targets({ _id: ref.targetId, assetId: result.assetId }).save({ session })
        throw new Error('Synthetic target failure')
      }),
    ),
  ).rejects.toThrow()
  expect(await targets.findById(ref.targetId)).toBeNull()
  expect((await asset(result.assetId)).references).toHaveLength(0)
  await inTransaction(fixture.connection, (tx) =>
    service.attach(admin.token, result.assetId, ref, tx, async (_asset, session) => {
      await new targets({ _id: ref.targetId, assetId: result.assetId }).save({ session })
    }),
  )
  expect((await asset(result.assetId)).status).toBe('attached')
  await expect(
    inTransaction(fixture.connection, (tx) =>
      service.attach(admin.token, result.assetId, ref, tx, async () => {}),
    ),
  ).rejects.toThrow()
  await expect(service.cleanup(result.assetId, { adminCredential: admin.token })).rejects.toThrow()
})
it('supports public reuse and guarded detach without deleting remaining target references', async () => {
  const result = await service.uploadPublic(admin.token, imageFile()),
    first = target(),
    second = target()
  for (const ref of [first, second])
    await inTransaction(fixture.connection, (tx) =>
      service.attach(admin.token, result.assetId, ref, tx, async () => {}),
    )
  await inTransaction(fixture.connection, (tx) =>
    service.detach(admin.token, result.assetId, first, tx, async () => {}),
  )
  expect((await asset(result.assetId)).references).toHaveLength(1)
  await inTransaction(fixture.connection, (tx) =>
    service.detach(admin.token, result.assetId, second, tx, async () => {}),
  )
  expect((await asset(result.assetId)).status).toBe('temporary')
})
it('has one winner for concurrent admin deletion versus attachment', async () => {
  const result = await service.uploadPublic(admin.token, imageFile())
  const results = await Promise.allSettled([
    inTransaction(fixture.connection, (tx) =>
      service.attach(admin.token, result.assetId, target(), tx, async () => {}),
    ),
    service.cleanup(result.assetId, { adminCredential: admin.token }),
  ])
  expect(results.filter((value) => value.status === 'fulfilled')).toHaveLength(1)
  const saved = await asset(result.assetId)
  expect(['attached', 'deleted']).toContain(saved.status)
  if (saved.status === 'attached') expect(provider.assets.has(saved.publicId)).toBe(true)
})
it('honors expiry, legal holds and retention checks before provider deletion', async () => {
  const result = await service.uploadPublic(admin.token, imageFile())
  await expect(service.cleanup(result.assetId)).rejects.toThrow()
  time += 61000
  allowedDelete = false
  await expect(service.cleanup(result.assetId)).rejects.toThrow()
  allowedDelete = true
  await inTransaction(fixture.connection, (tx) => service.protect(admin.token, result.assetId, tx))
  await expect(service.cleanup(result.assetId)).rejects.toThrow()
  expect(provider.state.deletes).toBe(0)
})
it('reconciles uncertain deletion without blind repeated delete and only marks actual absence', async () => {
  const result = await service.uploadPublic(admin.token, imageFile())
  time += 61000
  provider.state.uncertainDelete = true
  expect(await service.cleanup(result.assetId)).toBe(false)
  expect((await asset(result.assetId)).status).toBe('deleting')
  expect(await service.cleanup(result.assetId)).toBe(false)
  expect(provider.state.deletes).toBe(1)
  provider.assets.clear()
  expect(await service.cleanup(result.assetId)).toBe(true)
  expect((await asset(result.assetId)).deletedAt).toBeDefined()
  expect(await service.cleanup(result.assetId)).toBe(true)
})
it('keeps evidence private and scopes upload/read/attach to current owner/order/items', async () => {
  await expect(service.uploadEvidence(other.token, scope, imageFile())).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  await expect(
    service.uploadEvidence(
      customer.token,
      { ...scope, orderItemIds: [new Types.ObjectId()] },
      imageFile(),
    ),
  ).rejects.toThrow()
  const result = await service.uploadEvidence(customer.token, scope, imageFile())
  expect(result).not.toHaveProperty('url')
  expect(result).not.toHaveProperty('publicId')
  await expect(service.privateUrl(other.token, result.assetId)).rejects.toMatchObject({
    code: 'FORBIDDEN',
  })
  expect((await service.privateUrl(customer.token, result.assetId)).url).toContain('expires_at=')
  expect((await service.privateUrl(admin.token, result.assetId, true)).url).toContain('expires_at=')
  await expect(
    inTransaction(fixture.connection, (tx) =>
      service.attach(customer.token, result.assetId, target(), tx, async () => {}),
    ),
  ).rejects.toThrow()
  const ref: MediaReference = { ...target(), targetType: 'claim' }
  await inTransaction(fixture.connection, (tx) =>
    service.attach(customer.token, result.assetId, ref, tx, async (asset, session) => {
      expect(asset.orderId?.equals(scope.orderId)).toBe(true)
      await new (fixture.connection.model('MediaTargetFixture'))({
        _id: ref.targetId,
        assetId: result.assetId,
      }).save({ session })
    }),
  )
  await expect(
    inTransaction(fixture.connection, (tx) =>
      service.detach(customer.token, result.assetId, ref, tx, async () => {}),
    ),
  ).rejects.toThrow()
  await expect(service.cleanup(result.assetId, { adminCredential: admin.token })).rejects.toThrow()
})
it('supports injected guest-order proof scope and denies cross-owner evidence reuse', async () => {
  const result = await service.uploadEvidence('synthetic_scoped_guest', scope, imageFile())
  expect((await asset(result.assetId)).owner.kind).toBe('guest_order')
  await expect(service.privateUrl(customer.token, result.assetId)).rejects.toThrow()
  expect((await service.privateUrl('synthetic_scoped_guest', result.assetId)).url).toContain(
    'expires_at=',
  )
  time += 61000
  await expect(service.privateUrl('synthetic_scoped_guest', result.assetId)).rejects.toThrow()
})
it('requires multipart auth, Origin and CSRF before parsing; rejects foreign fields and malformed types', async () => {
  await request(app)
    .post('/api/v1/admin/media/uploads')
    .attach('file', png, 'synthetic.png')
    .expect(403)
  const req = () =>
    request(app)
      .post('/api/v1/admin/media/uploads')
      .set('Origin', origin)
      .set('Cookie', `sz_admin_sid=${admin.token}`)
      .set('X-CSRF-Token', admin.csrfToken)
  await req().field('owner', 'foreign').attach('file', png, 'synthetic.png').expect(400)
  await req().attach('file', png, 'wrong.jpg').expect(400)
  await req().attach('file', Buffer.alloc(2000), 'large.png').expect(400)
  await req().attach('file', Buffer.alloc(20000), 'huge.png').expect(400)
  const response = await req().attach('file', png, 'synthetic.png').expect(201)
  await request(app)
    .delete(`/api/v1/admin/media/${response.body.data.assetId}`)
    .set('Origin', origin)
    .set('Cookie', `sz_admin_sid=${admin.token}`)
    .set('X-CSRF-Token', admin.csrfToken)
    .expect(204)
  expect(provider.state.uploads).toBe(1)
})
it('keeps JSON-only behavior by default and rejects private scopes/unsafe direct BSON shapes', async () => {
  await request(createApp())
    .post('/api/v1/admin/media/uploads')
    .attach('file', png, 'synthetic.png')
    .expect(400)
  const result = await service.uploadPublic(admin.token, imageFile())
  for (const fields of [
    { access: 'private' },
    { size: 1.5 },
    { expiresAt: null },
    { status: 'attached' },
    { references: [{ targetType: 'claim', targetId: new Types.ObjectId(), slot: 'bad' }] },
  ])
    await expect(
      mediaModel(fixture.connection).collection.updateOne(
        { _id: new Types.ObjectId(result.assetId) },
        { $set: fields },
      ),
    ).rejects.toMatchObject({ code: 121 })
})
it('blocks scanner/provider external effects inside transactions', async () => {
  const cloud = createCloudinaryAdapter({
    cloudName: 'synthetic',
    apiKey: '1234',
    apiSecret: 'synthetic_only',
    timeoutMs: 10,
  })
  await expect(
    inTransaction(fixture.connection, () =>
      cloud.lookup('sportzone/012345678901234567890123', 'upload'),
    ),
  ).rejects.toThrow('EXTERNAL_EFFECT_IN_TRANSACTION')
  const scanner = createClamAvScanner({ host: '127.0.0.1', port: 1, timeoutMs: 10 })
  await expect(inTransaction(fixture.connection, () => scanner(png))).rejects.toThrow(
    'EXTERNAL_EFFECT_IN_TRANSACTION',
  )
})
it('uses bounded ClamAV INSTREAM transport and fails closed on scanner error/unknown reply', async () => {
  let response = 'stream: OK\0',
    received = Buffer.alloc(0)
  const server = createServer((socket) => {
    let input = Buffer.alloc(0)
    socket.on('data', (data) => {
      input = Buffer.concat([input, data])
      if (input.length >= 10 + 4 + png.length + 4) {
        received = input
        socket.end(response)
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  try {
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Missing scanner fixture port')
    const scanner = createClamAvScanner({ host: '127.0.0.1', port: address.port, timeoutMs: 1000 })
    expect(await scanner(png)).toBe('clean')
    expect(received.subarray(0, 10).toString()).toBe('zINSTREAM\0')
    expect(received.readUInt32BE(10)).toBe(png.length)
    response = 'stream: Synthetic FOUND\0'
    expect(await scanner(png)).toBe('rejected')
    response = 'stream: ERROR\0'
    expect(await scanner(png)).toBe('uncertain')
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    )
  }
})

it('runs bounded maintenance and reports pending/held outcomes without claiming provider success', async () => {
  provider.state.uncertainUpload = true
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toThrow()
  provider.state.unknownLookup = true
  expect(await service.maintenanceBatch(1)).toMatchObject({
    examined: 1,
    pending: 1,
    reconciled: 0,
  })
  provider.state.unknownLookup = false
  expect(await service.maintenanceBatch(1)).toMatchObject({ reconciled: 1 })
  time += 61000
  expect(await service.maintenanceBatch(1)).toMatchObject({ deleted: 1 })
  await expect(service.maintenanceBatch(0)).rejects.toThrow()
})
it('prevents concurrent cleanup from issuing duplicate provider deletions and honors time retention', async () => {
  const retained = await service.uploadPublic(admin.token, imageFile())
  await inTransaction(fixture.connection, (tx) =>
    service.protect(admin.token, retained.assetId, tx, new Date(time + 120000)),
  )
  time += 61000
  await expect(service.cleanup(retained.assetId)).rejects.toThrow()
  time += 61000
  const results = await Promise.all([
    service.cleanup(retained.assetId),
    service.cleanup(retained.assetId),
  ])
  expect(results.some((value) => value)).toBe(true)
  expect(provider.state.deletes).toBe(1)
})

it('does not return an expired attachable reference after a slow provider outcome', async () => {
  const upload = provider.adapter.upload
  provider.adapter.upload = async (input) => {
    const result = await upload(input)
    time += 61000
    return result
  }
  await expect(service.uploadPublic(admin.token, imageFile())).rejects.toMatchObject({
    code: 'SERVICE_UNAVAILABLE',
  })
  const expired = await mediaModel(fixture.connection).findOne().orFail()
  await expect(
    inTransaction(fixture.connection, (tx) =>
      service.attach(admin.token, expired.id, target(), tx, async () => {}),
    ),
  ).rejects.toThrow()
  expect(await service.cleanup(expired.id)).toBe(true)
})
