import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import PrivateLayout from '../src/app/(account)/account/layout'
import PublicLayout from '../src/app/(shop)/layout'

describe('storefront layout accessibility boundaries', () => {
  it('SF-01: public content has one main landmark, a working skip target and home link', () => {
    const html = renderToStaticMarkup(
      <PublicLayout>
        <h1>Test content</h1>
      </PublicLayout>,
    )
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toContain('href="#main-content"')
    expect(html).toContain('id="main-content"')
    expect(html).toContain('tabindex="-1"')
    expect(html).toContain('href="/"')
    expect(html).toContain('<h1>Test content</h1>')
  })

  it('SF-02: private content renders in a separate main landmark without public navigation', () => {
    const html = renderToStaticMarkup(
      <PrivateLayout>
        <h1>Private placeholder</h1>
      </PrivateLayout>,
    )
    expect(html.match(/<main\b/g)).toHaveLength(1)
    expect(html).toContain('<h1>Private placeholder</h1>')
    expect(html).not.toMatch(/<header\b|<footer\b/)
  })
})
