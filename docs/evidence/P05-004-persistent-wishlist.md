# P05-004 — Authenticated persistent wishlist

## Scope and revision

FR-08 backend implementation under API §10.2, Database §6.5 and Architecture's cart-module
ownership. Base revision: `9a9450e07cb1ba896234b912ede612837dd88285`; verification date:
24 October 2026. Linux, Node.js 24.20.0/npm 11.19.0, isolated MongoDB 8.0.16 replica sets.
P03-013, P04-002 and P01-024 are accepted prerequisites. No frontend/provider prerequisite is
claimed; this task does not accept a client journey, cart merge, checkout or product milestone.

## Delivered behavior and ownership

- The existing `cart/` module owns distinct wishlist model/schema/persistence/service/routes files.
  `wishlists` contains userId, at most 200 unique productIds and timestamps. MongoDB enforces the
  strict field/type/length/uniqueness validator and unique user index. No product, price or stock
  snapshot is duplicated into wishlist storage.
- GET `/wishlist` returns the authenticated customer's products and does not create an empty
  record. PUT `/wishlist/products/{productId}` adds a previously unsaved eligible product once;
  repeated PUT returns saved:true without another entry, including an already saved unavailable
  product. DELETE returns saved:false whether the list/item exists or not and creates no empty list.
- Customer sessions, Origin/session CSRF, strict empty mutation bodies and empty queries protect
  HTTP access. Account ownership is derived from verified credentials; the service rechecks it
  inside the existing account transaction/fence capability. Concurrent first creation, same-product
  saves, distinct additions and remove/save races serialize without duplicate lists or entries.
- Catalog owns `wishlistProducts`, a bounded indexed ID query reusing active variant, category
  ancestry, valid price/counter and approved media projection logic. GET preserves saved order
  and re-fetches safe public ProductCard data. Eligible zero-stock products may be saved and show
  unavailable stock. Hidden/inactive/deleted saved products expose only `{id,availability:unavailable}`;
  hidden names/slugs/prices/media are not published. These markers are removable identities, not
  purchasable cards. New unknown/ineligible saves and additions over capacity return 422.
- No wishlist operation reserves stock, creates inventory movements, changes cart lines or supplies
  checkout authority. Adding to cart still requires current variant validation through the cart API.
- Root setup activates the router only with customer auth. Missing/incompatible validators or indexes
  fail requests closed with 503. The existing explicit local/test shopping bootstrap now initializes
  carts and wishlists additively; it never overwrites incompatible validators or drops records/indexes.
  HTTP startup remains free of automatic collection/index creation. Staging/production require their
  reviewed rollout; no private config, external database or deployment was modified here.
- Generated OpenAPI/Postman now have 38 implemented business operations and 126 non-executable
  planned operations out of the same 164 documented operations. Payload schemas come from the
  module, and all Postman environment values remain blank. No package/dependency was added.

## Documentation

API §10.2 owns exact membership, capacity, retry and unavailable-marker response semantics.
Database §6.5 records the 200-item bound/order; Operations updates the actual bootstrap procedure;
Testing SHP-02 records ownership/race/persistence assertions. Tasks and Changelog link this evidence.
Accepted documentation baselines and unrelated task evidence were not editorially reopened.

## Observed verification

| Actual command | Result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/wishlist.test.ts tests/integration/cart.test.ts tests/integration/catalog.test.ts` | Passed: 79 cases (27 initial wishlist, 28 cart, 24 catalog). Actual HTTP and transaction-capable MongoDB persistence; catalog includes a 1,000-product query profile |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/wishlist.test.ts` | Final expanded suite Passed: 29 cases, including competing final-slot additions and rollback after an actual inserted write. Earlier 27 cases are not counted again |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/composition.test.ts` | Passed: 5 cases, including real activation/inactive-route behavior, missing-persistence 503, initialized wishlist 200 and actual additive compiled shopping bootstrap |
| `npm run api:generate --workspace=backend`; `npm run test:contract --workspace=backend` | Four artifacts generated and fresh; 48 contract cases Passed, including schema, negative parity, actual router inventory and sanitized templates |
| `npm run test:unit --workspace=backend -- tests/unit/catalog.test.ts tests/unit/operations.test.ts` | Passed: 61 focused catalog and HTTP/operations consumer cases |
| `npm run lint --workspace=backend`; `npm run typecheck --workspace=backend` | Passed: final backend source/test/tooling consumers; lint checks 172 files |
| `npm run build --workspace=backend`; `MONGOMS_DISTRO=ubuntu-24.04 npm run test:smoke --workspace=backend` | Passed: compiled isolated-DB startup, redacted invalid config, liveness/restricted readiness, malformed compressed-body rejection and graceful shutdown |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 186 format files and 218 boundary files; existing generic ownership negative fixtures remain applicable |
| `npm run lint`; `git diff --check` | Passed: 456 files, 1,229 local links and zero errors; 209 task IDs/counts, checkbox parity and all 69 accepted statuses preserved; diff whitespace check passed |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories; sanitized report retained locally |
| Full backend/full-project CI; hosted CI; UI/browser/frontend builds; live providers/deployment | Not Run: focused owning and affected-consumer checks follow Testing §15.5; consolidated owning-app regression belongs to backend closeout. No CI workflow, frontend or provider behavior changed |

Final distinct integration coverage is **86 scenarios**: wishlist 29, cart 28, catalog 24 and composition 5.
Wishlist cases cover cross-session persistence, cross-customer isolation, guest/admin/suspended/revoked
denial, service authorization independent of HTTP guards, bad CSRF/Origin/body/query/IDs, repeated
removal, live price refresh, hidden/deleted markers, zero stock/cart effects, race/capacity/rollback,
raw database validator/index checks and refusal of incompatible bootstrap. No skipped case or provider
mock is counted as real-service acceptance. Sanitized logs/reports are retained at `test-results/P05-004/`.

## Rollout, recovery and independent review

Provision matching validator/index requirements additively before using wishlist routes. Existing
incompatible data/options require a reviewed migration. Preserve saved identities and the unique index
on rollback; disable the owning route composition if needed rather than dropping customer selections.
No migration of existing data, destructive cleanup, publication, payment or external mutation occurred.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-004 moved from
In Review to Done under AGENTS §13. Verification evidence above remains unchanged. External
credentials, policies, media activation, staging and application/product milestones retain their
existing acceptance gates.
