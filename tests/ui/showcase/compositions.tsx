import { useState } from 'react'
import type { PreviewUI } from './catalog'
import { CartLine } from '../../../storefront/src/components/commerce/cart-line'
import { ProductCard } from '../../../storefront/src/components/commerce/product-card'
import { ProductImage } from '../../../storefront/src/components/commerce/product-image'
import { Price } from '../../../storefront/src/components/commerce/price'
import { OrderSummary } from '../../../storefront/src/components/commerce/order-summary'
import { StatusBadge, AvailabilityBadge } from '../../../storefront/src/components/commerce/status-badge'
import { VariantSelector } from '../../../storefront/src/components/commerce/variant-selector'
import { CommerceSkeleton } from '../../../storefront/src/components/commerce/commerce-skeleton'
import { DataTable } from '../../../admin/src/components/management/data-table'
import { FileUpload } from '../../../admin/src/components/management/file-upload'
import { GuardedAction } from '../../../admin/src/components/management/guarded-action'
import { FilterToolbar, ListPagination } from '../../../admin/src/components/management/list-controls'

export function AppCompositions({ UI, name }: { UI: PreviewUI; name: string }) {
  const [text, setText] = useState('Training ball')
  const [value, setValue] = useState<string | null>('standard')
  const [quantity, setQuantity] = useState(1)
  const [page, setPage] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [removed, setRemoved] = useState(false)
  const options = [{ value: 'standard', label: 'Standard' }, { value: 'unavailable', label: 'Unavailable', disabled: true }]
  if (name === 'App fields') return <div className="native-grid">
    <UI.TextInput id="app-text" label="Product name" value={text} onChange={setText} description="App-owned field composition." />
    <UI.TextInput id="app-area" label="Notes" multiline value={text} onChange={setText} />
    <UI.TextInput id="app-error" label="Invalid field" error="Example rejection. Your draft is retained." value={text} onChange={setText} />
    <UI.SelectField id="app-select" label="Select option" value={value} onChange={setValue} options={options} />
    <UI.CheckboxField label="Confirm selection" />
    <UI.RadioChoices label="Delivery option" options={options} />
    <UI.Form aria-label="Example app form" onSubmit={() => {}}><UI.FormErrorSummary errors={[{ fieldId: 'app-form-name', message: 'Review the field below.' }]} /><UI.TextInput id="app-form-name" label="Form name" value={text} onChange={setText} /><UI.Button type="submit">Example submit</UI.Button></UI.Form>
  </div>
  if (name === 'App feedback') return <div className="native-grid">
    {(['info','success','warning','error'] as const).map(tone => <UI.Notice tone={tone} title={`${tone} example`} key={tone}>Local demonstration only.</UI.Notice>)}
    <UI.LoadingState label="Loading example…" skeleton />
    <UI.EmptyState title="No items yet" action={<UI.Button variant="secondary">Example action</UI.Button>}>Create an item to get started.</UI.EmptyState>
    <UI.Button isPending pendingLabel="Saving…">Save</UI.Button>
  </div>
  if (name === 'App overlays') return <div className="native-row">
    <UI.FormDialog triggerLabel="Open app modal" title="App modal" description="Native HeroUI styling, app-owned behavior." actions={<UI.Button>Example action</UI.Button>}><UI.TextInput id="app-modal-draft" label="App modal draft" value={text} onChange={setText} /></UI.FormDialog>
    <UI.FormDrawer triggerLabel="Open app drawer" title="App drawer" description="Draft is retained after dismissal." actions={<UI.Button>Example action</UI.Button>}><UI.TextInput id="app-drawer-draft" label="App drawer draft" value={text} onChange={setText} /></UI.FormDrawer>
  </div>
  if (name === 'Appearance') return <UI.ThemePreferenceSelect />
  if (name === 'Commerce') return <div className="native-grid">
    <div className="max-w-xs"><ProductCard name="Training ball · sample" href="#" effectivePricePoisha={19000} regularPricePoisha={20000} availability="available" /></div>
    <OrderSummary kind="estimate" method="cod" amounts={{ regularSubtotalPoisha: 20000, productDiscountPoisha: 1000, couponDiscountPoisha: 0, deliveryChargePoisha: 6000, finalTotalPoisha: 25000 }} />
    <div className="native-row"><Price amountPoisha={19000} regularPricePoisha={20000} />{(['neutral','info','success','warning','danger'] as const).map(tone => <StatusBadge key={tone} tone={tone} label={tone} />)}{(['available','unavailable','unknown'] as const).map(availability => <AvailabilityBadge key={availability} availability={availability} />)}</div>
    <VariantSelector value={value} onChange={setValue} options={[{ id: 'standard', label: 'Standard', available: true }, { id: 'unavailable', label: 'Unavailable', available: false }]} />
    {removed ? <UI.Button onPress={() => setRemoved(false)}>Restore example</UI.Button> : <CartLine name="Training ball" href="#" variant="Standard" sku="SAMPLE-1" quantity={quantity} maxQuantity={5} availability="available" estimatedUnitPoisha={19000} estimatedLinePoisha={19000 * quantity} onQuantityChange={setQuantity} onRemove={() => setRemoved(true)} />}
    <div className="max-w-40"><ProductImage /></div>
    {(['product','cart-line','summary'] as const).map(kind => <div key={kind} className="max-w-xs"><CommerceSkeleton kind={kind} /></div>)}
  </div>
  return <div className="flex flex-col gap-6">
    <FilterToolbar query={text} onQueryChange={setText} onApply={() => setPage(1)} onClear={() => setText('')} />
    <DataTable label="Sample products" rows={[{id:'one', name:'Training ball', status:'Active'}]} columns={[{id:'name',label:'Product',render:row=>row.name},{id:'status',label:'Status',render:row=>row.status}]} />
    <DataTable label="Empty example" rows={[]} columns={[{id:'name',label:'Product',render:()=>''}]} />
    <DataTable label="Pending example" rows={[]} isPending columns={[{id:'name',label:'Product',render:()=>''}]} />
    <DataTable label="Error example" rows={[]} error="Example connection issue." onRetry={()=>{}} columns={[{id:'name',label:'Product',render:()=>''}]} />
    <ListPagination page={page} totalPages={3} totalItems={60} onPageChange={setPage} />
    <FileUpload label="Preview image" file={file} onSelect={setFile} onRemove={()=>setFile(null)} acceptedTypes={['image/png','image/jpeg','image/webp']} maxBytes={1048576} />
    <GuardedAction label="Preview confirmation" title="Sample confirmation" description="No operation is sent." context={<p>Sample record only.</p>} eligible requiresReason reason={text} onReasonChange={setText} onConfirm={()=>{}} error="Example rejection. Draft retained." />
  </div>
}
