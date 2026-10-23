import { CategoryPage, categoryMetadata } from '../../../../features/catalog/catalog-page'
export const dynamic = 'force-dynamic'
type Props = { params: Promise<{ slug: string }> }
export async function generateMetadata({ params }: Props) {
  return categoryMetadata((await params).slug)
}
export default async function Page({ params }: Props) {
  return <CategoryPage slug={(await params).slug} />
}
