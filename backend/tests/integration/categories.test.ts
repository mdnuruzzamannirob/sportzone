import { Schema, Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { inTransaction } from '../../src/db/transaction.js'
import { createDeclaredIndexes } from '../../src/db/indexes.js'
import { categoryModel } from '../../src/modules/categories/category.model.js'
import { categoryService } from '../../src/modules/categories/category.service.js'
import { isolatedDatabase } from '../support/database.js'
let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let service: ReturnType<typeof categoryService>
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(fixture.connection))
  service = categoryService(fixture.connection)
})
beforeEach(async () => {
  await categoryModel(fixture.connection).deleteMany({})
})
afterAll(async () => {
  await fixture?.close()
})
const create = (slug: string, parentId?: string) =>
  service.create({ name: slug, slug, ...(parentId ? { parentId } : {}) })
it('enforces normalized unique slugs, strict metadata and safe integer counters', async () => {
  await create('football')
  await expect(create('Football')).rejects.toMatchObject({ code: 11000 })
  await expect(
    service.create({ name: ' ', slug: 'bad' }),
  ).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
  await expect(
    service.create({ name: 'bad', slug: 'bad', sortOrder: -1 }),
  ).rejects.toThrow()
  await expect(
    service.create({ name: 'bad', slug: 'bad', revision: 5 }),
  ).rejects.toThrow()
  await expect(
    new (categoryModel(fixture.connection))({
      name: 'x',
      slug: 'x',
      revision: 0.5,
    }).validate(),
  ).rejects.toThrow()
})
it('rejects missing parents, self references and deep cycles', async () => {
  await expect(
    create('missing', new Types.ObjectId().toHexString()),
  ).rejects.toMatchObject({ code: 'NOT_FOUND' })
  const root = await create('root')
  const child = await create('child', root.id)
  const leaf = await create('leaf', child.id)
  const current = await categoryModel(fixture.connection)
    .findById(root._id)
    .orFail()
  await expect(
    service.patch(root.id, current.revision, { parentId: leaf.id }),
  ).rejects.toMatchObject({ code: 'STATE_CONFLICT' })
  await expect(
    service.patch(root.id, current.revision, { parentId: root.id }),
  ).rejects.toThrow()
})
it('filters inactive ancestors, preserves omitted parent and supports explicit root reassignment with CAS', async () => {
  const root = await create('root')
  const child = await create('child', root.id)
  const latest = await categoryModel(fixture.connection)
    .findById(root._id)
    .orFail()
  await service.patch(root.id, latest.revision, { status: 'inactive' })
  expect(await service.publicCategories()).toHaveLength(0)
  const renamed = await service.patch(child.id, child.revision, {
    name: 'Renamed',
  })
  expect(renamed.parentId?.equals(root._id)).toBe(true)
  await expect(
    service.patch(child.id, child.revision, { name: 'Stale' }),
  ).rejects.toThrow()
  await service.patch(child.id, renamed.revision, { parentId: null })
  expect((await service.publicCategories()).map((row) => row.slug)).toEqual([
    'child',
  ])
})
it('guards child/product dependencies and rolls back rejected deletion', async () => {
  const root = await create('root')
  const child = await create('child', root.id)
  const latest = await categoryModel(fixture.connection)
    .findById(root._id)
    .orFail()
  await expect(
    service.remove(root.id, latest.revision, async () => false),
  ).rejects.toThrow()
  await expect(
    service.remove(child.id, child.revision, async () => true),
  ).rejects.toThrow()
  expect(
    (await categoryModel(fixture.connection).findById(child._id).orFail())
      .revision,
  ).toBe(child.revision)
  await service.remove(child.id, child.revision, async () => false)
  expect(
    await categoryModel(fixture.connection).findById(child._id),
  ).toBeNull()
})
it('prevents concurrent mutual reparenting and lost edits', async () => {
  const a = await create('a')
  const b = await create('b')
  const moves = await Promise.allSettled([
    service.patch(a.id, a.revision, { parentId: b.id }),
    service.patch(b.id, b.revision, { parentId: a.id }),
  ])
  expect(moves.filter((result) => result.status === 'fulfilled')).toHaveLength(
    1,
  )
  expect(await service.publicCategories()).toHaveLength(2)
  const current = await categoryModel(fixture.connection)
    .findById(a._id)
    .orFail()
  const edits = await Promise.allSettled([
    service.patch(a.id, current.revision, { name: 'one' }),
    service.patch(a.id, current.revision, { name: 'two' }),
  ])
  expect(edits.filter((result) => result.status === 'fulfilled')).toHaveLength(
    1,
  )
})
it('serializes deletion against child creation', async () => {
  const root = await create('root')
  const results = await Promise.allSettled([
    service.remove(root.id, root.revision, async () => false),
    create('child', root.id),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1)
  const child = await categoryModel(fixture.connection).findOne({
    slug: 'child',
  })
  if (child)
    expect(
      await categoryModel(fixture.connection).findById(child.parentId),
    ).not.toBeNull()
})
it('fails closed for media-ledger attachments and corrupt public ancestry', async () => {
  const root = await create('root')
  await categoryModel(fixture.connection).updateOne(
    { _id: root._id },
    {
      $set: {
        image: {
          publicId: 'fixture',
          url: 'https://example.invalid/image',
          alt: 'Fixture',
        },
      },
    },
  )
  await expect(
    service.remove(root.id, root.revision, async () => false),
  ).rejects.toThrow()
  await categoryModel(fixture.connection).updateOne(
    { _id: root._id },
    { $set: { parentId: new Types.ObjectId() } },
  )
  expect(await service.publicCategories()).toHaveLength(0)
})

it('coordinates real product-reference transactions with deletion', async () => {
  const products = fixture.connection.model(
    'CategoryProductFixture',
    new Schema({ categoryId: Schema.Types.ObjectId }),
    'category_product_fixture',
  )
  await products.createCollection()
  const root = await create('root')
  const references = async (
    key: Types.ObjectId,
    session: import('mongoose').ClientSession,
  ) => Boolean(await products.exists({ categoryId: key }).session(session))
  const results = await Promise.allSettled([
    service.remove(root.id, root.revision, references),
    inTransaction(fixture.connection, async (session) => {
      await service.guardAncestry(root._id, session, undefined, true)
      await new products({ categoryId: root._id }).save({ session })
    }),
  ])
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1)
  if (await products.exists({ categoryId: root._id })) {
    const latest = await categoryModel(fixture.connection)
      .findById(root._id)
      .orFail()
    await expect(
      service.remove(root.id, latest.revision, references),
    ).rejects.toThrow()
  }
  const inactive = await service.create({
    name: 'inactive',
    slug: 'inactive',
    status: 'inactive',
  })
  await expect(
    inTransaction(fixture.connection, (session) =>
      service.guardAncestry(inactive._id, session, undefined, true),
    ),
  ).rejects.toThrow()
})
