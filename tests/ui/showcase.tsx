// Local design review only. Neither production app imports this surface.
import { type ReactNode, useState } from 'react'
import { Card } from '@heroui/react'
import { synchronizeThemePreference } from '../../shared/theme'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Route, Routes } from 'react-router'
import { Link as StoreLink } from '../../storefront/src/components/ui/link'
import { Link as AdminLink } from '../../admin/src/components/ui/link'
import {
  Form as StoreForm,
  FormErrorSummary as StoreErrors,
} from '../../storefront/src/components/ui/form'
import {
  Form as AdminForm,
  FormErrorSummary as AdminErrors,
} from '../../admin/src/components/ui/form'
import { CartLine } from '../../storefront/src/components/commerce/cart-line'
import { Button as StoreButton } from '../../storefront/src/components/ui/button'
import { Button as AdminButton } from '../../admin/src/components/ui/button'
import * as storeFields from '../../storefront/src/components/ui/fields'
import * as adminFields from '../../admin/src/components/ui/fields'
import * as storeFeedback from '../../storefront/src/components/ui/feedback'
import * as adminFeedback from '../../admin/src/components/ui/feedback'
import * as storeOverlays from '../../storefront/src/components/ui/overlays'
import * as adminOverlays from '../../admin/src/components/ui/overlays'
import { ThemePreferenceSelect as StoreTheme } from '../../storefront/src/components/ui/theme-preference'
import { ThemePreferenceSelect as AdminTheme } from '../../admin/src/components/ui/theme-preference'
import { ProductCard } from '../../storefront/src/components/commerce/product-card'
import { StatusBadge } from '../../storefront/src/components/commerce/status-badge'
import { VariantSelector } from '../../storefront/src/components/commerce/variant-selector'
import { OrderSummary } from '../../storefront/src/components/commerce/order-summary'
import { CommerceSkeleton } from '../../storefront/src/components/commerce/commerce-skeleton'
import { DataTable } from '../../admin/src/components/management/data-table'
import { FileUpload } from '../../admin/src/components/management/file-upload'
import { FilterToolbar, ListPagination } from '../../admin/src/components/management/list-controls'
import { GuardedAction } from '../../admin/src/components/management/guarded-action'
import { Price } from '../../storefront/src/components/commerce/price'
import { ProductImage } from '../../storefront/src/components/commerce/product-image'
import { AvailabilityBadge } from '../../storefront/src/components/commerce/status-badge'
import { PagePanel } from '../../storefront/src/components/ui/page-panel'
import { LoadingPage, MissingPage } from '../../storefront/src/components/ui/storefront-states'
import { AppearanceMenu } from '../../storefront/src/components/layout/appearance-menu'
import { StorefrontShell } from '../../storefront/src/components/layout/storefront-shell'
import { AdminShell } from '../../admin/src/components/layout/admin-shell'
import { AdminLoading } from '../../admin/src/components/layout/admin-loading'
import { NotFound } from '../../admin/src/components/layout/not-found'
import { SignInUnavailable } from '../../admin/src/features/auth/pages/sign-in-unavailable'
import { PublicLayout } from '../../admin/src/components/layout/public-layout'
import './fixture.css'
import './showcase.css'

const options = [
  { value: 'standard', label: 'Standard' },
  { value: 'express', label: 'Express' },
  { value: 'unavailable', label: 'Unavailable option', disabled: true },
]
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="gallery-section">
      <h2 id={`${id}-title`} className="gallery-section-title">
        {title}
      </h2>
      {children}
    </section>
  )
}
function Showcase() {
  const admin = new URLSearchParams(window.location.search).get('app') === 'admin'
  const appName = admin ? 'Admin' : 'Storefront'
  const Button = admin ? AdminButton : StoreButton
  const Theme = admin ? AdminTheme : StoreTheme
  const Form = admin ? AdminForm : StoreForm
  const FormErrors = admin ? AdminErrors : StoreErrors
  const { TextInput, SelectField, CheckboxField, RadioChoices } = admin ? adminFields : storeFields
  const { Notice, LoadingState, EmptyState } = admin ? adminFeedback : storeFeedback
  const { FormDialog, FormDrawer } = admin ? adminOverlays : storeOverlays
  const [text, setText] = useState('Training ball')
  const [notes, setNotes] = useState('বাংলাদেশ — খেলার সরঞ্জাম')
  const [choice, setChoice] = useState<string | null>('standard')
  const [checked, setChecked] = useState(true)
  const [radio, setRadio] = useState('standard')
  const [draft, setDraft] = useState('Draft is retained when you close and reopen.')
  const [clicks, setClicks] = useState(0)
  const [quantity, setQuantity] = useState(1)
  const [removed, setRemoved] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [variant, setVariant] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [file, setFile] = useState<File | null>(null)
  const [reason, setReason] = useState('')
  const sections = [
    'buttons',
    'fields',
    'cards',
    'forms',
    'feedback',
    'overlays',
    admin ? 'management' : 'commerce',
    'states',
    'inventory',
  ]
  const inventory = [
    'Button',
    'Link',
    'TextInput',
    'SelectField',
    'CheckboxField',
    'RadioChoices',
    'Form',
    'FormErrorSummary',
    'Notice',
    'LoadingState',
    'EmptyState',
    'FormDialog',
    'FormDrawer',
    'ThemePreferenceSelect',
    ...(admin
      ? [
          'DataTable',
          'FilterToolbar',
          'ListPagination',
          'FileUpload',
          'GuardedAction',
          'AdminShell',
          'PublicLayout',
          'NotFound',
          'AdminLoading',
        ]
      : [
          'PagePanel',
          'MissingPage',
          'LoadingPage',
          'ProductCard',
          'ProductImage',
          'Price',
          'StatusBadge',
          'AvailabilityBadge',
          'VariantSelector',
          'CartLine',
          'OrderSummary',
          'CommerceSkeleton',
          'StorefrontShell',
          'StorefrontHeader',
          'AppearanceMenu',
          'NetworkStatus',
        ]),
  ]
  const preview = new URLSearchParams(window.location.search).get('component')
  if (preview) {
    const content = (
      <p className="text-text-muted">
        A clean surface for focused content, with consistent spacing and typography.
      </p>
    )
    const panel = (
      <PagePanel id="panel-preview" title="Made for your next game">
        {content}
      </PagePanel>
    )
    if (preview === 'store-shell') return <StorefrontShell>{panel}</StorefrontShell>
    if (preview === 'admin-shell')
      return (
        <AdminShell title="Overview" actions={<Button>New product</Button>}>
          {content}
        </AdminShell>
      )
    if (preview === 'public-layout')
      return (
        <Routes>
          <Route element={<PublicLayout />}>
            <Route path="*" element={<SignInUnavailable />} />
          </Route>
        </Routes>
      )
    if (preview === 'admin-loading') return <AdminLoading />
    if (preview === 'admin-missing')
      return (
        <main className="p-8">
          <NotFound />
        </main>
      )
    return (
      <main className="mx-auto max-w-3xl space-y-6 p-6">
        <StoreTheme />
        {preview === 'page-panel' ? (
          panel
        ) : preview === 'loading' ? (
          <LoadingPage />
        ) : (
          <MissingPage />
        )}
      </main>
    )
  }
  return (
    <div className="ui-gallery">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to components
      </a>
      <header className="gallery-topbar">
        <a href="/app-showcase.html" className="gallery-brand">
          <span className="gallery-mark" aria-hidden="true">
            S
          </span>
          SportZone<span className="gallery-brand-divider">/</span>
          <span className="text-text-muted">Design system</span>
        </a>
        <span className="gallery-local-badge">Local preview</span>
      </header>
      <div className="gallery-body">
        <aside className="gallery-sidebar">
          <p className="gallery-eyebrow">WORKSPACE</p>
          <nav aria-label="Choose frontend" className="gallery-workspaces">
            <Button
              variant={admin ? 'ghost' : 'primary'}
              onPress={() => {
                window.location.href = '/app-showcase.html?app=storefront'
              }}
            >
              Storefront components
            </Button>
            <Button
              variant={admin ? 'primary' : 'ghost'}
              onPress={() => {
                window.location.href = '/app-showcase.html?app=admin'
              }}
            >
              Admin components
            </Button>
          </nav>
          <p className="gallery-eyebrow">COMPONENTS</p>
          <nav aria-label="Component sections" className="gallery-section-nav">
            {sections.map((id, index) => (
              <a key={id} href={`#${id}`}>
                <span className="numeric">{String(index + 1).padStart(2, '0')}</span>
                {id[0].toUpperCase() + id.slice(1)}
              </a>
            ))}
          </nav>
          <div className="gallery-theme">
            <Theme />
          </div>
          <p className="gallery-sidebar-note">
            HeroUI v3
            <br />
            Real components. Shared foundations.
            <br />
            Light, dark & system.
          </p>
        </aside>
        <main id="main-content" tabIndex={-1} className="gallery-main">
          <div className="gallery-hero">
            <p className="gallery-eyebrow">THE COMPONENT LIBRARY</p>
            <h1>{appName} UI showcase</h1>
            <p>
              Original HeroUI styling, with SportZone colors and fonts. Explore every app-owned
              component, compare states, and try the interactions.
            </p>
            <div className="gallery-meta">
              <span>{inventory.length} components</span>
              <span>Interactive previews</span>
              <span>Light & dark</span>
            </div>
          </div>
          <Section id="buttons" title="Buttons and links">
            <div className="flex flex-wrap items-center gap-3">
              {(['primary', 'outline', 'ghost', 'danger'] as const).map((variant) => (
                <Button key={variant} variant={variant} onPress={() => setClicks((n) => n + 1)}>
                  {variant[0].toUpperCase() + variant.slice(1)}
                </Button>
              ))}
              <Button isDisabled>Disabled</Button>
              <Button isPending pendingLabel="Saving…">
                Pending
              </Button>
            </div>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <p role="status" className="mt-4 text-sm text-text-muted">
              Local button clicks: {clicks}
            </p>
            <div className="mt-4">
              {admin ? (
                <AdminLink to="#fields">Example admin link</AdminLink>
              ) : (
                <StoreLink href="#fields">Example storefront link</StoreLink>
              )}
            </div>
          </Section>
          <Section id="fields" title="Inputs and selection">
            <div className="grid gap-6 md:grid-cols-2">
              <TextInput
                id="sample-name"
                label="Product name"
                description="Editable default state"
                value={text}
                onChange={setText}
              />
              <TextInput
                id="sample-required"
                label="Required input"
                isRequired
                description="Required-field appearance"
              />
              <TextInput
                id="sample-invalid"
                label="Invalid input"
                value=""
                onChange={() => {}}
                error="Enter a product name."
              />
              <TextInput
                id="sample-disabled"
                label="Disabled input"
                value="Unavailable"
                isDisabled
              />
              <TextInput
                id="sample-notes"
                label="Notes / textarea"
                multiline
                value={notes}
                onChange={setNotes}
              />
              <div className="space-y-5">
                <SelectField
                  id="sample-select"
                  label="Select option"
                  options={options}
                  value={choice}
                  onChange={setChoice}
                />
                <SelectField
                  id="sample-select-disabled"
                  label="Disabled select"
                  options={options}
                  value="standard"
                  onChange={() => {}}
                  isDisabled
                />
              </div>
              <div className="space-y-3">
                <CheckboxField
                  label="Selected checkbox"
                  isSelected={checked}
                  onChange={setChecked}
                />
                <CheckboxField label="Disabled checkbox" isDisabled />
                <CheckboxField label="Indeterminate checkbox" isIndeterminate />
                <CheckboxField label="Invalid checkbox" error="This confirmation is required." />
              </div>
              <RadioChoices
                label="Radio options"
                options={options}
                value={radio}
                onChange={setRadio}
              />
            </div>
          </Section>
          <Section id="cards" title="HeroUI cards">
            <div className="grid gap-6 md:grid-cols-3">
              {(['default', 'secondary', 'transparent'] as const).map((variant) => (
                <Card key={variant} variant={variant}>
                  <Card.Header>
                    <Card.Title>{variant[0].toUpperCase() + variant.slice(1)} card</Card.Title>
                    <Card.Description>Original HeroUI component styling.</Card.Description>
                  </Card.Header>
                  <Card.Content>
                    <p className="text-sm text-text-muted">
                      A simple surface for related content, with the library’s own spacing and
                      radius.
                    </p>
                  </Card.Content>
                  <Card.Footer>
                    <Button variant="outline">Example action</Button>
                  </Card.Footer>
                </Card>
              ))}
            </div>
          </Section>
          <section id="forms" aria-label="Form submission example" className="gallery-section">
            <h2 className="mb-5 text-2xl font-semibold">Form and error summary</h2>
            <Form aria-label="Local sample form" onSubmit={() => setSubmitted(true)}>
              <FormErrors
                errors={[
                  { fieldId: 'sample-form-name', message: 'Example rejection: review this field.' },
                ]}
              />
              <TextInput
                id="sample-form-name"
                label="Sample form name"
                value={text}
                onChange={setText}
              />
              <Button type="submit">Preview form rejection</Button>
              {submitted && (
                <p role="status" className="text-sm text-text-muted">
                  Example rejection shown. Your draft is preserved.
                </p>
              )}
            </Form>
          </section>
          <Section id="feedback" title="Alerts, empty and loading states">
            <div className="grid gap-5 md:grid-cols-2">
              {(['info', 'success', 'warning', 'error'] as const).map((tone) => (
                <Notice
                  key={tone}
                  tone={tone}
                  title={`${tone[0].toUpperCase() + tone.slice(1)} example`}
                >
                  Sample message for reviewing appearance and contrast.
                </Notice>
              ))}
              <EmptyState
                title="No items yet"
                action={<Button variant="outline">Example action</Button>}
              >
                An empty-state description appears here.
              </EmptyState>
              <LoadingState label="Loading example…" skeleton />
            </div>
          </Section>
          <Section id="overlays" title="Modal and drawer">
            <p className="mb-5 text-text-muted">
              Open, edit and dismiss with Cancel or Escape. The draft stays in this showcase until
              you reload or change frontend.
            </p>
            <div className="flex flex-wrap gap-3">
              <FormDialog
                triggerLabel="Open modal"
                title="Sample modal"
                description="Edit your details. Your draft stays here until you leave the preview."
                actions={<Button onPress={() => setClicks((n) => n + 1)}>Save example</Button>}
              >
                <TextInput id="modal-draft" label="Modal draft" value={draft} onChange={setDraft} />
              </FormDialog>
              <FormDrawer
                triggerLabel="Open drawer"
                title="Sample drawer"
                description="A spacious panel for focused editing."
                actions={<Button onPress={() => setClicks((n) => n + 1)}>Save example</Button>}
              >
                <TextInput
                  id="drawer-draft"
                  label="Drawer draft"
                  value={draft}
                  onChange={setDraft}
                />
              </FormDrawer>
            </div>
          </Section>
          {admin ? (
            <Section id="management" title="Management components">
              <div className="space-y-6">
                <FilterToolbar
                  query={query}
                  onQueryChange={setQuery}
                  onApply={() => setPage(1)}
                  onClear={() => setQuery('')}
                />
                <p className="text-sm text-text-muted">
                  Filter controls are a preview; sample rows are unchanged.
                </p>
                <DataTable
                  label="Example products"
                  rows={[
                    { id: 'demo', name: 'Training ball', status: 'Active' },
                    { id: 'demo-2', name: 'Match jersey', status: 'Draft' },
                    { id: 'demo-3', name: 'Training cone set', status: 'Active' },
                  ]}
                  columns={[
                    { id: 'name', label: 'Product', render: (row) => row.name },
                    { id: 'status', label: 'Status', render: (row) => row.status },
                  ]}
                />
                <DataTable
                  label="Empty table"
                  rows={[]}
                  columns={[{ id: 'name', label: 'Product', render: () => '' }]}
                />
                <DataTable
                  label="Loading table"
                  rows={[]}
                  isPending
                  columns={[{ id: 'name', label: 'Product', render: () => '' }]}
                />
                <DataTable
                  label="Error table"
                  rows={[]}
                  error="Example connection issue. No request was sent."
                  onRetry={() => setClicks((n) => n + 1)}
                  columns={[{ id: 'name', label: 'Product', render: () => '' }]}
                />
                <ListPagination page={page} totalPages={3} totalItems={60} onPageChange={setPage} />
                <FileUpload
                  label="Preview image"
                  file={file}
                  onSelect={setFile}
                  onRemove={() => setFile(null)}
                  acceptedTypes={['image/png', 'image/jpeg', 'image/webp']}
                  maxBytes={1048576}
                />
                <FileUpload
                  label="Disabled upload"
                  file={null}
                  onSelect={() => {}}
                  onRemove={() => {}}
                  isDisabled
                  acceptedTypes={['image/png']}
                  maxBytes={1048576}
                />
                <GuardedAction
                  label="Ineligible action"
                  title="Unavailable action"
                  description="Example eligibility restriction."
                  context={<p>Not eligible for this example.</p>}
                  eligible={false}
                  unavailableReason="This sample is not eligible."
                  reason={reason}
                  onReasonChange={setReason}
                  onConfirm={() => {}}
                />
                <GuardedAction
                  label="Preview guarded action"
                  title="Sample confirmation"
                  description="No operation is sent."
                  context={<p>Sample record only.</p>}
                  eligible
                  requiresReason
                  reason={reason}
                  onReasonChange={setReason}
                  onConfirm={() => {}}
                  error="Example rejection. Your reason is retained."
                />
              </div>
            </Section>
          ) : (
            <Section id="commerce" title="Commerce components">
              <div className="mb-6 flex flex-wrap gap-3">
                {(['neutral', 'info', 'success', 'warning', 'danger'] as const).map((tone) => (
                  <StatusBadge key={tone} label={tone} tone={tone} />
                ))}
                {(['available', 'unavailable', 'unknown'] as const).map((availability) => (
                  <AvailabilityBadge key={availability} availability={availability} />
                ))}
              </div>
              <div className="grid items-start gap-6 md:grid-cols-2">
                <ProductCard
                  name="Training ball · example"
                  href="#commerce"
                  effectivePricePoisha={19000}
                  regularPricePoisha={20000}
                  availability="available"
                  action={<Button onPress={() => setClicks((n) => n + 1)}>Example action</Button>}
                />
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
                <VariantSelector
                  options={[
                    { id: 'standard', label: 'Standard', available: true },
                    { id: 'large', label: 'Large', available: true },
                    { id: 'soldout', label: 'Unavailable', available: false },
                  ]}
                  value={variant}
                  onChange={setVariant}
                />
                {removed ? (
                  <Button variant="outline" onPress={() => setRemoved(false)}>
                    Restore cart example
                  </Button>
                ) : (
                  <CartLine
                    name="Training ball"
                    href="#commerce"
                    variant="Standard"
                    sku="EXAMPLE-1"
                    quantity={quantity}
                    maxQuantity={5}
                    availability="available"
                    estimatedUnitPoisha={19000}
                    estimatedLinePoisha={19000 * quantity}
                    onQuantityChange={setQuantity}
                    onRemove={() => setRemoved(true)}
                  />
                )}
                <div className="space-y-4">
                  <p className="gallery-example-label">Price · regular & discounted</p>
                  <Price amountPoisha={250000} />
                  <br />
                  <Price amountPoisha={190000} regularPricePoisha={250000} />
                </div>
                <div className="max-w-xs space-y-4">
                  <p className="gallery-example-label">Product image · unavailable state</p>
                  <ProductImage />
                </div>
                <div className="max-w-xs">
                  <p className="gallery-example-label">Product skeleton</p>
                  <CommerceSkeleton kind="product" />
                </div>
                <div className="space-y-4">
                  <p className="gallery-example-label">Cart & summary skeletons</p>
                  <CommerceSkeleton kind="cart-line" />
                  <CommerceSkeleton kind="summary" />
                </div>
              </div>
            </Section>
          )}
          <Section id="states" title="Layouts and page states">
            <p className="mb-6 text-text-muted">
              Each preview opens an isolated canvas so its landmarks and navigation remain accurate.
            </p>
            <div className="gallery-preview-links">
              {(admin
                ? [
                    ['admin-shell', 'Admin shell & navigation'],
                    ['public-layout', 'Sign-in layout'],
                    ['admin-loading', 'Administration loading'],
                    ['admin-missing', 'Not found'],
                  ]
                : [
                    ['store-shell', 'Storefront shell, header & appearance'],
                    ['page-panel', 'Page panel / card'],
                    ['loading', 'Loading page'],
                    ['missing', 'Missing page'],
                  ]
              ).map(([id, label]) => (
                <a
                  key={id}
                  target="_blank"
                  rel="noreferrer"
                  href={`/app-showcase.html?app=${admin ? 'admin' : 'storefront'}&component=${id}`}
                >
                  {label}
                  <span aria-hidden="true">↗</span>
                </a>
              ))}
            </div>
            {!admin && (
              <div className="mt-6 max-w-xs">
                <AppearanceMenu />
              </div>
            )}
          </Section>
          <Section id="inventory" title="Complete component inventory">
            <p className="mb-6 text-text-muted">
              All current app-owned UI and composition exports are represented above or in an
              isolated layout preview. HeroUI internals are not a second component library.
            </p>
            <ul className="gallery-inventory">
              {inventory.map((name) => (
                <li key={name}>
                  <span aria-hidden="true">✓</span>
                  {name}
                </li>
              ))}
            </ul>
          </Section>
          <footer className="gallery-footer">
            SportZone component library · Local synthetic examples · No live data or operations
          </footer>
        </main>
      </div>
    </div>
  )
}
synchronizeThemePreference()
const root = document.getElementById('root')
if (!root) throw new Error('Missing showcase root')
createRoot(root).render(
  <BrowserRouter>
    <Showcase />
  </BrowserRouter>,
)
