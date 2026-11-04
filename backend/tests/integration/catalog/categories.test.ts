import { Types } from 'mongoose'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { categoryModel } from '../../../src/modules/catalog/categories/category.model.js'
import { createCategoryService } from '../../../src/modules/catalog/categories/category.service.js'
import { createDeclaredIndexes } from '../../../src/shared/database/indexes.js'

import { isolatedDatabase } from '../../helpers/database.js'

let fixture: Awaited<ReturnType<typeof isolatedDatabase>>
let service: ReturnType<typeof createCategoryService>
beforeAll(async () => {
  fixture = await isolatedDatabase()
  await createDeclaredIndexes(categoryModel(fixture.connection))
  service = createCategoryService(fixture.connection)
})
beforeEach(async () => {
  await categoryModel(fixture.connection).deleteMany({})
})
afterAll(async () => {
  await fixture?.close()
})
const create = (slug: string, parentId?: string) =>
  service.create({ name: slug, slug, ...(parentId ? { parentId } : {}) })
it('guards child/product dependencies and rolls back rejected deletion', async () => {
  const root = await create('root')
  const child = await create('child', root.id)
  const latest = await categoryModel(fixture.connection).findById(root._id).orFail()
  await expect(service.remove(root.id, latest.revision, async () => false)).rejects.toThrow()
  await expect(service.remove(child.id, child.revision, async () => true)).rejects.toThrow()
  expect((await categoryModel(fixture.connection).findById(child._id).orFail()).revision).toBe(
    child.revision,
  )
  await service.remove(child.id, child.revision, async () => false)
  expect(await categoryModel(fixture.connection).findById(child._id)).toBeNull()
})
it('serializes deletion against child creation', async () => {
  const root = await create('root')
  const results = await Promise.allSettled([
    service.remove(root.id, root.revision, async () => false),
    create('child', root.id),
  ])
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
  const child = await categoryModel(fixture.connection).findOne({
    slug: 'child',
  })
  if (child) expect(await categoryModel(fixture.connection).findById(child.parentId)).not.toBeNull()
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
  await expect(service.remove(root.id, root.revision, async () => false)).rejects.toThrow()
  await categoryModel(fixture.connection).updateOne(
    { _id: root._id },
    { $set: { parentId: new Types.ObjectId() } },
  )
  expect(await service.publicCategories()).toHaveLength(0)
})
