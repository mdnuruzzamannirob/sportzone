import { StorefrontShell } from '../components/layout/storefront-shell'
import { MissingPage } from '../components/ui/storefront-states'

export default function NotFound() {
  return (
    <StorefrontShell>
      <MissingPage />
    </StorefrontShell>
  )
}
