import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { act, type ComponentType, useState } from 'react'
import { createRoot, hydrateRoot, type Root } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  getThemePreference,
  setThemePreference,
  subscribeThemePreference,
} from '../../shared/theme'

export function themeInteractionTests(app: 'admin' | 'storefront', Control: ComponentType) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
  let root: Root
  let host: HTMLDivElement
  const source = readFileSync(resolve(process.cwd(), 'public/theme-bootstrap.js'), 'utf8')
  function bootstrap(saved: string | null, blocked = false) {
    runInNewContext(source, {
      document,
      matchMedia: globalThis.matchMedia,
      localStorage: {
        getItem() {
          if (blocked) throw new Error('Storage blocked')
          return saved
        },
      },
    })
  }
  function Harness() {
    const [value, setValue] = useState('draft')
    return (
      <>
        <Control />
        <input
          aria-label="Draft"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        <button type="button" onClick={() => setValue('edited draft')}>
          Edit draft
        </button>
      </>
    )
  }
  beforeEach(() => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    )
    localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    delete document.documentElement.dataset.themePreference
    window.history.replaceState(null, '', '/account?filter=kept')
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
  async function mount() {
    await act(() => root.render(<Harness />))
  }
  async function choose(value: string) {
    const select = host.querySelector('select')
    if (!select) throw new Error('Appearance control missing')
    await act(() => {
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
  }
  describe(`${app} theme preference`, () => {
    it.each(['light', 'dark'])(
      'THEME-01: blocking bootstrap applies persisted %s before React mounts',
      (value) => {
        bootstrap(value)
        expect(document.documentElement.dataset.theme).toBe(value)
        expect(getThemePreference()).toBe(value)
        expect(host.childElementCount).toBe(0)
      },
    )
    it.each([null, 'system', 'corrupt'])(
      'THEME-02: %s resolves the system preference for native HeroUI',
      (saved) => {
        bootstrap(saved)
        expect(getThemePreference()).toBe('system')
        expect(document.documentElement.dataset.theme).toBe('light')
      },
    )
    it('THEME-03: labelled HeroUI control persists light/dark/system and preserves DOM, draft and URL', async () => {
      await mount()
      const input = host.querySelector<HTMLInputElement>('input[aria-label="Draft"]')
      await act(() =>
        [...host.querySelectorAll('button')]
          .find((button) => button.textContent === 'Edit draft')
          ?.click(),
      )
      const labelledBy =
        host.querySelector('[data-slot="select-trigger"]')?.getAttribute('aria-labelledby') ?? ''
      expect(
        labelledBy
          .split(' ')
          .map((id) => document.getElementById(id)?.textContent)
          .join(' '),
      ).toContain('Appearance')
      expect(
        [...host.querySelectorAll('option')].filter((o) => o.value).map((o) => o.textContent),
      ).toEqual(['Light', 'Dark', 'System'])
      for (const value of ['dark', 'light', 'system']) {
        await choose(value)
        expect(localStorage.getItem('sportzone.theme')).toBe(value)
        expect(host.querySelector('select')?.value).toBe(value)
        expect(host.querySelector<HTMLInputElement>('input[aria-label="Draft"]')).toBe(input)
        expect(input?.value).toBe('edited draft')
        expect(window.location.pathname + window.location.search).toBe('/account?filter=kept')
      }
      expect(document.documentElement.dataset.theme).toBe('light')
    })
    it('THEME-10: HeroUI popup opens from the keyboard and selecting Dark updates the preference', async () => {
      await mount()
      const trigger = host.querySelector<HTMLButtonElement>('[data-slot="select-trigger"]')
      trigger?.focus()
      await act(async () => {
        trigger?.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'ArrowDown',
            code: 'ArrowDown',
            bubbles: true,
            cancelable: true,
          }),
        )
      })
      expect(trigger?.getAttribute('aria-expanded')).toBe('true')
      const dark = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find((option) =>
        option.textContent?.includes('Dark'),
      )
      expect(dark).toBeDefined()
      await act(() => dark?.click())
      expect(getThemePreference()).toBe('dark')
      expect(localStorage.getItem('sportzone.theme')).toBe('dark')
      expect(trigger?.getAttribute('aria-expanded')).toBe('false')
    })
    it('THEME-04: persisted selection restores after control remount', async () => {
      localStorage.setItem('sportzone.theme', 'dark')
      bootstrap('dark')
      await mount()
      expect(host.querySelector('select')?.value).toBe('dark')
      await act(() => root.render(null))
      await mount()
      expect(host.querySelector('select')?.value).toBe('dark')
    })
    it('THEME-09: server-rendered control hydrates without resetting the bootstrap theme', async () => {
      await act(() => root.unmount())
      host.innerHTML = renderToString(<Harness />)
      localStorage.setItem('sportzone.theme', 'dark')
      bootstrap('dark')
      const errors: unknown[] = []
      await act(() => {
        root = hydrateRoot(host, <Harness />, {
          onRecoverableError: (error) => errors.push(error),
        })
      })
      expect(errors).toEqual([])
      expect(getThemePreference()).toBe('dark')
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(host.querySelector('select')?.value).toBe('dark')
    })
    it('THEME-05: storage failures preserve a usable in-memory preference', async () => {
      bootstrap(null, true)
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('Blocked')
      })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new Error('Blocked')
      })
      await mount()
      await choose('dark')
      expect(getThemePreference()).toBe('dark')
      expect(host.querySelector('select')?.value).toBe('dark')
    })
    it('THEME-06: same-origin storage changes synchronize, unrelated keys do not, removal returns System', async () => {
      await mount()
      await act(() =>
        window.dispatchEvent(
          new StorageEvent('storage', { key: 'sportzone.theme', newValue: 'dark' }),
        ),
      )
      expect(host.querySelector('select')?.value).toBe('dark')
      await act(() =>
        window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'light' })),
      )
      expect(getThemePreference()).toBe('dark')
      await act(() =>
        window.dispatchEvent(
          new StorageEvent('storage', {
            key: 'sportzone.theme',
            newValue: 'light',
            storageArea: sessionStorage,
          }),
        ),
      )
      expect(getThemePreference()).toBe('dark')
      await act(() =>
        window.dispatchEvent(new StorageEvent('storage', { key: null, newValue: null })),
      )
      expect(host.querySelector('select')?.value).toBe('system')
    })
    it('THEME-07: subscriptions clean up and invalid runtime input is rejected', () => {
      const callback = vi.fn()
      const stop = subscribeThemePreference(callback)
      stop()
      setThemePreference('light')
      expect(callback).not.toHaveBeenCalled()
      expect(() => Reflect.apply(setThemePreference, undefined, ['invalid'])).toThrow(TypeError)
    })
    it('THEME-08: System resolves the OS before mount and follows OS changes without overriding explicit choices', () => {
      const media = Object.assign(new EventTarget(), { matches: true })
      vi.stubGlobal('matchMedia', () => media)
      bootstrap(null)
      expect(document.documentElement.dataset.theme).toBe('dark')
      expect(getThemePreference()).toBe('system')
      const callback = vi.fn()
      const stop = subscribeThemePreference(callback)
      media.matches = false
      media.dispatchEvent(new Event('change'))
      expect(document.documentElement.dataset.theme).toBe('light')
      expect(callback).toHaveBeenCalledOnce()
      setThemePreference('light')
      media.matches = true
      media.dispatchEvent(new Event('change'))
      expect(document.documentElement.dataset.theme).toBe('light')
      stop()
    })
  })
}
