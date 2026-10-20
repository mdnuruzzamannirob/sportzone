import { renderToStaticMarkup } from 'react-dom/server'
import { AdminLoading } from '../src/components/layout/admin-loading'
import { RouteErrorBoundary } from '../src/app/route-error-boundary'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRoutes } from '../src/app/router'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
let container: HTMLDivElement
let root: Root

beforeEach(() => {
  localStorage.clear()
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(async () => {
  await act(() => root.unmount())
  container.remove()
  localStorage.clear()
})
async function visit(path: string) {
  window.history.replaceState(null, '', path)
  await act(() =>
    root.render(
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>,
    ),
  )
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0))
      })
      expect(container.querySelector('h1')).not.toBeNull()
    },
    { timeout: 2000, interval: 20 },
  )
}

describe('admin scaffold routing', () => {
  it('AD-01: entry redirects to the explicit unavailable sign-in page', async () => {
    await visit('/')
    expect(window.location.pathname).toBe('/login')
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('h1')?.textContent).toBe('Administrator access')
    expect(container.textContent).toContain('Sign-in is not available yet.')
    expect(container.querySelector('form')).toBeNull()
    expect(
      [...container.querySelectorAll('button')].find(
        (button) => button.textContent === 'Sign in',
      )?.disabled,
    ).toBe(true)
  })

  it('AD-02: direct nested admin URLs remain unavailable despite forged client flags', async () => {
    localStorage.setItem('role', 'admin')
    localStorage.setItem('authenticated', 'true')
    await visit('/app/orders/synthetic-order')
    expect(container.querySelector('h1')?.textContent).toBe('Admin access unavailable')
    expect(container.textContent).not.toContain('synthetic-order')
    expect(container.querySelectorAll('main')).toHaveLength(1)
  })

  it('AD-03: native link navigation and history preserve route boundaries', async () => {
    await visit('/app')
    const link = container.querySelector('a[href="/login"]')
    expect(link?.getAttribute('href')).toBe('/login')
    await act(() =>
      link?.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }),
      ),
    )
    expect(window.location.pathname).toBe('/login')
    expect(container.querySelector('h1')?.textContent).toBe('Administrator access')
    await act(() => {
      window.history.replaceState(null, '', '/app/products')
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    expect(container.querySelector('h1')?.textContent).toBe('Admin access unavailable')
  })

  it('AD-04: unknown public URL has a recovery link without echoing the path', async () => {
    await visit('/unknown-synthetic-path')
    expect(container.querySelector('h1')?.textContent).toBe('Page not found')
    expect(container.querySelector('a')?.getAttribute('href')).toBe('/login')
    expect(container.textContent).not.toContain('unknown-synthetic-path')
  })
})

describe('admin route recovery', () => {
  it('AD-05: pending administration exposes a single landmark and live status', () => {
    const html = renderToStaticMarkup(<AdminLoading />)
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toContain('role="status"')
    expect(html).toContain('Loading administration…')
  })

  it('AD-06: rendering failure closes access and shows safe reload recovery', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    function FailedRoute(): never {
      throw new Error('synthetic private diagnostics')
    }
    try {
      await act(() => root.render(
        <RouteErrorBoundary><FailedRoute /></RouteErrorBoundary>,
      ))
      expect(container.querySelector('h1')?.textContent).toBe('Administration could not load')
      expect(container.querySelector('[role="alert"]')).not.toBeNull()
      expect(container.querySelectorAll('main')).toHaveLength(1)
      expect(container.textContent).not.toContain('synthetic private diagnostics')
      expect(container.querySelector('button')?.textContent).toBe('Reload page')
      expect(container.querySelector('form')).toBeNull()
    } finally {
      log.mockRestore()
    }
  })
})
