// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StorefrontHeader } from '../src/components/layout/storefront-header'
import { StorefrontShell, supportLinks } from '../src/components/layout/storefront-shell'
import { NetworkStatus } from '../src/components/layout/network-status'
import { LoadingPage, MissingPage } from '../src/components/ui/storefront-states'
import PublicError from '../src/app/(store)/error'

const navigation = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let host: HTMLDivElement
let root: Root
let media: EventTarget & { matches: boolean }
beforeEach(() => {
  navigation.pathname = '/'
  localStorage.clear()
  media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => media)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(() => root.unmount())
  host.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function click(element: Element | null) {
  expect(element).not.toBeNull()
  await act(() =>
    element?.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true }),
    ),
  )
}
function panel() {
  return host.querySelector('nav[aria-label="Mobile navigation"]')
}
function trigger() {
  return host.querySelector('button[aria-controls]')
}
function disclosure() {
  return panel()?.closest('[data-slot="disclosure-content"]')
}

describe('responsive storefront shell', () => {
  it('SHELL-01: mobile disclosure is closed and labelled, opens with current links and closes via Escape with restored focus', async () => {
    await act(() => root.render(<StorefrontHeader />))
    expect(disclosure()?.hasAttribute('hidden')).toBe(true)
    expect(trigger()?.getAttribute('aria-controls')).toBe(disclosure()?.id)
    await click(trigger())
    expect(trigger()?.getAttribute('aria-expanded')).toBe('true')
    expect(disclosure()?.hasAttribute('hidden')).toBe(false)
    const first = panel()?.querySelector('a')
    first?.focus()
    await act(() =>
      first?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
    await click(trigger())
    const close = panel()?.querySelector('button')
    close?.focus()
    await act(() =>
      close?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      ),
    )
    expect(trigger()?.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })
  it('SHELL-02: link activation dismisses disclosure and explicit Close returns focus', async () => {
    await act(() => root.render(<StorefrontHeader />))
    await click(trigger())
    const link = panel()?.querySelector('a')
    link?.addEventListener('click', (event) => event.preventDefault())
    await click(link ?? null)
    expect(disclosure()?.hasAttribute('hidden')).toBe(true)
    await click(trigger())
    await click(panel()?.querySelector('button') ?? null)
    expect(document.activeElement).toBe(trigger())
    expect(disclosure()?.hasAttribute('hidden')).toBe(true)
  })
  it('SHELL-03: route changes and desktop breakpoint dismiss stale mobile navigation', async () => {
    await act(() => root.render(<StorefrontHeader />))
    await click(trigger())
    navigation.pathname = '/products'
    await act(() => root.render(<StorefrontHeader />))
    expect(disclosure()?.hasAttribute('hidden')).toBe(true)
    expect(
      host
        .querySelector('nav[aria-label="Main navigation"] a[aria-current="page"]')
        ?.getAttribute('href'),
    ).toBe('/products')
    await click(trigger())
    panel()?.querySelector('a')?.focus()
    media.matches = true
    await act(() => media.dispatchEvent(new Event('change')))
    expect(disclosure()?.hasAttribute('hidden')).toBe(true)
    expect(document.activeElement).toBe(
      host.querySelector('a[aria-label="SportZone home"]'),
    )
  })
  it('SHELL-04: shell exposes one main/skip target, responsive navigation, policy/support entries and appearance', () => {
    const html = renderToStaticMarkup(
      <StorefrontShell>
        <h1>Page</h1>
      </StorefrontShell>,
    )
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('href="#main-content"')
    expect(html).toContain('lg:hidden')
    expect(html).toContain('lg:flex')
    for (const [, href] of supportLinks) expect(html).toContain(`href="${href}"`)
    expect(html).toContain('Appearance')
    expect(html).not.toMatch(/items in cart|0 items|Free shipping/)
  })
  it('SHELL-05: offline/online feedback is reversible and subscription cleans up', async () => {
    let online = true
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
    await act(() => root.render(<NetworkStatus />))
    expect(host.querySelector('[role="status"]')).toBeNull()
    online = false
    await act(() => window.dispatchEvent(new Event('offline')))
    expect(host.textContent).toContain('You are offline')
    online = true
    await act(() => window.dispatchEvent(new Event('online')))
    expect(host.querySelector('[role="status"]')).toBeNull()
    await act(() => root.render(null))
    await act(() => window.dispatchEvent(new Event('offline')))
    expect(host.textContent).toBe('')
  })
  it('SHELL-06: error uses safe text and real retry callback; loading and 404 expose recovery/status semantics', async () => {
    const reset = vi.fn()
    await act(() =>
      root.render(
        <PublicError error={new Error('sensitive synthetic detail')} reset={reset} />,
      ),
    )
    expect(host.querySelector('[role="alert"]')).not.toBeNull()
    expect(host.textContent).not.toContain('sensitive synthetic detail')
    await click(host.querySelector('button'))
    expect(reset).toHaveBeenCalledOnce()
    expect(renderToStaticMarkup(<LoadingPage />)).toContain('role="status"')
    expect(renderToStaticMarkup(<MissingPage />)).toContain('href="/"')
  })
})
