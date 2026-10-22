import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminShell } from '../src/components/layout/admin-shell'
import { navigationGroups } from '../src/components/layout/navigation'
import { Button } from '../src/components/ui/button'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement
let root: Root
let desktop: EventTarget & { matches: boolean }

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  delete document.documentElement.dataset.themePreference
  desktop = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', (query: string) =>
    query === '(min-width: 1024px)'
      ? desktop
      : Object.assign(new EventTarget(), { matches: false }),
  )
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  delete document.documentElement.dataset.themePreference
})
async function visit(path: string) {
  window.history.replaceState(null, '', path)
  await act(() => {
    window.dispatchEvent(new PopStateEvent('popstate'))
    root.render(
      <BrowserRouter>
        <AdminShell title="Shell preview">
          <p>Shell layout fixture.</p>
        </AdminShell>
      </BrowserRouter>,
    )
  })
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(host.querySelector('h1')).not.toBeNull()
    },
    { timeout: 2000, interval: 20 },
  )
}
async function click(node: HTMLElement | null | undefined) {
  expect(node).toBeTruthy()
  await act(async () => {
    node?.focus()
    node?.click()
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}
function trigger() {
  return host.querySelector<HTMLButtonElement>('[data-slot="drawer-trigger"]')
}
function dialog() {
  return document.querySelector<HTMLElement>('[role="dialog"]')
}
async function pressEscape() {
  await act(async () => {
    dialog()?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
  })
}

describe('admin navigation shell', () => {
  it('ADMIN-SHELL-01: all five navigation groups and 14 destinations share one main/skip target and honest signed-out state', async () => {
    localStorage.setItem('role', 'admin')
    localStorage.setItem('authenticated', 'true')
    await visit('/app/orders/synthetic-private-id?customer=synthetic-private-value')
    expect(host.querySelectorAll('main')).toHaveLength(1)
    expect(host.querySelector('#main-content')?.getAttribute('tabindex')).toBe('-1')
    expect(host.querySelector('a[href="#main-content"]')).not.toBeNull()
    const nav = host.querySelector('nav[aria-label="Admin sidebar"]')
    expect(nav?.querySelectorAll('section')).toHaveLength(5)
    expect(nav?.querySelectorAll('a')).toHaveLength(14)
    for (const group of navigationGroups)
      for (const [label, href] of group.links) {
        expect(nav?.querySelector(`a[href="${href}"]`)?.textContent).toBe(label)
      }
    expect(nav?.querySelector('[aria-current="page"]')?.getAttribute('href')).toBe('/app/orders')
    expect(host.querySelector('h1')?.textContent).toBe('Shell preview')
    expect(host.textContent).toContain('Not signed in')
    expect(host.textContent).not.toMatch(/synthetic-private|Logout|Revenue|৳/)
    expect(host.querySelector('form, table')).toBeNull()
    expect(host.querySelector('aside')?.className).toContain('lg:block')
    expect(trigger()?.className).toContain('lg:hidden')
  })
  it('ADMIN-SHELL-02: mobile Drawer exposes the same destinations in a labelled modal and Escape restores focus', async () => {
    await visit('/app/products')
    expect(dialog()).toBeNull()
    await click(trigger())
    expect(dialog()?.getAttribute('aria-label')).toBe('Admin navigation')
    expect(host.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(dialog()?.querySelectorAll('nav a')).toHaveLength(14)
    await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(dialog()?.contains(document.activeElement)).toBe(true)
      },
      { timeout: 2000, interval: 20 },
    )
    await pressEscape()
    expect(dialog()).toBeNull()
    await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(document.activeElement).toBe(trigger())
      },
      { timeout: 2000, interval: 20 },
    )
  })
  it('ADMIN-SHELL-03: mobile navigation changes the URL/context, closes the Drawer and never unlocks a screen', async () => {
    await visit('/app')
    await click(trigger())
    await click(dialog()?.querySelector<HTMLAnchorElement>('a[href="/app/inventory"]'))
    expect(window.location.pathname).toBe('/app/inventory')
    expect(dialog()).toBeNull()
    expect(host.querySelector('nav[aria-label="Page context"]')?.textContent).toContain('Inventory')
    expect(host.querySelector('h1')?.textContent).toBe('Shell preview')
    expect(host.querySelector('table, form')).toBeNull()
  })
  it('ADMIN-SHELL-04: explicit Close restores focus and switching to desktop dismisses the modal onto a visible control', async () => {
    await visit('/app')
    await click(trigger())
    await click(dialog()?.querySelector<HTMLButtonElement>('[data-slot="drawer-close-trigger"]'))
    expect(dialog()).toBeNull()
    await vi.waitFor(
      async () => {
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 0))
        })
        expect(document.activeElement).toBe(trigger())
      },
      { timeout: 2000, interval: 20 },
    )
    await click(trigger())
    desktop.matches = true
    await act(async () => {
      desktop.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    expect(dialog()).toBeNull()
    expect(document.activeElement).toBe(host.querySelector('header a[href="/app"]'))
  })
  it('ADMIN-SHELL-05: longest section match distinguishes delivery settings; unknown paths are not reflected', async () => {
    await visit('/app/settings/delivery')
    expect(
      host.querySelector('nav[aria-label="Admin sidebar"] [aria-current]')?.getAttribute('href'),
    ).toBe('/app/settings/delivery')
    await visit('/app/unrecognized-sensitive-id')
    expect(host.querySelector('nav[aria-label="Admin sidebar"] [aria-current]')).toBeNull()
    expect(host.textContent).toContain('Unavailable destination')
    expect(host.textContent).not.toContain('unrecognized-sensitive-id')
  })
  it('ADMIN-SHELL-06: title/action composition and Appearance preserve an edited draft and route', async () => {
    const action = vi.fn()
    window.history.replaceState(null, '', '/app/products?filter=retained')
    await act(() =>
      root.render(
        <BrowserRouter>
          <AdminShell
            title="Preview only"
            actions={<Button onPress={action}>Preview action</Button>}
          >
            <input aria-label="Draft" defaultValue="draft" />
          </AdminShell>
        </BrowserRouter>,
      ),
    )
    const input = host.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
    if (!input) throw new Error('Draft missing')
    input.value = 'edited draft'
    await act(async () => {
      input.focus()
      desktop.matches = true
      desktop.dispatchEvent(new Event('change'))
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    expect(document.activeElement).toBe(input)
    await click(host.querySelector<HTMLButtonElement>('[aria-label="Page actions"] button'))
    expect(action).toHaveBeenCalledOnce()
    const appearance = host.querySelector<HTMLButtonElement>('[data-slot="disclosure-trigger"]')
    await click(appearance)
    const select = host.querySelector('select')
    if (!select) throw new Error('Appearance select missing')
    await act(() => {
      select.value = 'dark'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    expect(document.documentElement.dataset.theme).toBe('dark')
    expect(host.querySelector('input[aria-label="Draft"]')).toBe(input)
    expect(input.value).toBe('edited draft')
    expect(window.location.pathname + window.location.search).toBe('/app/products?filter=retained')
    expect(host.querySelector('h1')?.textContent).toBe('Preview only')
  })
  it('ADMIN-SHELL-07: offline feedback clears on reconnect and listeners are removed on unmount', async () => {
    let online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
    await visit('/app')
    expect(host.querySelector('[role="status"]')).toBeNull()
    online = false
    await act(() => window.dispatchEvent(new Event('offline')))
    expect(host.querySelector('[role="status"]')?.textContent).toContain('You are offline')
    online = true
    await act(() => window.dispatchEvent(new Event('online')))
    expect(host.querySelector('[role="status"]')).toBeNull()
    await act(() => root.render(null))
    await act(() => window.dispatchEvent(new Event('offline')))
    expect(host.textContent).toBe('')
  })
})
