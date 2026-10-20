import { act, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataTable } from '../src/components/management/data-table'
import {
  FilterToolbar,
  ListPagination,
} from '../src/components/management/list-controls'
import { FileUpload } from '../src/components/management/file-upload'
import { GuardedAction } from '../src/components/management/guarded-action'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement
let root: Root
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  vi.stubGlobal('matchMedia', () =>
    Object.assign(new EventTarget(), { matches: false }),
  )
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:preview'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
})
async function render(node: ReactNode) {
  await act(() => root.render(node))
}
async function click(text: string) {
  const button = Array.from(document.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  )
  expect(button, text).toBeTruthy()
  await act(() => button?.click())
}
const columns = [
  {
    id: 'name',
    label: 'Name',
    sortable: true,
    render: (row: { id: string; name: string }) => row.name,
  },
]
const rows = [
  { id: '2', name: 'Zebra' },
  { id: '1', name: 'Alpha' },
]
describe('management primitives', () => {
  const theme = 'light'
  beforeEach(() => {
    document.documentElement.dataset.theme = theme
  })
  it('keeps server row order, labelled headers and a focusable local overflow region', async () => {
    const sort = vi.fn()
    await render(
      <DataTable
        label="Products"
        rows={rows}
        columns={columns}
        sort={{ column: 'name', direction: 'descending' }}
        onSortChange={sort}
      />,
    )
    expect(host.textContent?.indexOf('Zebra')).toBeLessThan(
      host.textContent?.indexOf('Alpha') ?? 0,
    )
    const region = host.querySelector('[role="region"]')
    expect(region?.getAttribute('tabindex')).toBe('0')
    expect(region?.className).toContain('overflow-x-auto')
    expect(
      host.querySelector('[role="columnheader"],th')?.getAttribute('aria-sort'),
    ).toBe('descending')
    await act(() =>
      host.querySelector<HTMLElement>('[role="columnheader"],th')?.click(),
    )
    expect(sort).toHaveBeenCalledWith({ column: 'name', direction: 'ascending' })
  })
  it('supports keyboard sorting and arrow navigation through table cells', async () => {
    const sort = vi.fn()
    await render(
      <DataTable
        label="Products"
        rows={rows}
        columns={columns}
        sort={{ column: 'name', direction: 'ascending' }}
        onSortChange={sort}
      />,
    )
    const header = host.querySelector<HTMLElement>('[role="columnheader"],th')
    if (!header) throw new Error('Missing sortable header')
    await act(() => {
      header.focus()
      header.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      header.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }))
    })
    expect(sort).toHaveBeenCalledWith({ column: 'name', direction: 'descending' })
    await act(() =>
      header.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }),
      ),
    )
    expect(document.activeElement?.textContent).toBe('Zebra')
  })
  it('shows empty, pending, retained rows, error and retry distinctly', async () => {
    await render(<DataTable label="Products" rows={[]} columns={columns} />)
    expect(host.textContent).toContain('No results')
    const retry = vi.fn()
    await render(
      <DataTable
        label="Products"
        rows={rows}
        columns={columns}
        error="Request failed"
        onRetry={retry}
      />,
    )
    expect(host.textContent).toContain('Previously loaded')
    await click('Retry')
    expect(retry).toHaveBeenCalledOnce()
    await render(<DataTable label="Products" rows={rows} columns={columns} isPending />)
    expect(host.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
    expect(host.textContent).toContain('Loading results')
  })
  it('requests bounded pages, blocks pending and handles an empty snapshot', async () => {
    const change = vi.fn()
    await render(
      <ListPagination page={1} totalPages={3} totalItems={44} onPageChange={change} />,
    )
    await click('Previous')
    expect(change).not.toHaveBeenCalled()
    await click('Next')
    expect(change).toHaveBeenLastCalledWith(2)
    change.mockClear()
    await render(
      <ListPagination
        page={3}
        totalPages={3}
        totalItems={44}
        onPageChange={change}
        isPending
      />,
    )
    await click('Previous')
    await click('Next')
    expect(change).not.toHaveBeenCalled()
    await render(
      <ListPagination page={1} totalPages={0} totalItems={0} onPageChange={change} />,
    )
    expect(host.textContent).toContain('No results')
  })
  it('applies caller filter drafts and clears only on explicit request', async () => {
    const apply = vi.fn(),
      clear = vi.fn(),
      change = vi.fn()
    await render(
      <FilterToolbar
        query="draft"
        onQueryChange={change}
        onApply={apply}
        onClear={clear}
      />,
    )
    expect(host.querySelector('input')?.value).toBe('draft')
    await act(() =>
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(apply).toHaveBeenCalledOnce()
    await click('Clear filters')
    expect(clear).toHaveBeenCalledOnce()
    await render(
      <FilterToolbar
        query="draft"
        onQueryChange={change}
        onApply={apply}
        onClear={clear}
        isPending
      />,
    )
    await act(() =>
      host
        .querySelector('form')
        ?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    )
    expect(apply).toHaveBeenCalledOnce()
    expect(host.querySelector('input')?.value).toBe('draft')
  })
  it('rejects wrong, empty and oversized files without replacing a valid selection', async () => {
    const select = vi.fn()
    await render(
      <FileUpload
        label="Product image"
        file={null}
        acceptedTypes={['image/png']}
        maxBytes={4}
        onSelect={select}
        onRemove={vi.fn()}
      />,
    )
    const input = host.querySelector('input')
    if (!input) throw new Error('Missing file input')
    for (const file of [
      new File(['x'], 'a.txt', { type: 'text/plain' }),
      new File([], 'a.png', { type: 'image/png' }),
      new File(['12345'], 'a.png', { type: 'image/png' }),
    ]) {
      Object.defineProperty(input, 'files', { configurable: true, value: [file] })
      await act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
    }
    expect(select).not.toHaveBeenCalled()
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const valid = new File(['12'], 'a.png', { type: 'image/png' })
    Object.defineProperty(input, 'files', { configurable: true, value: [valid] })
    await act(() => input.dispatchEvent(new Event('change', { bubbles: true })))
    expect(select).toHaveBeenCalledWith(valid)
  })
  it('retains selected files on failure, supports retry/removal and cleans previews', async () => {
    const file = new File(['x'], 'a.png', { type: 'image/png' }),
      retry = vi.fn(),
      remove = vi.fn()
    const props = {
      label: 'Image',
      file,
      acceptedTypes: ['image/png'],
      maxBytes: 20,
      onSelect: vi.fn(),
      onRemove: remove,
    }
    await render(
      <FileUpload {...props} state="error" error="Network error" onRetry={retry} />,
    )
    expect(host.querySelector('img')?.alt).toContain('Local preview')
    expect(host.textContent).toContain('selection retained')
    await click('Retry upload')
    expect(retry).toHaveBeenCalledOnce()
    await render(<FileUpload {...props} state="uploading" progress={42} />)
    expect(host.querySelector('progress')?.value).toBe(42)
    await click('Remove file')
    expect(remove).not.toHaveBeenCalled()
    await render(<FileUpload {...props} state="selected" />)
    await click('Remove file')
    expect(remove).toHaveBeenCalledOnce()
    await render(<FileUpload {...props} file={null} />)
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  })
  it('requires explicit eligible confirmation and a reason; retains failure context', async () => {
    const confirm = vi.fn()
    const props = {
      label: 'Suspend account',
      title: 'Confirm suspension',
      description: 'Review this account.',
      context: <p>Account reference: synthetic-1</p>,
      eligible: true,
      requiresReason: true,
      reason: '',
      onReasonChange: vi.fn(),
      onConfirm: confirm,
    }
    await render(<GuardedAction {...props} />)
    await click('Suspend account')
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
    )
    await click('Confirm Suspend account')
    expect(confirm).not.toHaveBeenCalled()
    await render(
      <GuardedAction {...props} reason="Review requested" error="Record changed" />,
    )
    expect(document.body.textContent).toContain('Record changed')
    expect(document.querySelector('textarea')?.value).toBe('Review requested')
    await click('Confirm Suspend account')
    expect(confirm).toHaveBeenCalledOnce()
    await render(<GuardedAction {...props} reason="Review requested" isPending />)
    await click('Awaiting confirmation…')
    await click('Cancel')
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
    expect(confirm).toHaveBeenCalledOnce()
    await render(
      <GuardedAction {...props} reason="Review requested" eligible={false} />,
    )
    await click('Confirm Suspend account')
    expect(confirm).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('Action unavailable')
  })
  it('dismisses confirmation with Escape and restores trigger focus', async () => {
    await render(
      <GuardedAction
        label="Deactivate"
        title="Confirm deactivation"
        description="Review this record."
        context={<p>Synthetic record</p>}
        eligible
        reason="draft"
        onReasonChange={vi.fn()}
        onConfirm={vi.fn()}
      />,
    )
    const trigger = Array.from(host.querySelectorAll('button')).find(
      (button) => button.textContent === 'Deactivate',
    )
    if (!trigger) throw new Error('Missing trigger')
    await act(() => trigger.focus())
    await click('Deactivate')
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
    )
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(
        document.querySelector('[role="dialog"]')?.contains(document.activeElement),
      ).toBe(true)
    })
    await act(() =>
      document.activeElement?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
    await vi.waitFor(async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(document.activeElement).toBe(trigger)
    })
  })
  it('allows the owning feature to close only after its confirmed result', async () => {
    const confirm = vi.fn(),
      change = vi.fn()
    const props = {
      label: 'Deactivate',
      title: 'Confirm deactivation',
      description: 'Review this record.',
      context: <p>Synthetic record</p>,
      eligible: true,
      reason: '',
      onReasonChange: vi.fn(),
      onConfirm: confirm,
      onOpenChange: change,
    }
    await render(<GuardedAction {...props} isOpen />)
    await vi.waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeTruthy(),
    )
    await click('Confirm Deactivate')
    expect(confirm).toHaveBeenCalledOnce()
    expect(document.querySelector('[role="dialog"]')).toBeTruthy()
    await render(<GuardedAction {...props} isOpen={false} />)
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull())
  })
})
