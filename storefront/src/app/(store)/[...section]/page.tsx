import type { Metadata } from 'next'
import { PagePanel } from '../../../components/ui/page-panel'
import { notFound } from 'next/navigation'

const destinations: Record<string, string> = {
  products: 'Products',
  search: 'Search',
  wishlist: 'Wishlist',
  cart: 'Cart',
  contact: 'Contact',
  support: 'Customer support',
  'policies/shipping': 'Shipping policy',
  'policies/cancellation': 'Cancellation policy',
  'policies/returns-refunds': 'Returns and refunds policy',
  'policies/privacy': 'Privacy policy',
  'policies/terms': 'Terms',
}
export const dynamicParams = false
export const metadata: Metadata = { robots: { index: false, follow: false } }
export function generateStaticParams() {
  return Object.keys(destinations).map((path) => ({ section: path.split('/') }))
}
export default async function DestinationPage({
  params,
}: {
  params: Promise<{ section: string[] }>
}) {
  const { section } = await params
  const path = section.join('/')
  const title = Object.hasOwn(destinations, path) ? destinations[path] : undefined
  if (!title) notFound()
  return (
    <PagePanel id="destination-title" title={title}>
      <p className="max-w-prose text-text-muted">This page is not available yet.</p>
    </PagePanel>
  )
}
