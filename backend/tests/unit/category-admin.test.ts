import { expect, it } from 'vitest'
import {
  categoryCreate,
  categoryPatch,
  categoryListQuery,
} from '../../src/modules/catalog/categories/category-admin.schema.js'
it('normalizes identity while bounding names/slugs and display order', () => {
  expect(categoryCreate.parse({ name: ' Sports ', slug: ' SPORTS ' })).toEqual({
    name: 'Sports',
    slug: 'sports',
  })
  for (const patch of [
    { slug: 'bad/path' },
    { slug: 'a'.repeat(161) },
    { name: '' },
    { sortOrder: -1 },
    { sortOrder: 1.5 },
  ])
    expect(categoryCreate.safeParse({ name: 'Sports', slug: 'sports', ...patch }).success).toBe(
      false,
    )
})
it('permits null only for declared patch removals and rejects empty/protected updates', () => {
  expect(categoryPatch.parse({ parentId: null, image: null })).toEqual({
    parentId: null,
    image: null,
  })
  for (const input of [
    {},
    { name: null },
    { status: null },
    { revision: 1 },
    { image: null, userId: 'foreign' },
  ])
    expect(categoryPatch.safeParse(input).success).toBe(false)
  expect(categoryCreate.safeParse({ name: 'Sports', slug: 'sports', parentId: null }).success).toBe(
    false,
  )
})
it('rejects noncanonical public media locations and private delivery URLs', () => {
  const image = {
    publicId: `sportzone/${'a'.repeat(24)}`,
    url: 'https://res.cloudinary.com/synthetic/image.png',
  }
  expect(categoryPatch.safeParse({ image }).success).toBe(true)
  for (const url of [
    'http://host/image.png',
    'https://user:password@host/image.png',
    'https://host/image.png?token=private',
    'https://host/image.png#private',
  ])
    expect(categoryPatch.safeParse({ image: { ...image, url } }).success).toBe(false)
  expect(categoryPatch.safeParse({ image: { ...image, assetId: 'unapproved' } }).success).toBe(
    false,
  )
})
it('bounds pagination and rejects unknown list filters', () => {
  expect(categoryListQuery.parse({})).toEqual({ page: 1, pageSize: 20 })
  for (const input of [
    { pageSize: '101' },
    { page: String(Number.MAX_SAFE_INTEGER), pageSize: '100' },
    { status: 'deleted' },
    { userId: 'foreign' },
  ])
    expect(categoryListQuery.safeParse(input).success).toBe(false)
})

it('bounds category-image alt by Unicode characters consistently with generated fallbacks', () => {
  const image = {
    publicId: `sportzone/${'a'.repeat(24)}`,
    url: 'https://res.cloudinary.com/synthetic/image.png',
  }
  expect(categoryPatch.safeParse({ image: { ...image, alt: '😀'.repeat(120) } }).success).toBe(true)
  expect(categoryPatch.safeParse({ image: { ...image, alt: '😀'.repeat(121) } }).success).toBe(
    false,
  )
})
