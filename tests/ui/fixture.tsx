// Test-only surface. Never imported by either production application.
import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { AdminShell } from '../../admin/src/components/layout/admin-shell'
import { DataTable } from '../../admin/src/components/management/data-table'
import { FileUpload } from '../../admin/src/components/management/file-upload'
import { GuardedAction } from '../../admin/src/components/management/guarded-action'
import {
  FilterToolbar,
  ListPagination,
} from '../../admin/src/components/management/list-controls'
import { TextInput } from '../../admin/src/components/ui/fields'
import './fixture.css'
import { CartLine } from '../../storefront/src/components/commerce/cart-line'
import { CommerceSkeleton } from '../../storefront/src/components/commerce/commerce-skeleton'
import { OrderSummary } from '../../storefront/src/components/commerce/order-summary'
import { ProductCard } from '../../storefront/src/components/commerce/product-card'
import { VariantSelector } from '../../storefront/src/components/commerce/variant-selector'

function Fixture() {
  const [query, setQuery] = useState('')
  const [reason, setReason] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [variant, setVariant] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [page, setPage] = useState(1)
  const amounts = {
    regularSubtotalPoisha: 20000,
    productDiscountPoisha: 1000,
    couponDiscountPoisha: 0,
    deliveryChargePoisha: 6000,
    finalTotalPoisha: 25000,
  }
  return (
    <AdminShell title="Foundation audit fixture">
      <div className="space-y-8">
        <section aria-label="Management examples" className="min-w-0 space-y-4">
          <FilterToolbar
            query={query}
            onQueryChange={setQuery}
            onApply={() => setPage(1)}
            onClear={() => setQuery('')}
          />
          <DataTable
            label="Synthetic products"
            rows={[
              {
                id: 'sample',
                name: 'Training equipment — synthetic record',
                status: 'Inactive',
              },
            ]}
            columns={[
              { id: 'name', label: 'Product', render: (row) => row.name },
              { id: 'status', label: 'Status', render: (row) => row.status },
              {
                id: 'details',
                label: 'Details',
                render: () =>
                  'Long descriptive content retained in the local table scroll region',
              },
            ]}
          />
          <ListPagination
            page={page}
            totalPages={3}
            totalItems={60}
            onPageChange={setPage}
          />
          <FileUpload
            label="Product image"
            file={file}
            onSelect={setFile}
            onRemove={() => setFile(null)}
            acceptedTypes={['image/png', 'image/jpeg', 'image/webp']}
            maxBytes={1048576}
          />
          <GuardedAction
            label="Deactivate sample"
            title="Confirm deactivation"
            description="Synthetic fixture: no operation is sent."
            context={<p>Record: sample. Current status: inactive.</p>}
            eligible
            requiresReason
            reason={reason}
            onReasonChange={setReason}
            onConfirm={() => {}}
            error="Synthetic rejection; draft retained."
          />
          <TextInput
            id="bengali"
            label="Bengali specimen"
            value="বাংলাদেশ — খেলার সরঞ্জাম"
            onChange={() => {}}
          />
        </section>
        <section
          aria-label="Commerce examples"
          className="grid min-w-0 gap-4 sm:grid-cols-2"
        >
          <ProductCard
            name="Training ball — synthetic example"
            href="#product"
            effectivePricePoisha={19000}
            regularPricePoisha={20000}
            availability="available"
          />
          <OrderSummary amounts={amounts} kind="estimate" method="cod" />
          <CartLine
            name="Training ball"
            href="#product"
            variant="Standard"
            sku="SYNTHETIC-1"
            quantity={quantity}
            maxQuantity={3}
            availability="available"
            estimatedUnitPoisha={19000}
            estimatedLinePoisha={19000}
            onQuantityChange={setQuantity}
            onRemove={() => {}}
          />
          <VariantSelector
            options={[
              { id: 'one', label: 'Standard', available: true },
              { id: 'two', label: 'Unavailable', available: false },
            ]}
            value={variant}
            onChange={setVariant}
          />
          <CommerceSkeleton kind="product" />
        </section>
      </div>
    </AdminShell>
  )
}
const root = document.getElementById('root')
if (!root) throw new Error('Missing fixture root')
createRoot(root).render(
  <BrowserRouter>
    <Fixture />
  </BrowserRouter>,
)
