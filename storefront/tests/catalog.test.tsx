import { afterEach, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createCatalogReader, catalog } from '../src/features/catalog/catalog.server'
import {
  catalogMetadata,
  catalogOrigin,
  productStructuredData,
  serializeStructuredData,
} from '../src/features/catalog/catalog.seo'
import {
  ProductsPage,
  ProductPage,
  stockDisclaimer,
  productMetadata,
  categoryMetadata,
} from '../src/features/catalog/catalog-page'
import { productSchema } from '../src/features/catalog/catalog.schema'
vi.mock('next/navigation', () => ({
  notFound: () => {
    throw new Error('NOT_FOUND')
  },
  useRouter: () => ({ refresh: vi.fn() }),
}))
const card = {
  id: '535a00000000000000000001',
  slug: 'synthetic-ball',
  name: 'Synthetic Ball',
  regularPricePoisha: 20000,
  effectivePricePoisha: 15000,
  availability: 'available' as const,
}
const product = {
  ...card,
  description: 'Synthetic plain description',
  categories: [{ id: '535a00000000000000000002', slug: 'cricket', name: 'Cricket' }],
  images: [],
  variants: [
    {
      id: '535a00000000000000000003',
      sku: 'BALL',
      attributes: {},
      regularPricePoisha: 20000,
      effectivePricePoisha: 15000,
      availableQty: 2,
    },
  ],
  relatedProducts: [],
}
const page = {
  data: [card],
  meta: { requestId: 'synthetic', page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
}
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})
it('uses only credential-free GET/no-store reads and refetches edited upstream data', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(Response.json(page))
    .mockResolvedValueOnce(Response.json({ ...page, data: [{ ...card, name: 'Updated Ball' }] }))
  const reader = createCatalogReader('https://api.example.test', transport)
  expect((await reader.products()).kind).toBe('ok')
  const edited = await reader.products()
  expect(edited.kind === 'ok' && edited.value.data[0]?.name).toBe('Updated Ball')
  expect(transport).toHaveBeenCalledTimes(2)
  expect(transport.mock.calls[0]).toEqual([
    'https://api.example.test/api/v1/products',
    expect.objectContaining({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
    }),
  ])
})
it.each([
  'https://user:secret@api.example.test',
  'https://api.example.test/path',
  'https://api.example.test/',
  'http://foreign.example.test',
  undefined,
])('disables reads for invalid/unset origin %s', async (origin) => {
  const transport = vi.fn<typeof fetch>()
  expect((await createCatalogReader(origin, transport).products()).kind).toBe('unavailable')
  expect(transport).not.toHaveBeenCalled()
})
it('rejects private/forged paths, duplicate filters and private fields in public payloads', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(
      Response.json({ ...page, data: [{ ...card, passwordHash: 'never-render' }] }),
    )
  const reader = createCatalogReader('https://api.example.test', transport)
  expect((await reader.product('../account')).kind).toBe('not-found')
  expect((await reader.products({ q: ['one', 'two'] })).kind).toBe('unavailable')
  expect((await reader.products({ session: 'private' })).kind).toBe('unavailable')
  expect(transport).not.toHaveBeenCalled()
  expect((await reader.products()).kind).toBe('unavailable')
})
it('maps missing and failed resources without exposing upstream error contents', async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(new Response('private diagnostic', { status: 404 }))
    .mockResolvedValueOnce(new Response('private diagnostic', { status: 503 }))
    .mockRejectedValueOnce(new Error('secret'))
  const reader = createCatalogReader('https://api.example.test', transport)
  expect(await reader.product('missing')).toEqual({ kind: 'not-found' })
  expect(await reader.product('missing')).toEqual({ kind: 'unavailable' })
  expect(await reader.product('missing')).toEqual({ kind: 'unavailable' })
})
it('uses configured canonical origins and keeps query/error/private-shaped paths unindexable', () => {
  expect(
    catalogMetadata('https://shop.example.test', '/products/synthetic-ball', 'Ball', 'Description')
      .alternates?.canonical,
  ).toBe('https://shop.example.test/products/synthetic-ball')
  expect(catalogMetadata(undefined, '/products', 'Products', 'Description').robots).toEqual({
    index: false,
    follow: false,
  })
  expect(
    catalogMetadata(
      'https://shop.example.test',
      '//foreign.example.test',
      'Products',
      'Description',
    ).alternates,
  ).toBeUndefined()
  expect(
    catalogMetadata('https://shop.example.test', '/products', 'Products', 'Description', false)
      .robots,
  ).toEqual({ index: false, follow: true })
  expect(catalogOrigin('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000')
})
it('emits accurate safe structured prices and never fabricates ratings or approved images', () => {
  const parsed = productSchema.parse(product)
  const data = productStructuredData(parsed, 'https://shop.example.test')
  expect(data?.offers.lowPrice).toBe('150.00')
  expect(data?.offers.availability).toBe('https://schema.org/InStock')
  expect(data).not.toHaveProperty('aggregateRating')
  expect(data).not.toHaveProperty('image')
  const maximum = productStructuredData(
    {
      ...parsed,
      effectivePricePoisha: Number.MAX_SAFE_INTEGER,
      variants: parsed.variants.map((variant) => ({
        ...variant,
        effectivePricePoisha: Number.MAX_SAFE_INTEGER,
      })),
    },
    'https://shop.example.test',
  )
  expect(maximum?.offers.lowPrice).toBe('90071992547409.91')
  expect(maximum?.offers.highPrice).toBe('90071992547409.91')
  expect(serializeStructuredData({ name: '</script><script>unsafe</script>' })).not.toContain('<')
})
it('server-renders public content and disclaimer, with no placeholder purchase action', async () => {
  vi.spyOn(catalog, 'products').mockResolvedValue({ kind: 'ok', value: page })
  const html = renderToStaticMarkup(await ProductsPage({}))
  expect(html).toContain('Synthetic Ball')
  expect(html).toContain('/products/synthetic-ball')
  expect(html).toContain(stockDisclaimer)
  expect(html).not.toContain('Add to cart')
})
it('renders product metadata content safely and preserves confirmed 404 versus unavailable states', async () => {
  vi.stubEnv('STOREFRONT_ORIGIN', 'https://shop.example.test')
  vi.spyOn(catalog, 'product')
    .mockResolvedValueOnce({
      kind: 'ok',
      value: { data: product, meta: { requestId: 'synthetic' } },
    })
    .mockResolvedValueOnce({ kind: 'not-found' })
    .mockResolvedValueOnce({ kind: 'unavailable' })
  const html = renderToStaticMarkup(await ProductPage({ slug: 'synthetic-ball' }))
  expect(html).toContain('application/ld+json')
  expect(html).toContain('Synthetic plain description')
  expect(html).toContain('/categories/cricket')
  await expect(ProductPage({ slug: 'missing' })).rejects.toThrow('NOT_FOUND')
  expect(renderToStaticMarkup(await ProductPage({ slug: 'missing' }))).toContain(
    'Catalog temporarily unavailable',
  )
})

it('returns confirmed metadata 404s before streaming instead of indexable unavailable pages', async () => {
  vi.spyOn(catalog, 'product').mockResolvedValue({ kind: 'not-found' })
  vi.spyOn(catalog, 'category').mockResolvedValue({ kind: 'not-found' })
  await expect(productMetadata('missing')).rejects.toThrow('NOT_FOUND')
  await expect(categoryMetadata('missing')).rejects.toThrow('NOT_FOUND')
})
