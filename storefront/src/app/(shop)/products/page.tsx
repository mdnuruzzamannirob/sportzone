import { ProductsPage, productsMetadata } from '../../../features/catalog/catalog-page'
export const dynamic = 'force-dynamic'
type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> }
export async function generateMetadata({ searchParams }: Props) {
  return productsMetadata(await searchParams)
}
export default async function Page({ searchParams }: Props) {
  return <ProductsPage query={await searchParams} />
}
