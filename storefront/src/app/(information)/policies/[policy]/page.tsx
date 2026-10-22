import { notFound } from 'next/navigation'
import { UnavailablePage } from '../../../../components/layout/unavailable-page'
import { policyTitles } from '../../../../features/policies/policies'
export { unavailableMetadata as metadata } from '../../../../components/layout/unavailable-page'

export const dynamicParams = false
export function generateStaticParams() {
  return Object.keys(policyTitles).map((policy) => ({ policy }))
}
export default async function PolicyPage({ params }: { params: Promise<{ policy: string }> }) {
  const { policy } = await params
  const title = Object.hasOwn(policyTitles, policy) ? policyTitles[policy] : undefined
  if (!title) notFound()
  return <UnavailablePage title={title} />
}
