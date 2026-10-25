import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { once } from 'node:events'

export async function verifyCatalogRendering(nextBin, inspect) {
  let revision = 1,
    hidden = false
  const requests = []
  const card = () => ({
    id: '535a00000000000000000001',
    slug: 'synthetic-ball',
    name: `Synthetic Ball ${revision}`,
    regularPricePoisha: 20000,
    effectivePricePoisha: revision === 1 ? 15000 : 12000,
    availability: revision === 1 ? 'available' : 'unavailable',
  })
  const category = { id: '535a00000000000000000002', slug: 'cricket', name: 'Cricket' }
  const api = createServer((req, res) => {
    requests.push({
      path: req.url,
      cookie: req.headers.cookie,
      authorization: req.headers.authorization,
    })
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Cache-Control', 'no-store')
    const path = new URL(req.url, 'http://localhost').pathname
    if (path === '/api/v1/products') {
      res.end(
        JSON.stringify({
          data: hidden ? [] : [card()],
          meta: {
            requestId: 'synthetic',
            page: 1,
            pageSize: 20,
            totalItems: hidden ? 0 : 1,
            totalPages: hidden ? 0 : 1,
          },
        }),
      )
    } else if (!hidden && path === '/api/v1/products/synthetic-ball') {
      res.end(
        JSON.stringify({
          data: {
            ...card(),
            description: `Synthetic description ${revision}`,
            categories: [category],
            images: [],
            variants: [
              {
                id: '535a00000000000000000003',
                sku: 'BALL',
                attributes: {},
                regularPricePoisha: 20000,
                effectivePricePoisha: card().effectivePricePoisha,
                availableQty: revision === 1 ? 2 : 0,
              },
            ],
            relatedProducts: [],
          },
          meta: { requestId: 'synthetic' },
        }),
      )
    } else if (!hidden && path === '/api/v1/categories/cricket') {
      res.end(JSON.stringify({ data: category, meta: { requestId: 'synthetic' } }))
    } else {
      res.statusCode = 404
      res.end(JSON.stringify({ error: { code: 'NOT_FOUND' } }))
    }
  })
  api.listen(0, '127.0.0.1')
  await once(api, 'listening')
  const apiAddress = api.address()
  assert.ok(apiAddress && typeof apiAddress !== 'string')
  const reservation = createServer()
  reservation.listen(0, '127.0.0.1')
  await once(reservation, 'listening')
  const address = reservation.address()
  assert.ok(address && typeof address !== 'string')
  const port = address.port
  await new Promise((resolve, reject) =>
    reservation.close((error) => (error ? reject(error) : resolve())),
  )
  const origin = `http://127.0.0.1:${port}`
  const child = spawn(
    process.execPath,
    [nextBin, 'start', '--hostname', '127.0.0.1', '--port', String(port)],
    {
      cwd: new URL('../', import.meta.url),
      env: {
        ...process.env,
        NEXT_TELEMETRY_DISABLED: '1',
        API_PUBLIC_ORIGIN: `http://127.0.0.1:${apiAddress.port}`,
        STOREFRONT_ORIGIN: origin,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  )
  const exited = once(child, 'exit')
  let output = ''
  child.stdout.on('data', (chunk) => {
    output = (output + chunk).slice(-4000)
  })
  child.stderr.on('data', (chunk) => {
    output = (output + chunk).slice(-4000)
  })
  const headers = {
    'User-Agent': 'Googlebot',
    Cookie: 'sz_customer_sid=synthetic-private-cookie',
    Authorization: 'Bearer synthetic-private-proof',
    Host: 'untrusted.example.test',
  }
  async function page(path) {
    const response = await fetch(origin + path, { headers, signal: AbortSignal.timeout(10000) })
    assert.match(response.headers.get('cache-control') ?? '', /no-store/)
    return { response, html: await response.text() }
  }
  try {
    let ready = false
    for (let attempt = 0; attempt < 100; attempt++) {
      if (child.exitCode !== null) throw new Error('Catalog production server exited')
      try {
        if ((await fetch(origin, { signal: AbortSignal.timeout(1000) })).ok) {
          ready = true
          break
        }
      } catch {
        /* bounded startup probe */
      }
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    assert.ok(ready, 'Catalog production server must start')
    const first = await page('/products/synthetic-ball')
    assert.equal(first.response.status, 200)
    assert.match(first.html, /<title>Synthetic Ball 1 \| SportZone<\/title>/)
    assert.ok(first.html.includes(`rel="canonical" href="${origin}/products/synthetic-ball"`))
    assert.ok(!first.html.includes('untrusted.example.test'))
    assert.match(first.html, /Prices and availability can change/)
    assert.ok(
      !first.html.includes('synthetic-private-cookie') &&
        !first.html.includes('synthetic-private-proof'),
    )
    const otherContext = await fetch(origin + '/products/synthetic-ball', {
      headers: { ...headers, Cookie: 'sz_customer_sid=second-private-context' },
      signal: AbortSignal.timeout(10000),
    })
    assert.match(otherContext.headers.get('cache-control') ?? '', /no-store/)
    const otherHtml = await otherContext.text()
    assert.match(otherHtml, /<title>Synthetic Ball 1 \| SportZone<\/title>/)
    assert.ok(!otherHtml.includes('second-private-context'))
    const script = first.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)
    assert.ok(script)
    assert.equal(JSON.parse(script[1]).offers.lowPrice, '150.00')
    const listing = await page('/products')
    assert.match(listing.html, /Synthetic Ball 1/)
    const filtered = await page('/products?q=ball')
    assert.match(filtered.html, /name="robots" content="noindex, follow"/)
    const categoryPage = await page('/categories/cricket')
    assert.match(categoryPage.html, /<title>Cricket \| SportZone<\/title>/)
    assert.equal((categoryPage.html.match(/<h1\b/g) ?? []).length, 1)
    revision = 2
    const edited = await page('/products/synthetic-ball')
    assert.match(edited.html, /<title>Synthetic Ball 2 \| SportZone<\/title>/)
    assert.match(edited.html, /Synthetic description 2/)
    assert.match(edited.html, /Out of stock/)
    const editedScript = edited.html.match(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/,
    )
    assert.ok(editedScript)
    assert.equal(JSON.parse(editedScript[1]).offers.lowPrice, '120.00')
    assert.equal(JSON.parse(editedScript[1]).offers.availability, 'https://schema.org/OutOfStock')
    assert.match((await page('/products')).html, /Synthetic Ball 2/)
    if (inspect) await inspect(origin)
    hidden = true
    const removed = await page('/products/synthetic-ball')
    assert.equal(removed.response.status, 404)
    assert.match(removed.html, /noindex/)
    assert.equal((await page('/categories/cricket')).response.status, 404)
    assert.match((await page('/products')).html, /No products found/)
    assert.ok(requests.length > 0)
    assert.ok(
      requests.every((req) => !req.cookie && !req.authorization),
      'Private request credentials must never reach public API reads',
    )
    assert.ok(
      requests.every((req) => /^\/api\/v1\/(products|categories)/.test(req.path)),
      'Only public catalog API resources may be fetched',
    )
    console.log(
      'CATALOG-SMOKE Passed: real Next SSR/metadata/canonical/JSON-LD, next-request updates/deactivation and cookie isolation',
    )
  } catch (error) {
    console.error(output)
    throw error
  } finally {
    if (child.exitCode === null) child.kill('SIGTERM')
    await exited
    api.closeAllConnections()
    await new Promise((resolve, reject) =>
      api.close((error) => (error ? reject(error) : resolve())),
    )
  }
}
