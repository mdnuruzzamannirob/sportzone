import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'

export async function verifyFontAssets(css, origin) {
  const folder = new URL('../styles/fonts/', import.meta.url)
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
  const expected = new Set(
    readdirSync(folder)
      .filter((file) => file.endsWith('.woff2'))
      .map((file) => hash(readFileSync(new URL(file, folder)))),
  )
  const urls = [
    ...new Set(
      [...css.matchAll(/url\(["']?([^\s)"']+\.woff2)["']?\)/g)].map(
        (m) => m[1],
      ),
    ),
  ]
  assert.equal(urls.length, 3, 'All three subsetted fonts must be emitted')
  for (const path of urls) {
    const url = new URL(path, origin)
    assert.equal(url.origin, origin, 'Fonts must be self-hosted')
    const response = await fetch(url)
    assert.equal(response.status, 200)
    const bytes = Buffer.from(await response.arrayBuffer())
    assert.equal(bytes.subarray(0, 4).toString(), 'wOF2')
    assert.ok(
      expected.delete(hash(bytes)),
      'Served font must match a unique licensed source asset',
    )
  }
  assert.equal(expected.size, 0)
}
