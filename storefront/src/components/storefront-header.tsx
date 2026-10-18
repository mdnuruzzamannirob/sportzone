'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { ThemePreferenceSelect } from './theme-preference'

const links = [
  ['Products', '/products'],
  ['Search', '/search'],
  ['Account', '/account'],
  ['Wishlist', '/wishlist'],
  ['Cart', '/cart'],
] as const

export function StorefrontHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const id = useId()
  const trigger = useRef<HTMLButtonElement>(null)
  const home = useRef<HTMLAnchorElement>(null)
  const panel = useRef<HTMLElement>(null)
  useEffect(() => {
    if (pathname !== null) setOpen(false)
  }, [pathname])
  useEffect(() => {
    const media = window.matchMedia?.('(min-width: 1024px)')
    const close = () => {
      if (!media?.matches) return
      const moveFocus =
        panel.current?.contains(document.activeElement) ||
        document.activeElement === trigger.current
      setOpen(false)
      if (moveFocus) home.current?.focus()
    }
    media?.addEventListener('change', close)
    return () => media?.removeEventListener('change', close)
  }, [])
  function dismiss() {
    setOpen(false)
    trigger.current?.focus()
  }
  return (
    <header className="border-b border-border py-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
        <Link
          ref={home}
          href="/"
          aria-label="SportZone home"
          className="inline-flex min-h-control items-center text-xl font-semibold text-text"
        >
          SportZone
          <span aria-hidden="true" className="text-brand">
            .
          </span>
        </Link>
        <nav
          aria-label="Main navigation"
          className="hidden flex-wrap items-center gap-4 lg:flex"
        >
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              aria-current={pathname === href ? 'page' : undefined}
              className="inline-flex min-h-control items-center underline underline-offset-4"
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2 lg:hidden">
          <button
            ref={trigger}
            type="button"
            aria-expanded={open}
            aria-controls={id}
            className="min-h-control rounded-control border border-control-border px-3"
            onClick={() => setOpen(!open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) dismiss()
            }}
          >
            Menu
          </button>
          <Link
            href="/search"
            className="inline-flex min-h-control items-center px-1 underline"
          >
            Search
          </Link>
          <Link
            href="/cart"
            className="inline-flex min-h-control items-center px-1 underline"
          >
            Cart
          </Link>
        </div>
      </div>
      <nav
        ref={panel}
        id={id}
        hidden={!open}
        aria-label="Mobile navigation"
        className="lg:hidden"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            dismiss()
          }
        }}
      >
        <div className="grid gap-2 border-t border-border py-4">
          {links.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={dismiss}
              aria-current={pathname === href ? 'page' : undefined}
              className="inline-flex min-h-control items-center underline underline-offset-4"
            >
              {label}
            </Link>
          ))}
          <Link
            href="/support"
            onClick={dismiss}
            className="inline-flex min-h-control items-center underline"
          >
            Customer support
          </Link>
          <button
            type="button"
            onClick={dismiss}
            className="min-h-control justify-self-start rounded-control border border-control-border px-3"
          >
            Close menu
          </button>
        </div>
      </nav>
      <details className="mt-2 max-w-full text-sm">
        <summary className="min-h-control cursor-pointer py-3">
          Appearance
        </summary>
        <div className="py-2">
          <ThemePreferenceSelect />
        </div>
      </details>
    </header>
  )
}
