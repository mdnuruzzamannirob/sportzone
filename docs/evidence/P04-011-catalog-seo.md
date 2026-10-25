# P04-011 — Request-time catalog freshness and SEO

**Date:** 23 October 2026 · **Implementer:** Codex · **Status:** Done
**Sources:** FR-04/FR-05; Architecture §5.1; Testing CAT-07.

## Scope and implementation

The entry tree contained owner-staged accepted P04-010 against `acbe510`; that work was preserved.
During execution it became the externally created HEAD `9ace53d`. This agent did not stage or commit
files. P04-010 is now an explicit dependency because detail metadata consumes that accepted API.

The initial revalidation policy is **fresh server rendering on every request**. `/products`,
`/products/{slug}` and `/categories/{slug}` are force-dynamic, and the owning catalog server reader
uses public GET/no-store/omit-credentials requests. React cache deduplicates within a render only;
there is no shared data or full-route cache to invalidate after an upstream edit. The next navigation,
reload or Refresh catalog requests current content. This is not ISR, a purge endpoint or live push.
Any future shared cache must integrate verified write-linked invalidation before activation.

Feature-owned files under `storefront/src/features/catalog/` provide strict public response schemas,
server transport, SEO helpers, basic read-only SSR views and pending refresh control. Route files only
compose these views/metadata. No backend runtime import, new dependency, collection, mutation route,
secret, tag-purge hook or generic transport abstraction was added. The server reader has only fixed
product/category methods, validates slug/filter inputs and never accepts caller headers/options.
A transitive browser-barrel negative fixture enforces the `.server.ts` boundary.

Runtime API_PUBLIC_ORIGIN controls public server reads; STOREFRONT_ORIGIN controls canonical URLs.
Both must be explicit exact origins, HTTPS except loopback local configuration. Request Host never
controls canonicals. Missing API configuration produces an honest unavailable/noindex state; missing
site origin omits canonical/structured URLs and disables indexing. Browser identity still uses its
separate existing NEXT_PUBLIC_API_ORIGIN build configuration.

Public resource metadata uses actual API names/descriptions. Filtered collections and failures are
noindex. Product JSON-LD uses actual public prices, availability and approved rating/image data; no
rating, fulfillment or return promise is invented. Integer-poisha-to-decimal formatting preserves the
safe-integer boundary. Structured text escapes HTML-breaking characters. Stock/price disclaimers
state that checkout revalidates current values; this slice supplies no purchase action.

The views are a working **SSR/SEO foundation**, not acceptance of full catalog UI: grid/filter drawer,
URL-state interactions, complete gallery/variant controls and cart/wishlist remain P04-013/P04-014.
Category and product slugs are descriptive public URLs; category content has one main heading.
Native HeroUI boundaries, typography, appearance controls and app-owned links remain intact.

## Streaming and confirmed missing resources

Production checks initially found that the `(shop)/loading.tsx` group fallback flushed HTTP 200 before
an async missing-resource check. Confirmed absence now calls notFound during metadata resolution;
metadata is resolved before streaming, and the group-wide early loading forwarding file was removed.
The reusable loading component remains, and Refresh catalog has local pending feedback. The final
real Next server returns HTTP 404/noindex for removed product/category resources. Future loading
boundaries must follow existence validation rather than silently reintroducing this status regression.

This follows the installed Next 16.4.2 behavior and its bundled documentation. Primary references:
[fetch no-store](https://nextjs.org/docs/app/api-reference/functions/fetch),
[metadata](https://nextjs.org/docs/app/api-reference/functions/generate-metadata), and
[not-found streaming status](https://nextjs.org/docs/app/api-reference/file-conventions/not-found).
No framework default was assumed to establish cache safety; production behavior was exercised.

## Verification

Environment: local installed Node/npm/Next 16.4.2, production webpack build, isolated local HTTP API
fixture and ephemeral Next listeners. No deployed service or real administrator mutation was used.

| Command/check | Observed result |
| --- | --- |
| `npm exec --workspace=storefront -- vitest run tests/catalog.test.tsx tests/layouts.test.tsx tests/shell.test.tsx` | Passed: 21 focused tests (13 catalog, 2 layout, 6 shell) |
| `node --test --test-isolation=none --test-name-pattern=CATALOG-SERVER-01 tests/tooling/development.test.mjs` | Passed: 1 selected boundary fixture; no full tooling-suite claim |
| `npm run typecheck --workspace=storefront` | Passed: actual Next route generation and TypeScript checks |
| `npm run lint --workspace=storefront` | Passed |
| `npm run build --workspace=storefront` | Passed: products/category slug routes shown as dynamic |
| `npm run test:smoke --workspace=storefront` | Passed: existing foundation/private tests plus production catalog rendering/privacy/freshness fixture |
| `npm run lint:boundaries` | Passed: adopted source graph |
| `npm run format:check` | Passed: adopted source/tooling scope |
| `npm run lint` | Passed: repository/docs/link checks |
| `git diff --check` | Passed |

The permanent `storefront/tests/catalog-smoke.mjs` fixture is called by the existing required smoke
command, so no new script/CI inventory entry or passing placeholder is needed. It proves actual Next
HTML, title, canonical, JSON-LD decimal price/stock cues, no-store headers, two private-cookie contexts,
Host spoof resistance, query noindex, category heading, edited next-request content and metadata,
deactivation 404/noindex and empty listing. All upstream requests are checked for absence of cookie/
Authorization and for public catalog paths only. The backend contract is represented by a synthetic
HTTP fixture; this is not real admin CRUD or deployment acceptance. Existing private-page smoke
checks still prove no-store/noindex and no cookie echo across two contexts.

A separate isolated Chromium run reused that production fixture's inspection callback. At 360px and
1280px in both light/dark themes, it checked the rendered product, keyboard activation of Refresh,
visible focus, horizontal reflow and axe WCAG 2/2.1/2.2 AA tags. All four cases had zero axe violations
and no overflow; listing/category were additionally checked for one heading and reflow. Executor
visually inspected all four screenshots. This is implementation visual review, not owner or release
visual acceptance. Firefox/WebKit were Not Run for this focused slice.

Local ignored artifacts: `test-results/catalog-seo/product-360-light.png`, `product-360-dark.png`,
`product-1280-light.png`, `product-1280-dark.png`, and `test-results/catalog-seo/visual-checks.json`.
The visual command used Node with Playwright Chromium/AxeBuilder through
`verifyCatalogRendering(nextBin, inspect)`; no external browser requests were allowed by the callback.

Logs: `/tmp/p04-011-unit.log`, `/tmp/p04-011-boundary-test.log`, `/tmp/p04-011-types.log`,
`/tmp/p04-011-lint.log`, `/tmp/p04-011-build.log`, `/tmp/p04-011-smoke.log`,
`/tmp/p04-011-visual.log`, `/tmp/p04-011-boundaries.log`, `/tmp/p04-011-format.log`,
`/tmp/p04-011-docs.log`. These are temporary local artifacts, not durable hosted reports.

The initial sandbox build could not parse its restricted TypeScript subprocess output; the same
build passed with required process permission. Chromium also required local process permission.
The early streaming-status failure was corrected and affected build/smoke checks rerun. Failed
attempts are not represented as passing evidence.

Not Run: full project/phase CI, unchanged backend/admin suites, real admin update journeys, real
provider/staging configuration and release/performance acceptance. Full regression remains required
at phase closeout. Actual deployment/CRUD gates and EXT-04 remain separate.

## Documentation and rollback

Architecture §5.1 owns freshness, URL and loading/status policy; Operations owns exact runtime origins,
deployment checks and compatible artifact rollback; README/.env.example point to that setup.
Testing adds CAT-07 and this evidence. TASKS/Changelog own status/history. No API/database/design-policy
change or schema rollback is required; reverting a complete storefront artifact preserves all backend
catalog, media, identity and financial records. Runtime origin changes require the matching server
configuration; public browser identity origin changes still require the existing asset rebuild.

## Independent review

On 23 October 2026, the owner independently reviewed the implementation and verification evidence
and accepted the review popup: “Review করেছি—accept করছি, Done করো”. P04-011 moved from In Review
to Done under AGENTS §13. Full storefront UI, real admin-write/deployment journeys, EXT-04 and
milestone acceptance remain separate as described above.
