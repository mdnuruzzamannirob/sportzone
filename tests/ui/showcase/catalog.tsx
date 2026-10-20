// One local preview of the actual app-owned UI modules and selected app theme.
import { type ReactNode, useEffect, useState } from 'react'
import { AppCompositions } from './compositions'
const sizes = ['sm', 'md', 'lg'] as const
const buttonVariants = [
  'primary',
  'secondary',
  'tertiary',
  'outline',
  'ghost',
  'danger',
  'danger-soft',
] as const
const surfaceVariants = ['default', 'secondary', 'tertiary', 'transparent'] as const
const fieldVariants = ['primary', 'secondary'] as const
const statuses = ['default', 'accent', 'success', 'warning', 'danger'] as const
const colors = ['default', 'accent', 'success', 'warning', 'danger'] as const
const spinnerColors = ['accent', 'current', 'success', 'warning', 'danger'] as const
const chipVariants = ['primary', 'secondary', 'tertiary', 'soft'] as const
const components = [
  'Button',
  'Link',
  'Card',
  'Surface',
  'TextField / Input',
  'TextArea',
  'Select',
  'ListBox',
  'Checkbox',
  'RadioGroup / Radio',
  'NumberField',
  'Form',
  'Alert',
  'Chip',
  'Spinner',
  'Skeleton',
  'Modal',
  'Drawer',
  'Disclosure',
  'Table',
  'Pagination',
  'Breadcrumbs',
  'App fields', 'App feedback', 'App overlays', 'Appearance', 'Commerce', 'Management',
] as const
type ComponentName = (typeof components)[number]
export type PreviewUI = Omit<typeof import('../../../admin/src/components/ui/index'), 'Link'>
export function createShowcase(H: PreviewUI, application: 'admin' | 'storefront', parameters: URLSearchParams) {
function Sample({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="native-specimen">
      <span className="native-caption">{label}</span>
      {children}
    </div>
  )
}
function Choice({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: readonly string[]
  value: string
  onChange: (value: string) => void
}) {
  return (
    <H.Select
      aria-label={label}
      value={value}
      onChange={(v) => {
        if (typeof v === 'string') onChange(v)
      }}
    >
      <H.Label>{label}</H.Label>
      <H.Select.Trigger>
        <H.Select.Value />
        <H.Select.Indicator />
      </H.Select.Trigger>
      <H.Select.Popover>
        <H.ListBox>
          {options.map((v) => (
            <H.ListBox.Item id={v} key={v} textValue={v}>
              {v}
              <H.ListBox.ItemIndicator />
            </H.ListBox.Item>
          ))}
        </H.ListBox>
      </H.Select.Popover>
    </H.Select>
  )
}
function FieldExamples({ area = false }: { area?: boolean }) {
  return (
    <div className="native-grid">
      {fieldVariants.flatMap((variant) =>
        ['default', 'required', 'invalid', 'disabled', 'read-only', 'full-width'].map((state) => (
          <Sample key={`${variant}-${state}`} label={`${variant} · ${state}`}>
            <H.TextField
              isRequired={state === 'required'}
              isInvalid={state === 'invalid'}
              isDisabled={state === 'disabled'}
              isReadOnly={state === 'read-only'}
              fullWidth={state === 'full-width'}
              defaultValue={state === 'invalid' ? '' : 'Sample content'}
            >
              <H.Label>{area ? 'Message' : 'Name'}</H.Label>
              {area ? (
                <H.TextArea variant={variant} placeholder="Enter a message" />
              ) : (
                <H.Input variant={variant} placeholder="Enter your name" />
              )}
              <H.Description>Original HeroUI {area ? 'TextArea' : 'Input'}.</H.Description>
              <H.FieldError>Enter a valid value.</H.FieldError>
            </H.TextField>
          </Sample>
        )),
      )}
    </div>
  )
}
function SelectExamples() {
  return (
    <div className="native-grid">
      {fieldVariants.flatMap((variant) =>
        ['default', 'selected', 'required', 'invalid', 'disabled', 'full-width'].map((state) => (
          <Sample key={`${variant}-${state}`} label={`${variant} · ${state}`}>
            <H.Select
              variant={variant}
              fullWidth={state === 'full-width'}
              defaultValue={state === 'selected' ? 'standard' : undefined}
              isRequired={state === 'required'}
              isInvalid={state === 'invalid'}
              isDisabled={state === 'disabled'}
              disabledKeys={['unavailable']}
            >
              <H.Label>Choose an option</H.Label>
              <H.Select.Trigger>
                <H.Select.Value />
                <H.Select.Indicator />
              </H.Select.Trigger>
              <H.Description>Native selection and keyboard behavior.</H.Description>
              <H.FieldError>Choose an option.</H.FieldError>
              <H.Select.Popover>
                <H.ListBox>
                  {['Standard', 'Express', 'Unavailable'].map((name) => (
                    <H.ListBox.Item id={name.toLowerCase()} key={name} textValue={name}>
                      {name}
                      <H.ListBox.ItemIndicator />
                    </H.ListBox.Item>
                  ))}
                </H.ListBox>
              </H.Select.Popover>
            </H.Select>
          </Sample>
        )),
      )}
    </div>
  )
}
function OverlayExamples({ drawer = false }: { drawer?: boolean }) {
  const [size, setSize] = useState<'xs' | 'sm' | 'md' | 'lg' | 'cover' | 'full'>('md')
  const [backdrop, setBackdrop] = useState<'opaque' | 'blur' | 'transparent'>('opaque')
  const [scroll, setScroll] = useState<'inside' | 'outside'>('inside')
  const [placement, setPlacement] = useState<'left' | 'right' | 'top' | 'bottom'>('right')
  const [modalPlacement, setModalPlacement] = useState<'auto' | 'top' | 'center' | 'bottom'>(
    'center',
  )
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState('Editable native HeroUI field')
  const content = (
    <H.TextField value={draft} onChange={setDraft}>
      <H.Label>Preview draft</H.Label>
      <H.Input />
      <H.Description>Draft survives dismissal and reopening.</H.Description>
    </H.TextField>
  )
  return (
    <>
      <p className="native-note">
        Every supported visual option is selectable below. Open the preview to compare them.
      </p>
      <div className="native-controls">
        <Choice
          label="Backdrop"
          options={['opaque', 'blur', 'transparent']}
          value={backdrop}
          onChange={(v) => {
            if (v === 'opaque' || v === 'blur' || v === 'transparent') setBackdrop(v)
          }}
        />
        {drawer ? (
          <Choice
            label="Placement"
            options={['left', 'right', 'top', 'bottom']}
            value={placement}
            onChange={(v) => {
              if (v === 'left' || v === 'right' || v === 'top' || v === 'bottom') setPlacement(v)
            }}
          />
        ) : (
          <>
            <Choice
              label="Size"
              options={['xs', 'sm', 'md', 'lg', 'cover', 'full']}
              value={size}
              onChange={(v) => {
                if (
                  v === 'xs' ||
                  v === 'sm' ||
                  v === 'md' ||
                  v === 'lg' ||
                  v === 'cover' ||
                  v === 'full'
                )
                  setSize(v)
              }}
            />
            <Choice
              label="Scroll"
              options={['inside', 'outside']}
              value={scroll}
              onChange={(v) => {
                if (v === 'inside' || v === 'outside') setScroll(v)
              }}
            />
            <Choice
              label="Placement"
              options={['auto', 'top', 'center', 'bottom']}
              value={modalPlacement}
              onChange={(v) => {
                if (v === 'auto' || v === 'top' || v === 'center' || v === 'bottom')
                  setModalPlacement(v)
              }}
            />
          </>
        )}
      </div>
      {drawer ? (
        <H.Drawer isOpen={open} onOpenChange={setOpen}>
          <H.Button>Open native drawer</H.Button>
          <H.Drawer.Backdrop variant={backdrop}>
            <H.Drawer.Content placement={placement}>
              <H.Drawer.Dialog>
                <H.Drawer.Header>
                  <H.Drawer.Heading>Native drawer</H.Drawer.Heading>
                  <H.Drawer.CloseTrigger />
                </H.Drawer.Header>
                <H.Drawer.Body>{content}</H.Drawer.Body>
                <H.Drawer.Footer>
                  <H.Button variant="secondary" onPress={() => setOpen(false)}>
                    Close
                  </H.Button>
                </H.Drawer.Footer>
              </H.Drawer.Dialog>
            </H.Drawer.Content>
          </H.Drawer.Backdrop>
        </H.Drawer>
      ) : (
        <H.Modal isOpen={open} onOpenChange={setOpen}>
          <H.Button>Open native modal</H.Button>
          <H.Modal.Backdrop variant={backdrop}>
            <H.Modal.Container size={size} scroll={scroll} placement={modalPlacement}>
              <H.Modal.Dialog>
                <H.Modal.Header>
                  <H.Modal.Heading>Native modal</H.Modal.Heading>
                  <H.Modal.CloseTrigger />
                </H.Modal.Header>
                <H.Modal.Body>{content}</H.Modal.Body>
                <H.Modal.Footer>
                  <H.Button variant="secondary" onPress={() => setOpen(false)}>
                    Close
                  </H.Button>
                </H.Modal.Footer>
              </H.Modal.Dialog>
            </H.Modal.Container>
          </H.Modal.Backdrop>
        </H.Modal>
      )}
    </>
  )
}
function Examples({ name }: { name: ComponentName }) {
  const [page, setPage] = useState(1)
  if (['App fields', 'App feedback', 'App overlays', 'Appearance', 'Commerce', 'Management'].includes(name)) return <AppCompositions UI={H} name={name} />
  if (name === 'Button')
    return (
      <>
        {sizes.map((size) => (
          <div key={size}>
            <h3 className="native-group-title">Size: {size}</h3>
            <div className="native-row">
              {buttonVariants.map((variant) => (
                <H.Button key={variant} size={size} variant={variant}>
                  {variant}
                </H.Button>
              ))}
            </div>
          </div>
        ))}
        <h3 className="native-group-title">States and modifiers</h3>
        <div className="native-row">
          <H.Button isDisabled>Disabled</H.Button>
          <H.Button isPending>
            <H.Spinner size="sm" color="current" />
            Pending
          </H.Button>
          <H.Button isIconOnly aria-label="Add item">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
          </H.Button>
        </div>
        <H.Button fullWidth>Full width</H.Button>
      </>
    )
  if (name === 'Link')
    return (
      <div className="native-row">
        <H.PrimitiveLink href="#native-main">Default link</H.PrimitiveLink>
        <H.PrimitiveLink href="#native-main" isDisabled>
          Disabled link
        </H.PrimitiveLink>
      </div>
    )
  if (name === 'Card')
    return (
      <div className="native-grid">
        {surfaceVariants.map((variant) => (
          <Sample key={variant} label={variant}>
            <H.Card variant={variant}>
              <H.Card.Header>
                <H.Card.Title>Native card</H.Card.Title>
                <H.Card.Description>Original library styling.</H.Card.Description>
              </H.Card.Header>
              <H.Card.Content>Related content belongs here.</H.Card.Content>
              <H.Card.Footer>
                <H.Button variant="secondary">Action</H.Button>
              </H.Card.Footer>
            </H.Card>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Surface')
    return (
      <div className="native-grid">
        {surfaceVariants.map((variant) => (
          <Sample key={variant} label={variant}>
            <H.Surface variant={variant} className="p-6">
              Native surface
            </H.Surface>
          </Sample>
        ))}
      </div>
    )
  if (name === 'TextField / Input')
    return (
      <>
        <FieldExamples />
        <h3 className="native-group-title">File input</h3>
        <H.TextField>
          <H.Label>Choose file</H.Label>
          <H.Input type="file" />
        </H.TextField>
        <h3 className="native-group-title">Full width</h3>
        <H.Input aria-label="Full-width input" placeholder="Full width" fullWidth />
      </>
    )
  if (name === 'TextArea')
    return (
      <>
        <FieldExamples area />
        <h3 className="native-group-title">Full width</h3>
        <H.TextArea aria-label="Full-width textarea" placeholder="Full width" fullWidth />
      </>
    )
  if (name === 'Select') return <SelectExamples />
  if (name === 'ListBox')
    return (
      <div className="native-grid">
        {(['default', 'danger'] as const).flatMap((variant) =>
          (['single', 'multiple'] as const).map((mode) => (
            <Sample key={`${variant}-${mode}`} label={`${variant} · ${mode} selection`}>
              <H.ListBox
                variant={variant}
                aria-label={`${variant} ${mode} options`}
                selectionMode={mode}
                disabledKeys={['disabled']}
              >
                <H.ListBox.Item id="one" textValue="One">
                  One
                  <H.ListBox.ItemIndicator />
                </H.ListBox.Item>
                <H.ListBox.Item id="two" textValue="Two" variant={variant}>
                  Two
                  <H.ListBox.ItemIndicator />
                </H.ListBox.Item>
                <H.ListBox.Item id="disabled" textValue="Disabled">
                  Disabled
                  <H.ListBox.ItemIndicator />
                </H.ListBox.Item>
              </H.ListBox>
            </Sample>
          )),
        )}
      </div>
    )
  if (name === 'Checkbox')
    return (
      <div className="native-grid">
        {fieldVariants.flatMap((variant) =>
          ['unchecked', 'checked', 'indeterminate', 'invalid', 'disabled'].map((state) => (
            <Sample key={`${variant}-${state}`} label={`${variant} · ${state}`}>
              <H.Checkbox
                variant={variant}
                defaultSelected={state === 'checked'}
                isIndeterminate={state === 'indeterminate'}
                isInvalid={state === 'invalid'}
                isDisabled={state === 'disabled'}
              >
                <H.Checkbox.Content>
                  <H.Checkbox.Control>
                    <H.Checkbox.Indicator />
                  </H.Checkbox.Control>
                  <H.Label>Example checkbox</H.Label>
                </H.Checkbox.Content>
                <H.Description>Native checkbox</H.Description>
                <H.FieldError>Confirmation required.</H.FieldError>
              </H.Checkbox>
            </Sample>
          )),
        )}
      </div>
    )
  if (name === 'RadioGroup / Radio')
    return (
      <div className="native-grid">
        {fieldVariants.flatMap((variant) =>
          ['default', 'invalid', 'disabled'].map((state) => (
            <Sample key={`${variant}-${state}`} label={`${variant} · ${state}`}>
              <H.RadioGroup
                variant={variant}
                defaultValue="standard"
                isInvalid={state === 'invalid'}
                isDisabled={state === 'disabled'}
              >
                <H.Label>Delivery option</H.Label>
                {['standard', 'express', 'unavailable'].map((value) => (
                  <H.Radio value={value} key={value} isDisabled={value === 'unavailable'}>
                    <H.Radio.Content>
                      <H.Radio.Control>
                        <H.Radio.Indicator />
                      </H.Radio.Control>
                      <H.Label>{value}</H.Label>
                    </H.Radio.Content>
                  </H.Radio>
                ))}
                <H.Description>Native group and individual radios.</H.Description>
                <H.FieldError>Choose an option.</H.FieldError>
              </H.RadioGroup>
            </Sample>
          )),
        )}
      </div>
    )
  if (name === 'NumberField')
    return (
      <div className="native-grid">
        {fieldVariants.flatMap((variant) =>
          ['default', 'invalid', 'disabled', 'full-width'].map((state) => (
            <Sample key={`${variant}-${state}`} label={`${variant} · ${state}`}>
              <H.NumberField
                variant={variant}
                defaultValue={2}
                minValue={0}
                maxValue={10}
                isDisabled={state === 'disabled'}
                isInvalid={state === 'invalid'}
                fullWidth={state === 'full-width'}
              >
                <H.Label>Quantity</H.Label>
                <H.NumberField.Group>
                  <H.NumberField.DecrementButton />
                  <H.NumberField.Input />
                  <H.NumberField.IncrementButton />
                </H.NumberField.Group>
                <H.Description>Range 0–10.</H.Description>
                <H.FieldError>Invalid quantity.</H.FieldError>
              </H.NumberField>
            </Sample>
          )),
        )}
      </div>
    )
  if (name === 'Form')
    return (
      <H.Form className="flex max-w-sm flex-col gap-4" onSubmit={(e) => e.preventDefault()}>
        <H.TextField name="name" isRequired>
          <H.Label>Name</H.Label>
          <H.Input />
          <H.Description>Label and description are native components.</H.Description>
          <H.FieldError />
        </H.TextField>
        <H.TextField isInvalid>
          <H.Label>Invalid field</H.Label>
          <H.Input />
          <H.FieldError>Example field error.</H.FieldError>
        </H.TextField>
        <H.Button type="submit">Validate form</H.Button>
      </H.Form>
    )
  if (name === 'Alert')
    return (
      <div className="native-grid">
        {statuses.map((status) => (
          <Sample key={status} label={status}>
            <H.Alert status={status}>
              <H.Alert.Indicator />
              <H.Alert.Content>
                <H.Alert.Title>{status} alert</H.Alert.Title>
                <H.Alert.Description>Original HeroUI status, icon and colors.</H.Alert.Description>
              </H.Alert.Content>
            </H.Alert>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Chip')
    return (
      <>
        {chipVariants.map((variant) => (
          <div key={variant}>
            <h3 className="native-group-title">{variant}</h3>
            {sizes.map((size) => (
              <div className="native-row" key={size}>
                {colors.map((color) => (
                  <H.Chip key={color} variant={variant} color={color} size={size}>
                    <H.Chip.Label>
                      {color} · {size}
                    </H.Chip.Label>
                  </H.Chip>
                ))}
              </div>
            ))}
          </div>
        ))}
      </>
    )
  if (name === 'Spinner')
    return (
      <div className="native-grid">
        {(['sm', 'md', 'lg', 'xl'] as const).map((size) => (
          <Sample key={size} label={size}>
            <div className="native-row">
              {spinnerColors.map((color) => (
                <Sample key={color} label={color}>
                  <H.Spinner size={size} color={color} />
                </Sample>
              ))}
            </div>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Skeleton')
    return (
      <div className="native-grid">
        {(['pulse', 'shimmer', 'none'] as const).map((animationType) => (
          <Sample key={animationType} label={animationType}>
            <div className="flex flex-col gap-3">
              <H.Skeleton animationType={animationType} className="h-28 w-full" />
              <H.Skeleton animationType={animationType} className="h-4 w-3/4" />
              <H.Skeleton animationType={animationType} className="size-12 rounded-full" />
            </div>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Modal') return <OverlayExamples />
  if (name === 'Drawer') return <OverlayExamples drawer />
  if (name === 'Disclosure')
    return (
      <div className="native-grid">
        {['closed', 'open', 'disabled'].map((state) => (
          <Sample key={state} label={state}>
            <H.Disclosure defaultExpanded={state === 'open'} isDisabled={state === 'disabled'}>
              <H.Disclosure.Heading>
                <H.Disclosure.Trigger>
                  <span>Native disclosure with a long title that truncates when space is limited</span>
                  <H.Disclosure.Indicator />
                </H.Disclosure.Trigger>
              </H.Disclosure.Heading>
              <H.Disclosure.Content>
                <H.Disclosure.Body>
                  Content expands with native motion and behavior.
                </H.Disclosure.Body>
              </H.Disclosure.Content>
            </H.Disclosure>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Table')
    return (
      <div className="flex flex-col gap-8">
        {fieldVariants.map((variant) => (
          <Sample key={variant} label={variant}>
            <H.Table variant={variant}>
              <H.Table.ScrollContainer>
                <H.Table.Content aria-label={`${variant} products`}>
                  <H.Table.Header>
                    <H.Table.Column isRowHeader>Product</H.Table.Column>
                    <H.Table.Column>Status</H.Table.Column>
                  </H.Table.Header>
                  <H.Table.Body>
                    <H.Table.Row id="one">
                      <H.Table.Cell>Training ball</H.Table.Cell>
                      <H.Table.Cell>Available</H.Table.Cell>
                    </H.Table.Row>
                    <H.Table.Row id="two">
                      <H.Table.Cell>Match jersey</H.Table.Cell>
                      <H.Table.Cell>Draft</H.Table.Cell>
                    </H.Table.Row>
                  </H.Table.Body>
                </H.Table.Content>
              </H.Table.ScrollContainer>
            </H.Table>
          </Sample>
        ))}
      </div>
    )
  if (name === 'Pagination')
    return (
      <>
        {sizes.map((size) => (
          <Sample key={size} label={size}>
            <H.Pagination size={size} aria-label={`${size} pagination`}>
              <H.Pagination.Summary>Page {page} of 5</H.Pagination.Summary>
              <H.Pagination.Content>
                <H.Pagination.Item>
                  <H.Pagination.Previous
                    isDisabled={page === 1}
                    onPress={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </H.Pagination.Previous>
                </H.Pagination.Item>
                {[1, 2, 3].map((n) => (
                  <H.Pagination.Item key={n}>
                    <H.Pagination.Link isActive={page === n} onPress={() => setPage(n)}>
                      {n}
                    </H.Pagination.Link>
                  </H.Pagination.Item>
                ))}
                <H.Pagination.Item>
                  <H.Pagination.Ellipsis />
                </H.Pagination.Item>
                <H.Pagination.Item>
                  <H.Pagination.Next
                    isDisabled={page === 5}
                    onPress={() => setPage((p) => Math.min(5, p + 1))}
                  >
                    Next
                  </H.Pagination.Next>
                </H.Pagination.Item>
              </H.Pagination.Content>
            </H.Pagination>
          </Sample>
        ))}
      </>
    )
  return (
    <div className="flex flex-col gap-6">
      <H.Breadcrumbs>
        <H.Breadcrumbs.Item href="#">Home</H.Breadcrumbs.Item>
        <H.Breadcrumbs.Item href="#">Products</H.Breadcrumbs.Item>
        <H.Breadcrumbs.Item>Current page</H.Breadcrumbs.Item>
      </H.Breadcrumbs>
      <H.Breadcrumbs separator="/">
        <H.Breadcrumbs.Item href="#">Home</H.Breadcrumbs.Item>
        <H.Breadcrumbs.Item>Custom separator</H.Breadcrumbs.Item>
      </H.Breadcrumbs>
    </div>
  )
}
function NativeShowcase() {
  const [active, setActive] = useState<ComponentName>(() => components.find(name => name === parameters.get('component')) ?? 'Button')
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark')
  useEffect(() => H.subscribeThemePreference(() => setDark(document.documentElement.dataset.theme === 'dark')), [])
  return (
    <div className="native-shell">
      <header className="native-header">
        <div>
          <h1>SportZone UI · {application === 'admin' ? 'Admin' : 'Storefront'}</h1>
          <p>HeroUI v3.2.6 default system · Actual app-owned UI components</p>
        </div>
        <nav aria-label="Preview application" className="native-row">
          {(['storefront', 'admin'] as const).map(app => <H.Button key={app} variant={application === app ? 'primary' : 'secondary'} aria-pressed={application === app} onPress={() => { window.location.href = `/showcase.html?app=${app}&component=${encodeURIComponent(active)}` }}>{app === 'admin' ? 'Admin' : 'Storefront'}</H.Button>)}
        </nav>
        <H.Button variant="secondary" onPress={() => H.setThemePreference(dark ? 'light' : 'dark')}>
          {dark ? 'Light theme' : 'Dark theme'}
        </H.Button>
      </header>
      <div className="native-layout">
        <nav className="native-nav" aria-label="HeroUI components">
          {components.filter(name => name !== (application === 'admin' ? 'Commerce' : 'Management')).map((name) => (
            <H.Button
              key={name}
              variant={active === name ? 'primary' : 'ghost'}
              onPress={() => { setActive(name); const url = new URL(window.location.href); url.searchParams.set('component', name); window.history.replaceState(null, '', url) }}
              aria-current={active === name ? 'page' : undefined}
            >
              {name}
            </H.Button>
          ))}
        </nav>
        <main id="native-main" className="native-content">
          <h2>{active}</h2>
          <p className="native-note">
            Actual app-owned UI facade with default HeroUI styling. Variants, sizes and common interaction states are shown
            below; overlays have controls for every supported visual option.
          </p>
          <Examples name={active} key={active} />
        </main>
      </div>
    </div>
  )
}
return NativeShowcase
}
