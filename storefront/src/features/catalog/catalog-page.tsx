import { notFound } from 'next/navigation'
import { PagePanel } from '../../components/ui/page-panel'
import { Link } from '../../components/ui/link'
import { Price } from '../../components/commerce/price'
import { catalog } from './catalog.server'
import { CatalogRefresh } from './catalog-refresh'
import { catalogMetadata, productStructuredData, serializeStructuredData } from './catalog.seo'

export const stockDisclaimer =
  'Prices and availability can change. Stock and totals are checked again at checkout.'
export function CatalogUnavailable() {
  return (
    <PagePanel id="catalog-title" title="Catalog temporarily unavailable">
      <p className="text-muted">Catalog information could not be loaded. Please try again.</p>
      <CatalogRefresh />
    </PagePanel>
  )
}
export async function productsMetadata(query: Record<string, string | string[] | undefined>) {
  const result = await catalog.products(query)
  return catalogMetadata(
    process.env.STOREFRONT_ORIGIN,
    '/products',
    'Products',
    'Browse sports products from SportZone.',
    result.kind === 'ok' && !Object.keys(query).length,
  )
}
export async function ProductsPage({
  query = {},
  title = 'Products',
}: {
  query?: Record<string, string | string[] | undefined>
  title?: string
}) {
  const result = await catalog.products(query)
  if (result.kind !== 'ok') return <CatalogUnavailable />
  return (
    <PagePanel id="catalog-title" title={title}>
      <p role="note" className="text-muted">
        {stockDisclaimer}
      </p>
      {result.value.data.length ? (
        <ul className="w-full space-y-6">
          {result.value.data.map((product) => (
            <li key={product.id} className="space-y-2">
              <Link href={`/products/${product.slug}`} prefetch={false}>
                {product.name}
              </Link>
              <p>
                <Price
                  amountPoisha={product.effectivePricePoisha}
                  regularPricePoisha={product.regularPricePoisha}
                />
              </p>
              <p className="text-sm text-muted">
                {product.availability === 'available' ? 'Available to order' : 'Out of stock'}
              </p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No products found.</p>
      )}
      <CatalogRefresh />
    </PagePanel>
  )
}
export async function productMetadata(slug: string) {
  const result = await catalog.product(slug)
  if (result.kind === 'not-found') notFound()
  return catalogMetadata(
    process.env.STOREFRONT_ORIGIN,
    `/products/${slug}`,
    result.kind === 'ok' ? result.value.data.name : 'Product unavailable',
    result.kind === 'ok' ? result.value.data.description : 'Product information is unavailable.',
    result.kind === 'ok',
  )
}
export async function ProductPage({ slug }: { slug: string }) {
  const result = await catalog.product(slug)
  if (result.kind === 'not-found') notFound()
  if (result.kind !== 'ok') return <CatalogUnavailable />
  const product = result.value.data
  const structured = productStructuredData(product, process.env.STOREFRONT_ORIGIN)
  return (
    <PagePanel id="product-title" title={product.name}>
      {structured && (
        <script type="application/ld+json">{serializeStructuredData(structured)}</script>
      )}
      <p className="whitespace-pre-line">{product.description}</p>
      <Price
        amountPoisha={product.effectivePricePoisha}
        regularPricePoisha={product.regularPricePoisha}
      />
      <p>{product.availability === 'available' ? 'Available to order' : 'Out of stock'}</p>
      <p role="note" className="text-sm text-muted">
        {stockDisclaimer}
      </p>
      <nav aria-label="Product categories" className="flex flex-wrap gap-4">
        {product.categories.map((category) => (
          <Link key={category.id} href={`/categories/${category.slug}`} prefetch={false}>
            {category.name}
          </Link>
        ))}
      </nav>
      {product.rating && (
        <p>
          {product.rating.average} out of 5 · {product.rating.count} approved reviews
        </p>
      )}
      <CatalogRefresh />
      <Link href="/products" prefetch={false}>
        Browse products
      </Link>
    </PagePanel>
  )
}
export async function categoryMetadata(slug: string) {
  const result = await catalog.category(slug)
  if (result.kind === 'not-found') notFound()
  const listing = result.kind === 'ok' ? await catalog.products({ category: slug }) : undefined
  return catalogMetadata(
    process.env.STOREFRONT_ORIGIN,
    `/categories/${slug}`,
    result.kind === 'ok' ? result.value.data.name : 'Category unavailable',
    result.kind === 'ok'
      ? `Browse ${result.value.data.name} at SportZone.`
      : 'Category information is unavailable.',
    result.kind === 'ok' && listing?.kind === 'ok',
  )
}
export async function CategoryPage({ slug }: { slug: string }) {
  const result = await catalog.category(slug)
  if (result.kind === 'not-found') notFound()
  if (result.kind !== 'ok') return <CatalogUnavailable />
  return <ProductsPage query={{ category: slug }} title={result.value.data.name} />
}
