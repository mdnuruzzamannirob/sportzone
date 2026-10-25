# P05-002 — Authenticated persistent cart

## Scope and implementation

Verification date: 24 October 2026. Base revision `219fcfa`; Node.js 24.20.0/npm 11.19.0,
Linux, disposable MongoDB 8.0.16 replica sets. P01-024 and the identity/catalog prerequisites
are accepted. P04-003 remains externally Blocked. This independent backend work package does not
require media activation, admin/storefront screens or their builds/tests.

- `cart/` owns the strict canonical `carts` model, unique user index, MongoDB validator, service
  and three protected routes: GET `/cart`, PUT/DELETE `/cart/items/{variantId}`. Domain writes
  use the existing transaction-scoped customer-account capability, which rechecks active identity
  and fences mutations against session/principal changes. A body cannot choose the owning customer.
- Cart persistence contains only user ID, canonical unique variant selections, quantities, addedAt,
  revision and timestamps. GET on an absent cart returns an empty revision-zero view without writing.
  PUT sets an absolute quantity 1–50; carts contain at most 100 distinct variants. DELETE succeeds
  when the item is absent. Accepted writes advance durable revision; repeated PUT is not additive.
- Catalog owns the bounded `cartSelections` service capability. It reuses existing active variant,
  valid price/counter and category-ancestry visibility logic, through indexed variant IDs. It returns
  allowlisted ProductCard data for the selected SKU, not private models. Cart reads refresh current
  price/availability in the transaction snapshot; they never reserve stock, append inventory movements
  or persist price snapshots. An out-of-stock eligible line is retained and marked unavailable when
  requested quantity exceeds availability. Hidden/deleted selections retain removable IDs/quantities
  but expose null product/price; their value is excluded from estimated subtotal. Out-of-stock eligible
  values remain included in estimates. Totals use safe integer poisha and reject overflow.
- Root setup wires the router only when customer authentication is enabled, using existing
  storefront Origin/CORS/session-CSRF checks and fresh authentication in the service. No provider
  effect is introduced inside transactions. Guest carts, login merge, checkout totals and UI work
  remain their owning later tasks; `/cart/merge` is still planned under P05-014.
- `bootstrap-cart.mjs` is an explicit local/test-only, additive empty-collection bootstrap after build.
  It refuses incompatible existing validators and does not drop data/indexes. Requests fail closed
  until required persistence exists. Staging/production need reviewed provisioning; no remote rollout
  or private `.env` modification occurred.
- The executable registry and generated artifacts now contain 35 implemented business operations and
  129 separately planned operations out of 164 documented operations. Input/output schemas reuse the
  cart module; Postman environment additions remain blank. There is no frontend/backend shared runtime.

## Owning contracts and task-record correction

API §10.2 specifies quantities, unavailable projections, exact estimates and retry semantics;
Database §6.4 owns the bounded selection schema. Operations records actual bootstrap/failure behavior;
Testing SHP-01 adds backend assertions while retaining later merge/journey requirements.
No product scope, dependencies, payment method, external gate or accepted milestone was changed.

The preceding foundation evidence update had accidentally copied its evidence paragraph into twenty
unfinished task entries. Those entries were restored to their original evidence placeholders using the
pre-foundation revision; P01-024's accepted evidence and all accepted statuses/records are preserved.
This corrects false evidence attribution, not completion of those tasks.

## Verification

| Actual command / check | Result and scope |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/cart.test.ts` | Passed: 28 real HTTP/MongoDB cases: cross-session persistence, ownership, strict input, CSRF/Origin, customer/admin/suspended/revoked identity, safe price/stock projection, missing/hidden/deleted records, first-create/update/delete races, rollback, overflow, 100-line capacity, unique index/validator, incompatible bootstrap and preflight |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/cart.test.ts tests/integration/catalog.test.ts tests/integration/composition.test.ts` | Initial run: catalog 24/24 and composition 3/3 passed; cart 22/24 passed. Failed cart cases are retained and resolved by scoped reruns, not represented as an all-green pipeline |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/composition.test.ts` | Final 4/4 passed, including actual root customer activation, missing-cart bootstrap 503, initialized cart 200 and inactive route 404. Together with unchanged catalog 24 and final cart 28: 56 distinct applicable integration scenarios; reruns are not added to totals |
| `npm run test:unit --workspace=backend -- tests/unit/catalog.test.ts tests/unit/operations.test.ts` | Passed: 61 affected catalog and HTTP/error/operations unit cases |
| `npm run api:generate --workspace=backend`; `npm run test:contract --workspace=backend` | Generation passed; all four artifacts fresh; 45 schema/router/negative/freshness cases passed with blank environment values |
| `npm run lint --workspace=backend`; `npm run typecheck --workspace=backend` | Passed for final source and integration consumers; lint checked 166 files |
| `npm run build --workspace=backend`; `MONGOMS_DISTRO=ubuntu-24.04 npm run test:smoke --workspace=backend` | Passed: compiled startup, configuration redaction, isolated DB, liveness/restricted readiness, malformed compressed-body rejection and graceful drain |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 180 formatted files, 213 boundary files; existing generic negative ownership fixtures remain applicable |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories; no dependency change in this task |
| `npm run lint`; `git diff --check` | Documentation/link and whitespace checks passed; final task count/checkbox audit accompanies handoff |
| Full backend/full-project CI, frontend builds/browser/UI, hosted CI and live providers | Not Run: focused owning/consumer checks suffice under Testing §15.5; application-stage consolidated runs remain at closeout. No workflow or frontend runtime changed |

Sanitized local logs and reports are retained under `test-results/P05-002/`. The first cart failures
were a suspended-principal mutation expectation (existing CSRF protection rejects with 403) and a
real rollback defect: the new embedded line schema inherited a Mongoose version key that strict
rollback attempted to restore. Matching the repository's embedded `versionKey:false` convention
fixed rollback; overflow now returns 422 and leaves no new cart. An isolated synthetic diagnostic
identified this exception and was removed from source. Initial non-null lint warnings were also fixed.
No failed report was rewritten as passing; focused successful reruns establish the final result.

## Recovery and review

No external effects or data removal occurred. Roll out validator/index requirements additively before
using the routes. On rollback, retain cart records and their unique index; disable the owning customer
route composition if needed rather than dropping customer selections. Existing incompatible collection
options require reviewed migration; the bootstrap refuses to silently replace them.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-002 moved from
In Review to Done under AGENTS §13. Historical failed attempts and scoped reruns above remain recorded.
This acceptance does not approve cart merge, checkout, external credentials/policies, a client
application or a product milestone.
