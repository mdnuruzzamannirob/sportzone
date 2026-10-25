import { spawnSync } from 'node:child_process'
import request from 'supertest'
import { testEnvironment } from '../helpers/environment.js'
import { categoryModel } from '../../src/modules/catalog/categories/category.model.js'
import { attributeSignature } from '../../src/modules/catalog/variants/variant.schema.js'
import { catalogService } from '../../src/modules/catalog/catalog.service.js'
import { catalogRoutes } from '../../src/modules/catalog/catalog.routes.js'
import { createApp } from '../../src/app.js'
import { createDeclaredIndexes } from '../../src/shared/database/indexes.js'
import { randomBytes, randomUUID } from 'node:crypto'
import { Types, type ClientSession } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { isolatedDatabase } from '../helpers/database.js'
import { createIdentityModels } from '../../src/modules/auth/auth.model.js'
import { initializeIdentityPersistence } from '../../src/modules/auth/identity.persistence.js'
import { createSessionService } from '../../src/modules/auth/sessions/session.service.js'
import { authorizeAccount } from '../../src/modules/auth/sessions/authorization.service.js'
import { createCustomerAccountAccess } from '../../src/modules/auth/customer-account.service.js'
import { productModels } from '../../src/modules/catalog/products/product.model.js'
import { initializeProductPersistence } from '../../src/modules/catalog/products/product.persistence.js'
import { productReviewAccess } from '../../src/modules/catalog/products/product.service.js'
import { reviewModel } from '../../src/modules/reviews/review.model.js'
import { initializeReviewPersistence } from '../../src/modules/reviews/review.persistence.js'
import { createReviewService, type ReviewAudit } from '../../src/modules/reviews/review.service.js'

let db: Awaited<ReturnType<typeof isolatedDatabase>>
let models: ReturnType<typeof createIdentityModels>
let sessions: ReturnType<typeof createSessionService>
let accounts: ReturnType<typeof createCustomerAccountAccess>
let service: ReturnType<typeof createReviewService>
let productId: string
let allowProof = true,
  failAudit = false
const itemId = new Types.ObjectId().toHexString()
const input = {
  rating: 1,
  comment: ' Legitimate negative feedback ',
  qualifyingOrderItemId: itemId,
}
async function account(role: 'customer' | 'admin' = 'customer') {
  const user = await models.users.create({
    name: 'Synthetic',
    emailNormalized: `${randomUUID()}@example.test`,
    passwordHash: 'synthetic_hash',
    role,
  })
  const issued = await sessions.issue(role, user._id)
  return { user, token: issued.token }
}
async function proof(
  session: ClientSession,
  selection: { userId: string; productId: string; qualifyingOrderItemId: string },
): Promise<unknown> {
  if (!allowProof) return null
  const row = await db.connection.db?.collection('orders').findOneAndUpdate(
    {
      userId: new Types.ObjectId(selection.userId),
      productId: new Types.ObjectId(selection.productId),
      qualifyingOrderItemId: new Types.ObjectId(selection.qualifyingOrderItemId),
      status: 'delivered',
      eligible: true,
    },
    { $inc: { fixtureFence: 1 } },
    { session, returnDocument: 'after' },
  )
  return row
    ? { ...selection, orderId: row._id.toHexString(), delivered: true, eligible: true }
    : null
}
async function purchase(userId: Types.ObjectId, extra = {}) {
  await db.connection.db?.collection('orders').insertOne({
    userId,
    productId: new Types.ObjectId(productId),
    qualifyingOrderItemId: new Types.ObjectId(itemId),
    status: 'delivered',
    eligible: true,
    fixtureFence: 0,
    ...extra,
  })
}
async function audit(session: ClientSession, event: ReviewAudit) {
  if (failAudit) throw new Error('Synthetic audit failure')
  await db.connection.db?.collection('auditLogs').insertOne(
    {
      ...event,
      actorId: new Types.ObjectId(event.actorId),
      targetId: new Types.ObjectId(event.targetId),
    },
    { session },
  )
}
async function moderator(token: string | undefined, session: ClientSession) {
  const identity = await sessions.authenticate('admin', token)
  await authorizeAccount(models, identity, 'admin', session, new Date())
  return identity.userId.toHexString()
}
async function receipt(
  session: ClientSession,
  identity: { actorId: string; reviewId: string; operationKey: string },
) {
  const event = await db.connection.db?.collection('auditLogs').findOne(
    {
      actorType: 'admin',
      actorId: new Types.ObjectId(identity.actorId),
      targetId: new Types.ObjectId(identity.reviewId),
      operationKey: identity.operationKey,
    },
    { session },
  )
  return event
    ? {
        actorType: event.actorType,
        actorId: event.actorId.toHexString(),
        targetId: event.targetId.toHexString(),
        operationKey: event.operationKey,
        action: event.action,
        reason: event.reason,
      }
    : null
}
const moderate = (
  token: string | undefined,
  id: string,
  input: unknown,
  key: string = randomUUID(),
) => service.moderate(token, id, input, key)
beforeAll(async () => {
  db = await isolatedDatabase()
  models = createIdentityModels(db.connection)
  await initializeIdentityPersistence(db.connection, models)
  await initializeProductPersistence(db.connection)
  await createDeclaredIndexes(categoryModel(db.connection))
  await initializeReviewPersistence(db.connection)
  await db.connection.db
    ?.collection('auditLogs')
    .createIndex({ operationKey: 1, action: 1, targetType: 1, targetId: 1 }, { unique: true })
  sessions = createSessionService(db.connection, models, {
    secret: randomBytes(32).toString('hex'),
    customerTtlSeconds: 600,
    adminTtlSeconds: 300,
    sameSite: 'lax',
    appEnvironment: 'test',
    apiOrigin: 'http://localhost:4000',
  })
  accounts = createCustomerAccountAccess(db.connection, models, sessions)
  service = createReviewService(db.connection, {
    accounts,
    catalog: productReviewAccess(db.connection),
    eligibility: proof,
    audit,
    moderator,
    moderationReceipt: receipt,
  })
})
beforeEach(async () => {
  allowProof = true
  failAudit = false
  const category = await categoryModel(db.connection).create({
    name: 'Synthetic',
    slug: `category-${randomUUID()}`,
    status: 'active',
  })
  const product = await productModels(db.connection).products.create({
    name: 'Synthetic',
    slug: `product-${randomUUID()}`,
    description: 'Synthetic',
    categoryIds: [category._id],
    status: 'active',
  })
  productId = product._id.toHexString()
  await productModels(db.connection).variants.create({
    productId: product._id,
    skuNormalized: productId.toUpperCase(),
    attributes: {},
    attributeSignature: attributeSignature({}),
    regularPricePoisha: 1000,
    status: 'active',
    stock: { physical: 0, reserved: 0, committed: 0 },
  })
})
afterAll(async () => {
  await db?.close()
})
it('denies creation by default even for a logged-in customer with a delivered fixture', async () => {
  const own = await account()
  await purchase(own.user._id)
  const closed = createReviewService(db.connection, {
    accounts,
    catalog: productReviewAccess(db.connection),
    audit,
  })
  await expect(closed.create(own.token, productId, input)).rejects.toMatchObject({
    code: 'BUSINESS_RULE_VIOLATION',
  })
  expect(await reviewModel(db.connection).countDocuments({ productId })).toBe(0)
})
it('requires delivered, owned, eligible purchase evidence and creates only pending authored content', async () => {
  const own = await account()
  await purchase(own.user._id)
  const result = await service.create(own.token, productId, input)
  expect(result).toMatchObject({
    productId,
    rating: 1,
    comment: 'Legitimate negative feedback',
    status: 'pending',
    verifiedPurchase: true,
  })
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 0, average: 0 })
  const stored = await reviewModel(db.connection).findById(result.id).lean()
  expect(stored?.userId.equals(own.user._id)).toBe(true)
  expect(stored?.qualifyingOrderItemId.toHexString()).toBe(itemId)
})
it.each([
  'absent',
  'cancelled',
  'undelivered',
  'fully-returned',
  'foreign-customer',
  'wrong-product',
  'wrong-item',
])('denies %s evidence', async (kind) => {
  const own = await account()
  if (kind !== 'absent')
    await purchase(kind === 'foreign-customer' ? new Types.ObjectId() : own.user._id, {
      ...(kind === 'cancelled' ? { status: 'cancelled' } : {}),
      ...(kind === 'undelivered' ? { status: 'processing' } : {}),
      ...(kind === 'fully-returned' ? { eligible: false } : {}),
      ...(kind === 'wrong-product' ? { productId: new Types.ObjectId() } : {}),
      ...(kind === 'wrong-item' ? { qualifyingOrderItemId: new Types.ObjectId() } : {}),
    })
  await expect(service.create(own.token, productId, input)).rejects.toMatchObject({
    code: 'BUSINESS_RULE_VIOLATION',
  })
})
it('serializes duplicate submissions across sessions and preserves one active review', async () => {
  const own = await account()
  await purchase(own.user._id)
  const next = await sessions.issue('customer', own.user._id)
  const result = await Promise.allSettled([
    service.create(own.token, productId, input),
    service.create(next.token, productId, input),
  ])
  expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
  expect(
    await reviewModel(db.connection).countDocuments({
      userId: own.user._id,
      productId,
      isActive: true,
    }),
  ).toBe(1)
})
it('denies guest/admin/suspended identities and customer edits to another author', async () => {
  const own = await account(),
    other = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  await expect(service.create(undefined, productId, input)).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  await expect(service.create(admin.token, productId, input)).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
  const review = await service.create(own.token, productId, input)
  await expect(service.edit(other.token, review.id, { rating: 5 })).rejects.toMatchObject({
    code: 'NOT_FOUND',
  })
  await models.users.updateOne({ _id: own.user._id }, { $set: { status: 'suspended' } })
  await expect(service.edit(own.token, review.id, { rating: 5 })).rejects.toMatchObject({
    code: 'AUTH_REQUIRED',
  })
})
it('approves legitimate negative feedback without changing its authored rating or text', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  const result = await moderate(admin.token, review.id, {
    decision: 'approve',
    reason: 'Valid delivered-purchase feedback',
  })
  expect(result).toMatchObject({
    rating: 1,
    comment: 'Legitimate negative feedback',
    status: 'approved',
  })
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 1, average: 1 })
  const events = await db.connection.db
    ?.collection('auditLogs')
    .find({ targetId: new Types.ObjectId(review.id) })
    .toArray()
  expect(
    events?.some(
      (event) =>
        event.actorType === 'admin' && event.reason === 'Valid delivered-purchase feedback',
    ),
  ).toBe(true)
  expect(JSON.stringify(events)).not.toMatch(/Legitimate negative feedback|synthetic_hash/)
})
it('resets actual edits to pending and removes the old approved rating atomically', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  await moderate(admin.token, review.id, { decision: 'approve', reason: 'Valid feedback' })
  await service.edit(own.token, review.id, { comment: input.comment.trim() })
  expect((await service.readOwn(own.token, review.id)).status).toBe('approved')
  const edited = await service.edit(own.token, review.id, { rating: 2 })
  expect(edited.status).toBe('pending')
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 0, average: 0 })
})
it('keeps prior legitimate reviews after return and allows an owned edit without a new purchase claim', async () => {
  const own = await account()
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  allowProof = false
  expect((await service.readOwn(own.token, review.id)).id).toBe(review.id)
  expect(
    (await service.edit(own.token, review.id, { comment: 'Clarified historical experience' }))
      .status,
  ).toBe('pending')
})
it('rejects customer-controlled verification/status fields and admin rating rewrites', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  await expect(
    service.create(own.token, productId, { ...input, isVerifiedPurchase: true }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  const review = await service.create(own.token, productId, input)
  await expect(service.edit(own.token, review.id, { status: 'approved' })).rejects.toMatchObject({
    code: 'VALIDATION_FAILED',
  })
  await expect(
    moderate(admin.token, review.id, { decision: 'approve', reason: 'Reason', rating: 5 }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
})
it('requires admin moderation authority and a durable audit write', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  await expect(
    moderate(own.token, review.id, { decision: 'approve', reason: 'Reason' }),
  ).rejects.toMatchObject({ code: 'AUTH_REQUIRED' })
  failAudit = true
  await expect(
    moderate(admin.token, review.id, { decision: 'approve', reason: 'Reason' }),
  ).rejects.toThrow('Synthetic audit failure')
  expect((await reviewModel(db.connection).findById(review.id))?.status).toBe('pending')
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 0, average: 0 })
})
it('reconciles concurrent approvals to the canonical product average and count', async () => {
  const a = await account(),
    b = await account(),
    admin = await account('admin'),
    otherAdmin = await account('admin')
  await purchase(a.user._id)
  await purchase(b.user._id)
  const x = await service.create(a.token, productId, input),
    y = await service.create(b.token, productId, { ...input, rating: 5 })
  await Promise.all([
    moderate(admin.token, x.id, { decision: 'approve', reason: 'Valid' }),
    moderate(otherAdmin.token, y.id, { decision: 'approve', reason: 'Valid' }),
  ])
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 2, average: 3 })
  await moderate(admin.token, x.id, {
    decision: 'hide',
    reason: 'Reported personal content',
  })
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 1, average: 5 })
})

it('does not trust a mismatched purchase-proof adapter result', async () => {
  const own = await account()
  const faulty = createReviewService(db.connection, {
    accounts,
    catalog: productReviewAccess(db.connection),
    audit,
    eligibility: async () => ({
      userId: new Types.ObjectId().toHexString(),
      productId,
      qualifyingOrderItemId: itemId,
      orderId: new Types.ObjectId().toHexString(),
      delivered: true,
      eligible: true,
    }),
  })
  await expect(faulty.create(own.token, productId, input)).rejects.toMatchObject({
    code: 'BUSINESS_RULE_VIOLATION',
  })
  expect(await reviewModel(db.connection).countDocuments({ productId })).toBe(0)
})
it('defaults moderation to denied and preserves audit history when a later customer edit resets metadata', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  const closed = createReviewService(db.connection, {
    accounts,
    catalog: productReviewAccess(db.connection),
    audit,
    eligibility: proof,
  })
  await expect(
    closed.moderate(admin.token, review.id, { decision: 'approve', reason: 'Valid' }, 'closed'),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  const noReceipt = createReviewService(db.connection, {
    accounts,
    catalog: productReviewAccess(db.connection),
    audit,
    eligibility: proof,
    moderator,
  })
  await expect(
    noReceipt.moderate(
      admin.token,
      review.id,
      { decision: 'approve', reason: 'Valid' },
      'missing-receipt',
    ),
  ).rejects.toMatchObject({ code: 'FORBIDDEN' })
  await moderate(admin.token, review.id, {
    decision: 'reject',
    reason: 'Specific documented content issue',
  })
  await service.edit(own.token, review.id, { comment: 'Corrected content' })
  const row = await reviewModel(db.connection).findById(review.id).lean()
  expect(row?.moderationReason).toBeUndefined()
  expect(row?.moderatedAt).toBeUndefined()
  expect(
    await db.connection.db
      ?.collection('auditLogs')
      .countDocuments({ targetId: new Types.ObjectId(review.id), action: 'review.reject' }),
  ).toBe(1)
})
it('rolls back review creation and purchase/product fences when durable audit fails', async () => {
  const own = await account()
  await purchase(own.user._id)
  const before = await productModels(db.connection).products.findById(productId).lean()
  failAudit = true
  await expect(service.create(own.token, productId, input)).rejects.toThrow(
    'Synthetic audit failure',
  )
  expect(await reviewModel(db.connection).countDocuments({ productId })).toBe(0)
  expect((await productModels(db.connection).products.findById(productId))?.revision).toBe(
    before?.revision,
  )
  expect(
    (
      await db.connection.db
        ?.collection('orders')
        .findOne({ userId: own.user._id, productId: new Types.ObjectId(productId) })
    )?.fixtureFence,
  ).toBe(0)
})
it('keeps summaries consistent when customer edit and moderation race', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  await Promise.all([
    service.edit(own.token, review.id, { rating: 4 }),
    moderate(admin.token, review.id, { decision: 'approve', reason: 'Valid' }),
  ])
  const final = await reviewModel(db.connection).findById(review.id)
  expect(final?.rating).toBe(4)
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject(
    final?.status === 'approved'
      ? { approvedCount: 1, average: 4 }
      : { approvedCount: 0, average: 0 },
  )
})
it('enforces raw unique/partial indexes and review field constraints', async () => {
  const own = await account()
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input)
  const row = await reviewModel(db.connection).findById(review.id).lean()
  if (!row || !db.connection.db) throw new Error('Missing fixture')
  const { _id: _, ...fields } = row
  const collection = db.connection.db.collection('reviews')
  await expect(collection.insertOne(fields)).rejects.toMatchObject({ code: 11000 })
  await collection.insertOne({ ...fields, isActive: false })
  await expect(
    collection.insertOne({ ...fields, userId: new Types.ObjectId(), rating: 6 }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.insertOne({ ...fields, userId: new Types.ObjectId(), rating: 1.5 }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.insertOne({ ...fields, userId: new Types.ObjectId(), comment: '   ' }),
  ).rejects.toMatchObject({ code: 121 })
  await expect(
    collection.insertOne({ ...fields, userId: new Types.ObjectId(), status: 'approved' }),
  ).rejects.toMatchObject({ code: 121 })
})
it('fails closed without its index or with an incompatible validator', async () => {
  const own = await account()
  await purchase(own.user._id)
  await reviewModel(db.connection).collection.dropIndex('review_active_customer_product_unique')
  try {
    await expect(service.create(own.token, productId, input)).rejects.toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
    })
  } finally {
    await reviewModel(db.connection).createIndexes()
  }
  await db.connection.db?.command({ collMod: 'reviews', validator: {} })
  try {
    await expect(initializeReviewPersistence(db.connection)).rejects.toThrow(/reviewed/)
  } finally {
    const { reviewValidator } = await import('../../src/modules/reviews/review.persistence.js')
    await db.connection.db?.command({
      collMod: 'reviews',
      validator: reviewValidator,
      validationLevel: 'strict',
      validationAction: 'error',
    })
  }
})

it('updates existing public catalog ratings only after approval and removes edited ratings immediately', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const product = await productModels(db.connection).products.findById(productId)
  if (!product) throw new Error('Missing fixture product')
  const app = createApp({
    apiRouter: catalogRoutes(
      catalogService(db.connection, async () => new Map()),
      [],
    ),
  })
  const path = `/api/v1/products/${product.slug}`
  const review = await service.create(own.token, productId, input)
  expect((await request(app).get(path).expect(200)).body.data.rating).toBeUndefined()
  await moderate(admin.token, review.id, {
    decision: 'approve',
    reason: 'Valid negative feedback',
  })
  expect((await request(app).get(path).expect(200)).body.data.rating).toEqual({
    average: 1,
    count: 1,
  })
  await service.edit(own.token, review.id, { rating: 2 })
  expect((await request(app).get(path).expect(200)).body.data.rating).toBeUndefined()
})
it('bootstraps review persistence additively but refuses production mode', async () => {
  const own = await account()
  await purchase(own.user._id)
  await service.create(own.token, productId, input)
  const count = await reviewModel(db.connection).countDocuments()
  const env = {
    ...process.env,
    ...testEnvironment(),
    MONGODB_URI: db.replica.getUri(),
    MONGODB_DB_NAME: db.connection.name,
  }
  for (let pass = 0; pass < 2; pass++) {
    const result = spawnSync(process.execPath, ['scripts/bootstrap-reviews.mjs'], {
      env,
      encoding: 'utf8',
      timeout: 15000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Review persistence ready;')
    expect(result.stderr).toBe('')
  }
  expect(await reviewModel(db.connection).countDocuments()).toBe(count)
  const refused = spawnSync(process.execPath, ['scripts/bootstrap-reviews.mjs'], {
    env: {
      ...env,
      NODE_ENV: 'production',
      APP_ENV: 'production',
      API_PUBLIC_ORIGIN: 'https://api.example.test',
      STOREFRONT_ORIGIN: 'https://shop.example.test',
      ADMIN_ORIGIN: 'https://admin.example.test',
      CORS_ALLOWED_ORIGINS: 'https://shop.example.test,https://admin.example.test',
    },
    encoding: 'utf8',
    timeout: 15000,
  })
  expect(refused.status).toBe(1)
  expect(await reviewModel(db.connection).countDocuments()).toBe(count)
})

it('does not reapprove a later customer edit when an old moderation request is replayed', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input),
    action = { decision: 'approve', reason: 'Reviewed original text' }
  await moderate(admin.token, review.id, action, 'stable-approval')
  await service.edit(own.token, review.id, { rating: 4, comment: 'New content requires review' })
  expect((await moderate(admin.token, review.id, action, 'stable-approval')).status).toBe('pending')
  expect((await reviewModel(db.connection).findById(review.id))?.status).toBe('pending')
  expect(
    (await productModels(db.connection).products.findById(productId))?.ratingSummary,
  ).toMatchObject({ approvedCount: 0, average: 0 })
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({
      targetId: new Types.ObjectId(review.id),
      actorType: 'admin',
      action: 'review.approve',
    }),
  ).toBe(1)
})
it('deduplicates concurrent moderation causes and rejects changed replay payloads', async () => {
  const own = await account(),
    admin = await account('admin')
  await purchase(own.user._id)
  const review = await service.create(own.token, productId, input),
    action = { decision: 'approve', reason: 'Valid review' }
  await Promise.all([
    moderate(admin.token, review.id, action, 'same-cause'),
    moderate(admin.token, review.id, action, 'same-cause'),
  ])
  expect(
    await db.connection.db?.collection('auditLogs').countDocuments({
      targetId: new Types.ObjectId(review.id),
      actorType: 'admin',
      action: 'review.approve',
    }),
  ).toBe(1)
  await expect(
    moderate(
      admin.token,
      review.id,
      { decision: 'hide', reason: 'Different request' },
      'same-cause',
    ),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  expect((await reviewModel(db.connection).findById(review.id))?.status).toBe('approved')
})
