# P04-010 — Product details and variant availability API

**Date:** 23 October 2026 · **Implementer:** Codex · **Status:** Done
**Baseline:** `acbe510` · **Sources:** FR-05/FR-06; API §§6.2, 10.1; Database §§6.1–6.3; Testing CAT-06.

## Implementation

`GET /api/v1/products/{slug}` is registered in the existing catalog router and root composition.
The working tree was clean at entry. No files were staged or committed by this agent.

The existing catalog service/schema/routes own the change. Private query helpers now reuse the
accepted category ancestry, valid active SKU predicates and card projection across listing, detail
and related cards; there is no parallel visibility/pricing authority or extra forwarding file.

Detail returns plain description, visible assigned categories, ordered approved images, active SKU
rows with canonical attributes, regular/effective integer-poisha prices and derived `availableQty`.
A no-options product returns its actual default SKU with `{}` attributes. Active rows with zero
available stock remain visible with quantity 0; inactive rows are excluded. No Cartesian attribute
combinations are invented. Canonical signature mismatch fails closed, and internal physical/reserved/
committed counters, revisions and persistence fields are excluded by strict public DTOs.

The gallery supports up to twelve configured images. Media's existing publication reader now groups
results by target **and asset**, preserving multiple images for the same product without cross-target
mixing. It still requires clean attached public ledger references, declared indexes and an explicitly
composed provider's safe public URL function. Stored URLs, private signing and unapproved assets never
become fallback delivery. Thumbnail uses the first approved gallery image. Missing media capability
returns an empty gallery, preserving EXT-04 rather than claiming real-provider readiness.

Related products are at most six other eligible cards sharing an assigned category, newest first with
descending ID tie-break. Self, drafts, inactive-only SKUs, hidden secondary categories and unrelated
products are excluded; no unrelated fallback is fabricated. Existing stock/price/card semantics and
approved rating projection are retained.

Missing, hidden or inactive-only detail returns 404. Invalid slugs, query fields and GET bodies are
rejected. Existing exact-origin read CORS, HEAD/preflight, no-store and cookie-free public behavior are
preserved. Queries reuse durable slug/category/variant indexes, have a 3,000 ms DB deadline and disable
disk spilling. Detail bounds are 100 actual active variants, 30 assigned categories and 12 images;
unexpected persisted over-bound data fails closed. No schema/index migration, provider network call,
new package, stock mutation or cart/checkout endpoint was added.

## Verification

Environment: local Node/npm workspace and isolated MongoDB 8.0.16 replica sets with synthetic catalog,
ledger records and a synthetic public URL function. Real provider/staging acceptance is not implied.

| Command | Observed result |
| --- | --- |
| `npm exec --workspace=backend -- vitest run tests/unit/catalog.test.ts tests/unit/products.test.ts` | Passed: 26 tests (21 catalog schema/projection + 5 aggregate regressions) |
| `npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/catalog.test.ts tests/integration/products.test.ts tests/integration/categories.test.ts` | Passed: 46 tests (24 public catalog/detail + 14 product + 8 category) |
| `npm run lint --workspace=backend` | Passed: 148 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed: 199 source files |
| `npm run format:check` | Passed: 303 files |
| `npm run lint` | Passed: repository/documentation/link checks |
| `git diff --check` | Passed |

Integration covers default SKUs, actual option pairs, unavailable quantities, matching sale/list prices,
private-field exclusion, active/ancestor visibility, disabled-only products, ordered multi-image
publication, omitted/unsafe/cross-target media, related limits/order/exclusions, malformed detail reads,
CORS/preflight/HEAD, real root composition, missing indexes, corrupt signatures/descriptions and the
actual detail aggregation's durable slug index. Accepted listing/category/search-profile and model
transaction regressions also pass after shared helper/media-result changes.

Initial test-import/tuple typing and a media-result destructuring type error were corrected without
casts or suppressions; final focused checks above passed. Early failures are not counted as passing.

Local logs: `/tmp/p04-010-unit-final.log`, `/tmp/p04-010-integration-final.log`,
`/tmp/p04-010-types-final.log`, `/tmp/p04-010-lint-final.log`, `/tmp/p04-010-build.log`,
`/tmp/p04-010-boundaries.log`, `/tmp/p04-010-format.log`, `/tmp/p04-010-docs.log`.
They are temporary local artifacts, not durable hosted CI reports. The accepted catalog query-profile
fixture also reran; this task adds no new search strategy or production performance claim.

Not Run: full backend/monorepo CI, unchanged tooling suites, compiled startup smoke (bootstrap/config
unchanged; real root-composed HTTP detail is covered), frontend/browser/visual suites, cart/checkout
purchase workflows, real Cloudinary/scanner/staging checks and production rollout. Full regression
remains due at phase closeout under Testing §15.5.

## Contracts and limits

API owns detail/gallery/variant/related DTOs and semantics; Testing adds CAT-06 and this evidence link.
Task status/acceptance and concise change history stay in TASKS/Changelog. Architecture, database,
operations and design contracts need no change: ownership, persistence, rollout and UI behavior remain
as approved. Code rollback uses the previous complete backend artifact and preserves catalog/media
records and indexes; no data rollback is required by this read-only change.

`availableQty` is a display snapshot, not purchase authorization. A consuming UI must disable zero
quantity combinations; cart and checkout must revalidate active product/SKU, quantity and live stock
in their own tasks. No cart/order/stock mutation is accepted here. Review content and return-policy
publication remain their owning endpoints; no review or return promise was fabricated. Frontend detail
selection/rendering remains P04-014, caching/SEO P04-011. EXT-04 and M2 remain separate external/gate
acceptances; empty media without approved runtime configuration does not waive them.

## Independent review

On 23 October 2026, the project owner independently reviewed and accepted P04-010 through the
popup: “Review করেছি—accept করছি, Done করো”. Status: In Review → Done under AGENTS §13.
Acceptance covers the product detail API and recorded verification. Frontend selection/cart/checkout,
EXT-04 and milestone acceptance remain separate.
