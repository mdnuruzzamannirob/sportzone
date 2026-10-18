import { StorefrontShell } from '../components/storefront-shell'
import { MissingPage } from '../components/storefront-states'

export default function NotFound() {
  return <StorefrontShell><MissingPage /></StorefrontShell>
}
