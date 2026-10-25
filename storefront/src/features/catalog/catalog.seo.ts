import type { Metadata } from 'next'
import type { Product } from './catalog.schema'

export function catalogOrigin(value: string | undefined) {
  try {
    const url = new URL(value ?? '')
    if (
      url.origin !== value ||
      url.username ||
      url.password ||
      (url.protocol !== 'https:' &&
        !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))
    )
      return undefined
    return url.origin
  } catch {
    return undefined
  }
}
export function catalogMetadata(
  origin: string | undefined,
  path: string,
  title: string,
  description: string,
  index = true,
): Metadata {
  const site = /^\/(products|categories)(\/[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(path)
    ? catalogOrigin(origin)
    : undefined
  return {
    title,
    description: description.slice(0, 160),
    robots: { index: !!site && index, follow: !!site },
    ...(site
      ? {
          alternates: { canonical: new URL(path, site).href },
          openGraph: {
            type: 'website',
            title,
            description: description.slice(0, 160),
            url: new URL(path, site).href,
            siteName: 'SportZone',
          },
        }
      : {}),
  }
}
function schemaPrice(value: number) {
  return `${Math.floor(value / 100)}.${String(value % 100).padStart(2, '0')}`
}
export function productStructuredData(product: Product, origin: string | undefined) {
  const site = catalogOrigin(origin)
  if (!site) return undefined
  const url = new URL(`/products/${product.slug}`, site).href
  return {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.description,
    url,
    ...(product.images.length ? { image: product.images.map((image) => image.url) } : {}),
    offers: {
      '@type': 'AggregateOffer',
      priceCurrency: 'BDT',
      lowPrice: schemaPrice(product.effectivePricePoisha),
      highPrice: schemaPrice(
        Math.max(...product.variants.map((variant) => variant.effectivePricePoisha)),
      ),
      offerCount: product.variants.length,
      availability: `https://schema.org/${product.availability === 'available' ? 'InStock' : 'OutOfStock'}`,
      url,
    },
    ...(product.rating
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: product.rating.average,
            reviewCount: product.rating.count,
          },
        }
      : {}),
  }
}
export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
  )
}
