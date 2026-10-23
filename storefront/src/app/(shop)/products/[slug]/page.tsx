import { ProductPage, productMetadata } from '../../../../features/catalog/catalog-page'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props) {
  return productMetadata((await params).slug)
}
export default async function Page({ params }: Props) {
  return <ProductPage slug={(await params).slug} />
}
