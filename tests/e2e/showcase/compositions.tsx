import { useState, type ReactNode } from 'react'
import type { PreviewUI } from './catalog'
import { CartLine } from '../../../storefront/src/components/commerce/cart-line'
import { ProductCard } from '../../../storefront/src/components/commerce/product-card'
import { ProductImage } from '../../../storefront/src/components/commerce/product-image'
import { Price } from '../../../storefront/src/components/commerce/price'
import { OrderSummary } from '../../../storefront/src/components/commerce/order-summary'
import {
  StatusBadge,
  AvailabilityBadge,
} from '../../../storefront/src/components/commerce/status-badge'
import { VariantSelector } from '../../../storefront/src/components/commerce/variant-selector'
import { CommerceSkeleton } from '../../../storefront/src/components/commerce/commerce-skeleton'
import { DataTable } from '../../../admin/src/components/management/data-table'
import { FileUpload } from '../../../admin/src/components/management/file-upload'
import { GuardedAction } from '../../../admin/src/components/management/guarded-action'
import {
  FilterToolbar,
  ListPagination,
} from '../../../admin/src/components/management/list-controls'

function Sample({
  title,
  children,
  wide = false,
}: {
  title: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <section className={`preview-sample${wide ? ' preview-wide' : ''}`}>
      <h3>{title}</h3>
      <div className="preview-stack">{children}</div>
    </section>
  )
}

export function AppCompositions({ UI, name }: { UI: PreviewUI; name: string }) {
  const [text, setText] = useState('Training ball')
  const [value, setValue] = useState<string | null>('standard')
  const [quantity, setQuantity] = useState(1)
  const [page, setPage] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)
  const options = [
    { value: 'standard', label: 'Standard' },
    { value: 'unavailable', label: 'Unavailable', disabled: true },
  ]
  if (name === 'App fields')
    return (
      <div className="native-grid">
        <Sample title="Text input">
          <UI.TextInput
            id="app-text"
            label="Product name"
            value={text}
            onChange={setText}
            description="App-owned field composition."
          />
        </Sample>
        <Sample title="Multiline input">
          <UI.TextInput id="app-area" label="Notes" multiline value={text} onChange={setText} />
        </Sample>
        <Sample title="Validation error">
          <UI.TextInput
            id="app-error"
            label="Invalid field"
            error="Example rejection. Your draft is retained."
            value={text}
            onChange={setText}
          />
        </Sample>
        <Sample title="Selection">
          <UI.SelectField
            id="app-select"
            label="Select option"
            value={value}
            onChange={setValue}
            options={options}
          />
        </Sample>
        <Sample title="Checkbox">
          <UI.CheckboxField label="Confirm selection" />
        </Sample>
        <Sample title="Radio choices">
          <UI.RadioChoices
            label="Delivery option"
            error="Choose an available option."
            defaultValue="standard"
            options={options}
          />
        </Sample>
        <Sample title="Form and error summary" wide>
          <UI.Form className="preview-stack" aria-label="Example app form" onSubmit={() => {}}>
            <UI.FormErrorSummary
              errors={[{ fieldId: 'app-form-name', message: 'Review the field below.' }]}
            />
            <UI.TextInput id="app-form-name" label="Form name" value={text} onChange={setText} />
            <UI.Button type="submit">Example submit</UI.Button>
          </UI.Form>
        </Sample>
      </div>
    )
  if (name === 'App feedback')
    return (
      <div className="native-grid">
        {(['info', 'success', 'warning', 'error'] as const).map((tone) => (
          <Sample key={tone} title={`${tone} notice`}>
            <UI.Notice tone={tone} title={`${tone} example`}>
              Local demonstration only.
            </UI.Notice>
          </Sample>
        ))}
        <Sample title="Loading">
          <UI.LoadingState label="Loading example…" skeleton />
        </Sample>
        <Sample title="Empty state">
          <UI.EmptyState
            title="No items yet"
            action={<UI.Button variant="secondary">Example action</UI.Button>}
          >
            Create an item to get started.
          </UI.EmptyState>
        </Sample>
        <Sample title="Pending action">
          <UI.Button isPending pendingLabel="Saving…">
            Save
          </UI.Button>
        </Sample>
      </div>
    )
  if (name === 'App overlays')
    return (
      <div className="native-row">
        <UI.FormDialog
          triggerLabel="Open app modal"
          title="App modal"
          description="Native HeroUI styling, app-owned behavior."
          actions={<UI.Button>Example action</UI.Button>}
        >
          <UI.TextInput
            id="app-modal-draft"
            label="App modal draft"
            value={text}
            onChange={setText}
          />
        </UI.FormDialog>
        <UI.FormDrawer
          triggerLabel="Open app drawer"
          title="App drawer"
          description="Draft is retained after dismissal."
          actions={<UI.Button>Example action</UI.Button>}
        >
          <UI.TextInput
            id="app-drawer-draft"
            label="App drawer draft"
            value={text}
            onChange={setText}
          />
        </UI.FormDrawer>
      </div>
    )
  if (name === 'Appearance') return <UI.ThemePreferenceSelect />
  if (name === 'Commerce')
    return (
      <div className="native-grid">
        <div className="max-w-xs">
          <ProductCard
            name="Training ball · sample"
            href="#"
            effectivePricePoisha={19000}
            regularPricePoisha={20000}
            availability="available"
          />
        </div>
        <OrderSummary
          kind="estimate"
          method="cod"
          amounts={{
            regularSubtotalPoisha: 20000,
            productDiscountPoisha: 1000,
            couponDiscountPoisha: 0,
            deliveryChargePoisha: 6000,
            finalTotalPoisha: 25000,
          }}
        />
        <div className="native-row">
          <Price amountPoisha={19000} regularPricePoisha={20000} />
          {(['neutral', 'info', 'success', 'warning', 'danger'] as const).map((tone) => (
            <StatusBadge key={tone} tone={tone} label={tone} />
          ))}
          {(['available', 'unavailable', 'unknown'] as const).map((availability) => (
            <AvailabilityBadge key={availability} availability={availability} />
          ))}
        </div>
        <VariantSelector
          value={value}
          onChange={setValue}
          options={[
            { id: 'standard', label: 'Standard', available: true },
            { id: 'unavailable', label: 'Unavailable', available: false },
          ]}
        />
        {removed ? (
          <UI.Button onPress={() => setRemoved(false)}>Restore example</UI.Button>
        ) : (
          <CartLine
            name="Training ball"
            href="#"
            variant="Standard"
            sku="SAMPLE-1"
            quantity={quantity}
            maxQuantity={5}
            availability="available"
            estimatedUnitPoisha={19000}
            estimatedLinePoisha={19000 * quantity}
            onQuantityChange={setQuantity}
            onRemove={() => setRemoved(true)}
          />
        )}
        <div className="max-w-40">
          <ProductImage />
        </div>
        {(['product', 'cart-line', 'summary'] as const).map((kind) => (
          <div key={kind} className="max-w-xs">
            <CommerceSkeleton kind={kind} />
          </div>
        ))}
      </div>
    )
  return (
    <div className="native-grid">
      <Sample title="Filters" wide>
        <FilterToolbar
          query={text}
          onQueryChange={setText}
          onApply={() => setPage(1)}
          onClear={() => setText('')}
        />
      </Sample>
      <Sample title="Results table" wide>
        <DataTable
          label="Sample products"
          rows={[{ id: 'one', name: 'Training ball', status: 'Active' }]}
          columns={[
            { id: 'name', label: 'Product', render: (row) => row.name },
            { id: 'status', label: 'Status', render: (row) => row.status },
          ]}
        />
      </Sample>
      <Sample title="Empty results">
        <DataTable
          label="Empty example"
          rows={[]}
          columns={[{ id: 'name', label: 'Product', render: () => '' }]}
        />
      </Sample>
      <Sample title="Loading results">
        <DataTable
          label="Pending example"
          rows={[]}
          isPending
          columns={[{ id: 'name', label: 'Product', render: () => '' }]}
        />
      </Sample>
      <Sample title="Failed results">
        <DataTable
          label="Error example"
          rows={[]}
          error="Example connection issue."
          onRetry={() => {}}
          columns={[{ id: 'name', label: 'Product', render: () => '' }]}
        />
      </Sample>
      <Sample title="Pagination">
        <ListPagination page={page} totalPages={3} totalItems={60} onPageChange={setPage} />
      </Sample>
      <Sample title="File upload">
        <FileUpload
          label="Preview image"
          file={file}
          onSelect={setFile}
          onRemove={() => setFile(null)}
          acceptedTypes={['image/png', 'image/jpeg', 'image/webp']}
          maxBytes={1048576}
        />
      </Sample>
      <Sample title="Confirmation">
        <GuardedAction
          label="Preview confirmation"
          title="Sample confirmation"
          description="No operation is sent."
          context={<p>Sample record only.</p>}
          eligible
          requiresReason
          reason={text}
          onReasonChange={setText}
          onConfirm={() => {}}
          error="Example rejection. Draft retained."
        />
      </Sample>
    </div>
  )
}
