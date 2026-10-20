import { Breadcrumbs, Disclosure, Drawer } from '@heroui/react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router'
import { ThemePreferenceSelect } from '../ui/theme-preference'
import { Link } from '../ui/link'
import { Notice } from '../ui/feedback'
import { navigationContext, navigationGroups } from './navigation'

function Navigation({ label, onNavigate }: { label: string; onNavigate?: () => void }) {
  const { pathname } = useLocation()
  const current = navigationContext(pathname)
  return (
    <nav aria-label={label} className="space-y-6">
      {navigationGroups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2 className="mb-2 px-3 text-xs font-semibold text-text-muted">
            {group.label}
          </h2>
          <ul className="space-y-1">
            {group.links.map(([title, href]) => (
              <li key={href}>
                <Link
                  to={href}
                  onClick={onNavigate}
                  aria-current={current?.[1] === href ? 'page' : undefined}
                  className={`flex w-full min-w-0 rounded-control border-s-2 px-3 py-2 no-underline ${current?.[1] === href ? 'border-brand bg-selected-surface font-semibold' : 'border-transparent'}`}
                >
                  {title}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  )
}

function ConnectionStatus() {
  const [offline, setOffline] = useState(false)
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine)
    update()
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => {
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return offline ? (
    <div className="mb-6">
      <Notice title="You are offline">Check your connection and try again.</Notice>
    </div>
  ) : null
}

export function AdminShell({
  title,
  actions,
  children,
}: {
  title: string
  actions?: ReactNode
  children: ReactNode
}) {
  const location = useLocation()
  const context = navigationContext(location.pathname)
  const [open, setOpen] = useState(false)
  const openRef = useRef(false)
  const setDrawerOpen = useCallback((value: boolean) => {
    openRef.current = value
    setOpen(value)
  }, [])
  const home = useRef<HTMLAnchorElement>(null)
  useEffect(() => {
    if (location.pathname + location.search + location.hash) setDrawerOpen(false)
  }, [location.pathname, location.search, location.hash, setDrawerOpen])
  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 1024px)')
    let focusFrame = 0
    let settledFrame = 0
    const resize = () => {
      if (!desktop?.matches || !openRef.current) return
      setDrawerOpen(false)
      // After the overlay restores focus, keep it on a visible desktop control.
      focusFrame = requestAnimationFrame(() => {
        settledFrame = requestAnimationFrame(() => home.current?.focus())
      })
    }
    desktop?.addEventListener('change', resize)
    return () => {
      desktop?.removeEventListener('change', resize)
      cancelAnimationFrame(focusFrame)
      cancelAnimationFrame(settledFrame)
    }
  }, [setDrawerOpen])
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[17rem_minmax(0,1fr)]">
      <a href="#main-content" className="sr-only focus:not-sr-only">
        Skip to content
      </a>
      <aside className="hidden min-w-0 border-e border-border bg-surface px-4 py-6 lg:block">
        <p className="mb-8 px-3 text-lg font-semibold">SportZone Admin</p>
        <Navigation label="Admin sidebar" />
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-4 py-4 sm:px-6">
          <div className="flex flex-wrap items-center gap-3">
            <Drawer isOpen={open} onOpenChange={setDrawerOpen}>
              <Drawer.Trigger className="button button--outline lg:hidden">
                Menu
              </Drawer.Trigger>
              <Drawer.Backdrop>
                <Drawer.Content placement="left">
                  <Drawer.Dialog
                    aria-label="Admin navigation"
                    style={{ touchAction: 'pan-y' }}
                    className="max-w-[90vw]"
                  >
                    <Drawer.Header>
                      <Drawer.Heading>SportZone Admin</Drawer.Heading>
                      <Drawer.CloseTrigger aria-label="Close menu" className="button button--outline">
                        Close menu
                      </Drawer.CloseTrigger>
                    </Drawer.Header>
                    <Drawer.Body>
                      <Navigation
                        label="Admin mobile navigation"
                        onNavigate={() => setDrawerOpen(false)}
                      />
                    </Drawer.Body>
                  </Drawer.Dialog>
                </Drawer.Content>
              </Drawer.Backdrop>
            </Drawer>
            <Link ref={home} to="/app" className="font-semibold">
              SportZone Admin
            </Link>
          </div>
          <div className="flex min-w-0 flex-wrap items-start gap-4">
            <p className="py-3 text-sm text-text-muted">Not signed in</p>
            <Disclosure className="w-56 max-w-full">
              <Disclosure.Heading>
                <Disclosure.Trigger className="flex w-full items-center gap-2 py-3 text-sm">
                  Appearance
                  <Disclosure.Indicator />
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body>
                  <ThemePreferenceSelect />
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="min-w-0 px-4 py-8 sm:px-6 lg:px-8"
        >
          <nav aria-label="Page context" className="mb-4">
            <Breadcrumbs>
              <Breadcrumbs.Item isDisabled>Administration</Breadcrumbs.Item>
              <Breadcrumbs.Item aria-current="page">
                {context?.[0] ?? 'Unavailable destination'}
              </Breadcrumbs.Item>
            </Breadcrumbs>
          </nav>
          <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
            <h1 className="text-3xl font-semibold">{title}</h1>
            {actions && (
              <section aria-label="Page actions" className="flex flex-wrap gap-3">
                {actions}
              </section>
            )}
          </div>
          <ConnectionStatus />
          {children}
        </main>
      </div>
    </div>
  )
}
