# P04-009 — Public catalog listing and search

**Date:** 23 October 2026 · **Implementer:** Codex · **Status:** Done
**Baseline:** `bd00577` · **Sources:** FR-04; API §§6.2, 8, 10.1; Database §§6, 11; Testing CAT-03.

## Delivered scope

Public `/api/v1/products`, `/api/v1/categories` and `/api/v1/categories/{slug}` are wired through
backend root composition. Product detail, homepage merchandising, frontend rendering, admin inventory
UI and caching/revalidation remain their owning tasks. No identity, money, stock or order mutation
route was added. The starting working tree was clean; no changes were staged or committed by this agent.

Catalog reads are owned by `modules/catalog/catalog.service.ts`, with HTTP adaptation in
`catalog.routes.ts` and existing `catalog.schema.ts` extended for read validation. Existing numeric
money/text aggregate validators remain intact. Category registration now reuses its canonical cached
model, matching the other domain model factories. No new package, framework or shared abstraction.

- Only active products with valid active SKUs and fully visible associated categories are discovered.
  Active ancestry is checked through bounded graph lookups. Missing parents, cycles, inactive ancestors
  and paths that do not reach a root within 64 ancestors fail visibility closed. Hidden secondary
  classification also excludes a product. Category slug filters include visible descendants.
- Product cards select the cheapest valid active SKU's effective price and its matching regular price.
  Price bounds apply to that card price. Stock filtering tests whether any valid active SKU has positive
  physical − reserved − committed; internal counters and variant/pricing metadata are never projected.
  Out-of-stock products can remain visible; products without a valid active SKU cannot.
- Search accepts bounded literal Unicode words, including Bengali, with all extracted words required.
  User text never becomes a regex or database query operator. Query fields, booleans, safe integer
  poisha, sort keys, page bounds, duplicate parameters and inverted ranges are validated strictly.
- Newest sorts by createdAt/ID descending; price sorts use amount ascending/descending and ID ascending.
  Default pages contain 20 rows, maximum 100, with filtered count metadata from the same aggregation.
  Unknown/hidden category filters return empty pages; hidden category details return 404.
- Cards/categories are explicit public allowlists. Ratings come only from a valid approved aggregate.
  The media-owned `public-media.service.ts` batches publication checks for the returned page, requiring
  a clean, attached public asset with a matching target reference and declared media indexes. It derives
  URLs from the composed provider's public URL function, never from stored URLs. Private, unapproved,
  cross-target, unavailable or unsafe generated media are omitted. No private signing or provider
  network call is made by this read boundary. No provider means no published image.
- Public reads retain no-store and set no session cookies. Exact configured origins receive credentialed
  read CORS; unauthorized origins, origin-less preflight and unauthorized preflight headers fail.
  Mutations are unregistered. All catalog aggregations use a 3,000 ms DB deadline and no disk spilling;
  missing declared indexes produce a sanitized 503 without HTTP bootstrap/repair.

## Index decision and measured profile

The existing MongoDB platform is sufficient for the bounded native word-search slice. Additive indexes:

| Index | Definition / purpose |
| --- | --- |
| `product_public_search` | status equality prefix + native name/keywords text, language none, weights name 5 / keywords 2 |
| `product_public_newest` | status, createdAt descending, ID descending |
| `category_public_sort` | status, sortOrder ascending, ID ascending |

The final isolated MongoDB 8.0.16 fixture contains 1,000 products/variants, 900 active products,
ten selective name matches, two active categories and a five-row search response. Observed:

| Access path | Observed documents / keys examined |
| --- | --- |
| Selective native text | 10 documents / 10 keys; declared text index |
| Newest 20-row access path | 20 documents; declared newest index |
| Category access path | 2 documents; declared category index |

The **actual HTTP search and category aggregation pipelines** were captured and explained too; both
use their declared indexes. Local artifact: `test-results/catalog-query-profile.json`.
It is generated, ignored execution output, not a committed or hosted CI artifact. The executable
regression thresholds are search <50 documents, newest ≤20 for the fixture, indexed real aggregations,
bounded page sizes and the DB deadline. This synthetic access-path profile is not signed PERF-CAT
latency, concurrency, realistic-media or production performance acceptance. Price sorting and
eligibility/count joins can still process all matching active rows; there is no fabricated indexed
price-order claim or large-catalog SLA.

## Verification

Environment: local Node/npm workspace; isolated MongoDB 8.0.16 replica sets; synthetic records and media
URL function. No real provider, deployed account or external DB was accessed.

| Command | Observed result |
| --- | --- |
| `npm exec --workspace=backend -- vitest run tests/unit/catalog.test.ts tests/unit/products.test.ts` | Passed: 24 tests (19 catalog validation/projection + 5 aggregate regressions) |
| `npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/catalog.test.ts tests/integration/products.test.ts tests/integration/categories.test.ts` | Passed: 37 tests (15 public catalog + 14 product + 8 category) |
| `npm run lint --workspace=backend` | Passed: 148 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed: compiled startup, configuration redaction, real DB readiness/liveness and shutdown after root routing changed |
| `npm run lint:boundaries` | Passed: 199 source files |
| `npm run format:check` | Passed: adopted application/tooling scope |
| `npm run lint` | Passed: repository/documentation links |
| `git diff --check` | Passed |

Focused integration assertions cover active ancestry, orphan/cycle/depth guards, descendant filtering,
hidden secondary categories, valid/disabled SKUs, price/stock combinations, reserved versus committed
availability, invalid stored numeric stock, stable pagination, strict query/body validation, literal
English/Bengali search, rating projection, public media reference/URL protection, missing indexes,
CORS/HEAD/preflight and real root composition with identity activation disabled. Canonical product/
category transactional regressions remain green. No frontend changed, so browser/visual checks are Not Run.

Initial type errors and an invalid image-bearing aggregate test fixture were corrected without
weakening the aggregate's media gate. A model reuse issue prevented interception of the actual category
pipeline; canonical caching fixed it and final affected suites passed. An isolated selected profile run
also passed (one selected test, fourteen not selected), but it is not added to the 37-test count. The final compiled-artifact smoke rerun initially
never started because automatic permission review timed out; the permitted single retry passed.

Local logs: `/tmp/p04-009-unit-final.log`, `/tmp/p04-009-integration-final.log`,
`/tmp/p04-009-types-final.log`, `/tmp/p04-009-lint-final.log`, `/tmp/p04-009-build.log`,
`/tmp/p04-009-smoke-final.log`, `/tmp/p04-009-boundaries.log`, `/tmp/p04-009-format.log`,
`/tmp/p04-009-docs.log`. These are temporary local evidence, not durable hosted reports.

Not Run: full monorepo/backend CI, unchanged tooling suites, browser journeys, public product detail,
cache invalidation, real Cloudinary/staging media activation and production workload acceptance.
The phase remains open; its consolidated regression is still required at closeout.

## Documentation, rollout and limitations

API owns the clarified query/DTO semantics, Database the selected indexes, Testing the profile procedure,
and Operations explicit additive rollout. Product bootstrap adds declared indexes without changing
existing validators or dropping extras. The category declared-index helper adds its public index.
HTTP does not create collections/indexes. A conflicting existing text index requires reviewed migration
because MongoDB allows one text index per collection; never drop it automatically. Rollback preserves
catalog/media records and indexes, and uses compatible complete backend artifacts.

Image delivery is intentionally omitted unless an approved provider and eligible ledger references are
composed. EXT-04 remains blocked; these local reads do not establish real scanning/upload/delivery
acceptance. P04-007 admin UI, P04-010 product detail, P04-011 caching and M2 remain separate gates.
No production rollout was executed.

## Independent review

On 23 October 2026, the project owner independently reviewed and accepted P04-009 through the
popup: “Review করেছি—accept করছি, Done করো”. Status: In Review → Done under AGENTS §13.
Acceptance covers public catalog discovery and recorded verification. Product details, storefront/cache
integration, EXT-04 and milestone acceptance remain separate.
