import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AppRoutes } from '../src/app/routes'

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
  await act(() => root.render(<BrowserRouter><AppRoutes /></BrowserRouter>))
}

describe('admin scaffold routing', () => {
  it('AD-01: entry redirects to the explicit unavailable sign-in page', async () => {
    await visit('/')
    expect(window.location.pathname).toBe('/login')
    expect(container.querySelectorAll('main')).toHaveLength(1)
    expect(container.querySelector('h1')?.textContent).toBe('Administrator access')
    expect(container.textContent).toContain('Sign-in is not available yet.')
    expect(container.querySelector('form')).toBeNull()
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
    const link = container.querySelector('a')
    expect(link?.getAttribute('href')).toBe('/login')
    await act(() => link?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })))
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
