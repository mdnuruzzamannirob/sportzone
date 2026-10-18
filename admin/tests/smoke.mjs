import { verifyFontAssets } from '../../tests/font-assets.mjs'
import assert from 'node:assert/strict'
import { preview } from 'vite'

// Preview verifies built assets and local SPA fallback; it is not production hosting.
const server = await preview({ root: new URL('../', import.meta.url).pathname, preview: { host: '127.0.0.1', port: 0, strictPort: true } })
try {
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const origin = `http://127.0.0.1:${address.port}`
  let index = ''
  for (const path of ['/', '/login', '/app', '/app/orders/synthetic-order', '/unknown-path']) {
    const response = await fetch(origin + path)
    assert.equal(response.status, 200, `SPA document must load at ${path}`)
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
    const html = await response.text()
    assert.match(html, /<div id="root"><\/div>/)
    assert.match(html, /name="robots" content="noindex, nofollow"/)
    if (index) assert.equal(html, index, 'Deep links must receive the same SPA entry document')
    index = html
  }
  console.log('ADMIN-SMOKE-01 Passed: entry/deep-link SPA fallback and no-store/noindex headers')
  const js = index.match(/src="([^" ]+\.js)"/)
  const css = index.match(/href="([^" ]+\.css)"/)
  assert.ok(js && css, 'Built entry must reference compiled JS and CSS')
  for (const asset of [js[1], css[1]]) {
    const response = await fetch(origin + asset)
    assert.equal(response.status, 200)
    const body = await response.text()
    assert.ok(body.length > 0)
    if (asset.endsWith('.css')) {
      assert.match(body, /100dvh/)
      await verifyFontAssets(body, origin)
      assert.match(body, /color:var\(--text-muted\)/)
      assert.ok(body.includes('--link-text:') && body.includes('--on-brand:'), 'Shared light/dark tokens must reach built CSS')
    }
  }
  console.log('ADMIN-SMOKE-02 Passed: compiled JavaScript and Tailwind CSS served')
} finally {
  await server.close()
}
