'use client'

import { Disclosure } from '../ui/index'
import { Link } from '../ui/link'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '../ui/button'
import { AppearanceMenu } from './appearance-menu'

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
  const trigger = useRef<HTMLHeadingElement>(null)
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
        document.activeElement === trigger.current?.querySelector('button')
      setOpen(false)
      if (moveFocus) home.current?.focus()
    }
    media?.addEventListener('change', close)
    return () => media?.removeEventListener('change', close)
  }, [])
  function dismiss() {
    setOpen(false)
    trigger.current?.querySelector('button')?.focus()
  }
  return (
    <header className="border-b border-border py-4">
      <Disclosure isExpanded={open} onExpandedChange={setOpen}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
          <Link
            ref={home}
            href="/"
            aria-label="SportZone home"
            className="inline-flex  items-center text-xl font-semibold text-foreground"
          >
            SportZone
            <span aria-hidden="true" className="text-brand">
              .
            </span>
          </Link>
          <nav aria-label="Main navigation" className="hidden flex-wrap items-center gap-4 lg:flex">
            {links.map(([label, href]) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname === href ? 'page' : undefined}
                className="inline-flex  items-center"
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2 lg:hidden">
            <Disclosure.Heading ref={trigger}>
              <Disclosure.Trigger
                className="button button--outline"
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && open) dismiss()
                }}
              >
                Menu
              </Disclosure.Trigger>
            </Disclosure.Heading>
            <Link href="/search" className="inline-flex  items-center px-1">
              Search
            </Link>
            <Link href="/cart" className="inline-flex  items-center px-1">
              Cart
            </Link>
          </div>
        </div>
        <Disclosure.Content className="lg:hidden">
          <nav
            ref={panel}
            aria-label="Mobile navigation"
            className="lg:hidden"
            onKeyDownCapture={(event) => {
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
                  className="inline-flex  items-center"
                >
                  {label}
                </Link>
              ))}
              <Link href="/support" onClick={dismiss} className="inline-flex  items-center">
                Customer support
              </Link>
              <Button
                type="button"
                onPress={dismiss}
                variant="outline"
                className="justify-self-start"
              >
                Close menu
              </Button>
            </div>
          </nav>
        </Disclosure.Content>
      </Disclosure>
      <AppearanceMenu />
    </header>
  )
}
