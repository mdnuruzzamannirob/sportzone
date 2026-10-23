'use client'
import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '../../components/ui/button'
export function CatalogRefresh() {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <Button
      variant="secondary"
      isPending={pending}
      pendingLabel="Refreshing…"
      onPress={() => start(() => router.refresh())}
    >
      Refresh catalog
    </Button>
  )
}
