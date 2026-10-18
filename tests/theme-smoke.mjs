import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export async function verifyThemeBootstrap(html, origin, app) {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i)?.[1]
  assert.ok(head, 'Document must have a head')
  const script = head.match(/<script\b[^>]*src="\/theme-bootstrap\.js"[^>]*>/)?.[0]
  assert.ok(script, 'Theme bootstrap must be in the head before body content')
  assert.doesNotMatch(script, /(?:\basync\b|\bdefer\b|\btype="module")/, 'Bootstrap must remain a blocking classic script')
  const response = await fetch(`${origin}/theme-bootstrap.js`)
  assert.equal(response.status, 200)
  const source = await response.text()
  assert.equal(source, readFileSync(new URL(`../${app}/public/theme-bootstrap.js`, import.meta.url), 'utf8'))
  assert.ok(source.includes('sportzone.theme'))
  assert.doesNotMatch(source, /document\.write|innerHTML|fetch\(/)
}
