import { verifyCatalogRendering } from './catalog-smoke.mjs'
import { verifyHeroUIStyles } from '../../tests/helpers/heroui-smoke.mjs'
import { verifyThemeBootstrap } from '../../tests/helpers/theme-smoke.mjs'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

const require = createRequire(import.meta.url)
const socket = createServer()
socket.listen(0, '127.0.0.1')
await once(socket, 'listening')
const address = socket.address()
assert.ok(address && typeof address !== 'string')
const port = address.port
await new Promise((resolve, reject) => socket.close((error) => (error ? reject(error) : resolve())))
const server = spawn(
  process.execPath,
  [
    require.resolve('next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: new URL('../', import.meta.url),
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
)
let output = ''
server.stdout.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-4000)
})
server.stderr.on('data', (chunk) => {
  output = (output + chunk.toString()).slice(-4000)
})
const origin = `http://127.0.0.1:${port}`
const exit = once(server, 'exit')
try {
  let ready = false
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error('Production server exited before readiness')
    try {
      const probe = await fetch(origin, { signal: AbortSignal.timeout(1000) })
      if (probe.ok) {
        ready = true
        break
      }
    } catch {
      /* Startup is bounded below; an unavailable server is not a pass. */
    }
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  assert.ok(ready, 'Production server must become ready')
  const home = await fetch(origin)
  assert.equal(home.status, 200)
  const html = await home.text()
  await verifyThemeBootstrap(html, origin, 'storefront')
  assert.match(html, /Appearance/)
  assert.match(html, /<option value="dark"/)
  assert.match(html, /Ready for your next game/)
  assert.match(html, /id="main-content"/)
  assert.equal(home.headers.get('x-powered-by'), null)
  const style = html.match(/href="([^" ]+\.css(?:\?[^" ]*)?)"/)
  assert.ok(style, 'Production HTML must reference built CSS')
  const css = await fetch(new URL(style[1].replaceAll('&amp;', '&'), origin))
  assert.equal(css.status, 200)
  const stylesheet = await css.text()
  assert.match(stylesheet, /100dvh/)

  verifyHeroUIStyles(stylesheet)
  assert.match(stylesheet, /color:var\(--muted\)/)
  console.log('SMOKE-01 Passed: public route, landmark and compiled Tailwind CSS')

  for (const identity of ['synthetic-a', 'synthetic-b']) {
    const account = await fetch(`${origin}/account`, {
      headers: { Cookie: `smoke_context=${identity}` },
    })
    assert.equal(account.status, 200)
    assert.match(account.headers.get('cache-control') ?? '', /private/)
    assert.match(account.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(account.headers.get('x-robots-tag'), 'noindex, nofollow')
    const body = await account.text()
    assert.match(body, /Checking your session/)
    assert.match(body, /name="robots" content="noindex, nofollow"/)
    assert.ok(!body.includes(identity), 'No request-cookie value may enter the scaffold output')
  }
  console.log(
    'SMOKE-02 Passed: private route no-store/noindex and no cookie echo across two contexts',
  )
  for (const path of [
    '/search',
    '/wishlist',
    '/cart',
    '/contact',
    '/support',
    '/policies/shipping',
    '/policies/cancellation',
    '/policies/returns-refunds',
    '/policies/privacy',
    '/policies/terms',
  ]) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200, path)
    const body = await response.text()
    assert.match(body, /This page is not available yet/)
    assert.match(body, /name="robots" content="noindex, nofollow"/)
    assert.equal((body.match(/<main\b/g) ?? []).length, 1)
    assert.match(body, /Support and policies/)
  }
  for (const path of ['/products', '/products/not-a-product', '/categories/cricket']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.match(body, /Catalog temporarily unavailable/)
    assert.match(body, /name="robots" content="noindex, nofollow"/)
  }
  assert.match(html, /aria-label="Mobile navigation"/)
  assert.match(html, /aria-expanded="false"/)
  console.log(
    'SMOKE-04 Passed: honest noindex destinations and unavailable catalog, consistent shell and closed mobile navigation',
  )
  for (const path of [
    '/not-a-route',
    '/%28public%29',
    '/%28private%29',
    '/%28store%29',
    '/%28shop%29',
    '/%28information%29',
    '/%28auth%29',
    '/policies/not-a-policy',
    '/%28account%29',
    '/account/not-a-route',
  ]) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 404)
    const missing = await response.text()
    assert.match(missing, /Page not found/)
    assert.match(missing, /Support and policies/)
  }
  console.log('SMOKE-03 Passed: unknown routes and internal route-group names return 404')
} catch (error) {
  console.error(output)
  throw error
} finally {
  if (server.exitCode === null) server.kill('SIGTERM')
  await exit
}

await verifyCatalogRendering(require.resolve('next/dist/bin/next'))
