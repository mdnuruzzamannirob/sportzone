import { test, expect, type Page } from '@playwright/test'
import { fork, type ChildProcess } from 'node:child_process'
import { resolve } from 'node:path'
import AxeBuilder from '@axe-core/playwright'

// Never retain network traces: even synthetic HTTP-only cookies/proofs are secrets.
test.use({ ignoreHTTPSErrors: true, trace: 'off', screenshot: 'off' })
test.setTimeout(120000)
let backend: ChildProcess
let sequence = 0
const waiters = new Map<
  number,
  { resolve: (value: unknown) => void; reject: (error: Error) => void }
>()
async function control(type: string, extra: Record<string, string> = {}) {
  const id = ++sequence
  return new Promise<unknown>((resolve, reject) => {
    waiters.set(id, { resolve, reject })
    backend.send({ type, id, ...extra })
    setTimeout(() => {
      if (waiters.delete(id)) reject(new Error('Fixture control timed out'))
    }, 15000).unref()
  })
}
test.beforeAll(async () => {
  backend = fork(resolve('tests/ui/auth-server.mjs'), [], {
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    env: { ...process.env, MONGOMS_DISTRO: 'ubuntu-24.04' },
  })
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error('Isolated identity server did not start')),
      45000,
    )
    backend.on('message', (raw: unknown) => {
      if (!raw || typeof raw !== 'object') return
      if ('ready' in raw) {
        clearTimeout(timeout)
        resolve()
      }
      if ('error' in raw && !('id' in raw)) {
        clearTimeout(timeout)
        reject(new Error('Identity fixture startup failed'))
      }
      if ('id' in raw && typeof raw.id === 'number') {
        const pending = waiters.get(raw.id)
        waiters.delete(raw.id)
        if ('error' in raw) pending?.reject(new Error('Fixture operation failed'))
        else pending?.resolve('result' in raw ? raw.result : undefined)
      }
    })
    backend.once('exit', () => {
      clearTimeout(timeout)
      reject(new Error('Identity fixture exited'))
    })
  })
})
test.afterAll(async () => {
  if (!backend?.connected) return
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => backend.kill('SIGTERM'), 10000)
    backend.once('exit', () => {
      clearTimeout(timer)
      resolve()
    })
    backend.send({ type: 'close' })
  })
})
test.beforeEach(async () => {
  await control('resetQuotas')
})
const shop = 'https://127.0.0.1:3443',
  admin = 'https://127.0.0.1:5443'
async function submit(page: Page, name: string) {
  await page.getByRole('button', { name, exact: true }).click()
}
async function signIn(page: Page, origin: string, email: string, password: string) {
  await page.goto(`${origin}/login`)
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByLabel('Password', { exact: true }).press('Enter')
}
async function openProof(page: Page, kind: string, email: string) {
  const result = await control('proof', { kind, email })
  if (typeof result !== 'string') throw new Error('Proof fixture unavailable')
  // Sanitize navigation failures instead of putting proof URLs into test artifacts.
  try {
    await page.goto(result)
  } catch {
    throw new Error('Proof-link navigation failed')
  }
  await page.waitForFunction(() => location.hash === '')
  expect(new URL(page.url()).hash === '').toBe(true)
}
async function audit(page: Page) {
  // React Aria retains pending-button announcements for seven seconds. Let
  // announcements for controls removed after a completed save finish first.
  await expect
    .poll(() => page.locator('[data-live-announcer] [role=img]').count(), { timeout: 10000 })
    .toBe(0)
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'])
    .analyze()
  expect(
    results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
  ).toEqual([])
}

test('customer real API: registration, account/address edits, recovery, password/email change and expired cache', async ({
  page,
  browser,
}, info) => {
  const email = `browser-${info.project.name}@example.test`,
    changed = `changed-${info.project.name}@example.test`,
    password = 'Synthetic browser password',
    replacement = 'Synthetic replacement password'
  const noScript = await browser.newContext({ javaScriptEnabled: false, ignoreHTTPSErrors: true })
  const staticPage = await noScript.newPage()
  await staticPage.goto(`${shop}/register`)
  await expect(staticPage.getByLabel('Password', { exact: true })).toBeDisabled()
  await expect(
    staticPage.getByRole('button', { name: 'Create account', exact: true }),
  ).toBeDisabled()
  await noScript.close()
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  await page.goto(`${shop}/register`)
  await page.getByLabel('Name', { exact: true }).fill('Synthetic browser')
  await page.getByLabel('Email', { exact: true }).fill(email)
  await page.getByLabel('Password', { exact: true }).fill('short')
  await submit(page, 'Create account')
  await expect(page.getByText('Please check the following fields', { exact: true })).toBeVisible()
  await audit(page)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await submit(page, 'Create account')
  await expect(page.getByText('Account created.', { exact: false })).toBeVisible()
  await signIn(page, shop, email, 'Incorrect synthetic password')
  await expect(
    page.getByRole('form', { name: 'Sign in', exact: true }).getByRole('alert'),
  ).toContainText('Email or password is incorrect')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue(email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await submit(page, 'Sign in')
  await expect(page).toHaveURL(`${shop}/account`)
  await expect(page.getByText(`Signed in as ${email}`)).toBeVisible()
  const response = await page.reload()
  expect(response?.headers()['cache-control']).toMatch(/private.*no-store/)
  const profile = page.getByRole('form', { name: 'Profile', exact: true })
  await page.route('https://127.0.0.1:4443/api/v1/me', (route) =>
    route.request().method() === 'PATCH' ? route.abort('failed') : route.continue(),
  )
  await profile.getByLabel('Name', { exact: true }).fill('Updated browser name')
  await profile.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(profile.getByRole('alert')).toContainText('service is unavailable')
  await expect(profile.getByLabel('Name', { exact: true })).toHaveValue('Updated browser name')
  await page.unroute('https://127.0.0.1:4443/api/v1/me')
  await profile.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(profile).toContainText('Profile saved.')
  const address = page.getByRole('form', { name: 'Add address', exact: true })
  for (const [label, value] of [
    ['Recipient', 'Synthetic recipient'],
    ['Address phone', '01700000000'],
    ['District', 'dhaka'],
    ['Area', 'unserved'],
    ['Street address', 'Synthetic street'],
  ])
    await address.getByLabel(label, { exact: true }).fill(value)
  await address.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(address.getByRole('alert')).toContainText('Delivery is not available')
  await expect(address.getByLabel('Street address', { exact: true })).toHaveValue(
    'Synthetic street',
  )
  await address.getByLabel('Area', { exact: true }).fill('dhanmondi')
  await address.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('article')).toHaveCount(1)
  await submit(page, 'Make default')
  await expect(page.locator('article h3')).toContainText('Default')
  await submit(page, 'Edit address')
  const edit = page.getByRole('form', { name: 'Edit saved address', exact: true })
  await edit.getByLabel('Street address', { exact: true }).fill('Updated street')
  await edit.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('article')).toContainText('Updated street')
  await page.setViewportSize({ width: 375, height: 900 })
  await audit(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await info.attach('account-light-mobile', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await page.emulateMedia({ colorScheme: 'dark' })
  await audit(page)
  await submit(page, 'Remove address')
  await submit(page, 'Confirm removal')
  await expect(page.locator('article')).toHaveCount(0)
  const changePassword = page.getByRole('form', { name: 'Change password', exact: true })
  await changePassword.getByLabel('Current password', { exact: true }).fill(password)
  await changePassword.getByLabel('New password', { exact: true }).fill(replacement)
  await changePassword.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(
    page.getByText('Password changed. Other sessions were revoked.', { exact: true }),
  ).toBeVisible()
  const emailForm = page.getByRole('form', { name: 'Change email', exact: true })
  await emailForm.getByLabel('New email', { exact: true }).fill(changed)
  await emailForm.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(emailForm).toContainText('Your current email stays unchanged')
  await openProof(page, 'email', email)
  await submit(page, 'Confirm email change')
  await expect(page.getByRole('status')).toContainText('Email changed')
  await signIn(page, shop, changed, replacement)
  await expect(page).toHaveURL(`${shop}/account`)
  await submit(page, 'Sign out')
  await expect(page).toHaveURL(`${shop}/login`)
  await page.goto(`${shop}/forgot-password`)
  await page.getByLabel('Email', { exact: true }).fill(changed)
  await submit(page, 'Recover password')
  await expect(page.getByRole('status')).toContainText('If this address is eligible')
  await openProof(page, 'customer', changed)
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByLabel('Confirm new password', { exact: true }).fill(password)
  await submit(page, 'Reset password')
  await expect(page.getByRole('status')).toContainText('Password reset confirmed')
  await signIn(page, shop, changed, password)
  await expect(page).toHaveURL(`${shop}/account`)
  await control('expire', { email: changed })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByText('Sign in to view your account.', { exact: false })).toBeVisible()
  await expect(page.getByText(changed, { exact: false })).toHaveCount(0)
  const other = await page.context().newPage()
  await signIn(other, shop, 'customer@example.test', 'Synthetic customer password')
  await expect(other).toHaveURL(`${shop}/account`)
  await expect(page.getByText('Signed in as customer@example.test')).toBeVisible()
  await other.close()
})

test('admin real API: customer-cookie denial, login/recovery, logout and suspended session', async ({
  page,
}, info) => {
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  await signIn(page, shop, 'customer@example.test', 'Synthetic customer password')
  await expect(page).toHaveURL(`${shop}/account`)
  await page.addInitScript(() => {
    localStorage.setItem('role', 'admin')
    localStorage.setItem('authenticated', 'true')
  })
  await page.goto(`${admin}/app/orders`)
  await expect(page.getByRole('heading', { name: 'Administrator sign-in required' })).toBeVisible()
  await signIn(page, admin, 'admin@example.test', 'Synthetic administrator password')
  await expect(page).toHaveURL(`${admin}/app`)
  await expect(page.getByText('admin@example.test', { exact: true })).toBeVisible()
  await page.setViewportSize({ width: 1280, height: 900 })
  await audit(page)
  await info.attach('admin-dark-desktop', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.setViewportSize({ width: 375, height: 900 })
  await audit(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
  await info.attach('admin-light-mobile', {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  })
  await submit(page, 'Sign out')
  await expect(page).toHaveURL(`${admin}/login`)
  await page.goto(`${shop}/account`)
  await expect(page.getByText('Signed in as customer@example.test')).toBeVisible()
  await page.goto(`${admin}/forgot-password`)
  await page.getByLabel('Email', { exact: true }).fill('admin@example.test')
  await submit(page, 'Recover password')
  await expect(page.getByRole('status')).toContainText('If this address is eligible')
  await openProof(page, 'admin', 'admin@example.test')
  await page.getByLabel('New password', { exact: true }).fill('Synthetic reset admin password')
  await page
    .getByLabel('Confirm new password', { exact: true })
    .fill('Synthetic reset admin password')
  await submit(page, 'Reset password')
  await expect(page.getByRole('status')).toContainText('Password reset confirmed')
  await signIn(page, admin, 'admin@example.test', 'Synthetic reset admin password')
  await expect(page).toHaveURL(`${admin}/app`)
  await control('suspend', { email: 'admin@example.test' })
  await page.evaluate(() => window.dispatchEvent(new Event('visibilitychange')))
  await expect(page.getByRole('heading', { name: 'Administrator sign-in required' })).toBeVisible()
  await expect(page.getByText('admin@example.test', { exact: true })).toHaveCount(0)
})
