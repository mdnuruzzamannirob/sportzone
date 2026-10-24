# P05-005 — Catalog pricing and coupon allocation

## Scope and revision

FR-09 backend arithmetic under Architecture §7.3 and Database §2.3/§8.1; fixtures
FX-MONEY-01/02 and PRM-01 in Testing. Current base: `3876233e2bfb47f753637d0b37238b792ddffed8`,
with this task's additions; accepted wishlist work was committed during this work period and preserved.
Verification date: 24 October 2026. Linux, Node.js 24.20.0/npm 11.19.0, MongoDB 8.0.16
isolated transaction-capable replica set. P04-002 and P01-024 are accepted prerequisites.

## Delivered capability

- `promotions/pricing.schema.ts` validates trusted internal selections, stable embedded order-item
  ObjectIds, unique variant IDs, 1–40 lines, quantities 1–50, safe nonnegative integer money and one
  optional typed coupon. Fixed coupons use positive poisha; percentage terms use 1–10,000 basis points.
- `promotions/pricing.service.ts` owns the calculation and catalog integration. `createPricingService`
  consumes the catalog-owned selected-SKU capability rather than importing private models. Its quote
  request accepts IDs/quantities and server-approved eligibility/terms/delivery inputs, never supplied
  regular/sale price overrides or final totals. It refreshes authoritative base/sale prices and rejects
  missing/ineligible selections instead of silently pricing only part of a request.
- `calculatePricing` uses BigInt for products, sums, percentage round-half-up, exact rational remainders
  and reconciliation. Sale prices apply before coupon math. Delivery and noneligible lines are excluded
  from coupon scope; fixed discounts are capped at eligible merchandise. Largest remainders receive
  the remaining poisha, ties resolved by ascending stable order-item ObjectId, independent of input order.
- Output contains safe integer regular/sale subtotals, product/coupon discounts, eligible subtotal,
  delivery/final total and per-line allocation/net values. Every serialized amount is range-checked;
  overflowing intermediate output fields or final totals fail rather than round. Zero eligible subtotal
  with a coupon fails; no-coupon/zero-sale lines remain supported. Exact integer checks reconcile line
  allocations and final merchandise-plus-delivery totals. Inputs are not mutated and no BigInt leaks
  into the returned JSON-compatible object.
- The service accepts the caller's existing ClientSession for catalog reads and never starts a nested
  transaction. It writes no stock, coupon hold/redemption, cart, order or checkout record. An out-of-stock
  product can be priced; this is not stock allocation or checkout authorization.

This is an **internal arithmetic capability**, not an exposed buyer quote endpoint or a guarantee of
coupon eligibility. Callers must supply server-owned stable line IDs and policy-approved eligibility/
coupon/delivery values. P05-006 owns dates, activation, scope and usage eligibility; P05-007 owns quota
holds/redemptions; checkout owns immutable persistence and purchase validation. This task does not add
refund entitlement processing, decimal gateway parsing, an HTTP route, a collection or a provider effect.
The approved arithmetic/API/data contracts did not change, so specifications and generated artifacts
were retained rather than rewritten to report implementation progress.

## Verification

| Actual command | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/pricing.test.ts` | Final Passed: 40 cases; canonical 51 and 67+33 examples, stable ties, sale-before-coupon, excluded lines/delivery, fixed/full cap, zero/fractional threshold, safe boundary, very large exact products, overflow and strict negative payloads |
| Same unit suite's deterministic workload case | 200 bounded workloads, each compared with reversed input order; allocation sum, nonnegative/capped line values, proportional error under one poisha and line-net-plus-delivery reconciliation checked. Workloads are not inflated into separate test counts |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/pricing.test.ts` | Passed: 10 real MongoDB cases; authoritative sale/base prices, live price refresh with earlier returned values retained, inactive/missing/hidden rejection, supplied-money denial, no stock/hold/cart/order effects, multi-SKU allocation and caller transaction rollback |
| `npm run typecheck --workspace=backend`; `npm run lint --workspace=backend`; `npm run build --workspace=backend` | Passed: final modules and consumers compile; lint checks 176 files; actual deployable backend build includes promotions modules |
| `npm run test:contract --workspace=backend` | Passed: 48 existing schema/router/negative/freshness cases; four generated HTTP artifacts unchanged and fresh |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 190 formatted files and 220 boundary files; no private persistence import or shared-to-business dependency introduced |
| `npm run lint`; `git diff --check`; task/checkbox audit | Passed: 461 files, 1,234 local links, zero errors; 209 task IDs/counts and checkbox parity, all 70 accepted task records preserved; diff whitespace check passed |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories |
| Full backend/full-project CI, browser/UI/frontend builds, hosted CI, real provider, compiled HTTP smoke | Not Run: no runtime HTTP/bootstrap behavior or deployment changed; focused arithmetic/catalog integration, compilation and unchanged HTTP contracts cover this internal capability under Testing §15.5. Existing product/provider/application closeouts remain separate |

Initial type checking rejected `toSorted` under the repository's TypeScript target; sorting a newly
filtered allocation array fixed compatibility without changing targets or inputs. The first unit run
had two incorrectly shaped table fixtures for zero eligible subtotal. Fixture rows/destructuring were
corrected; successful final output is retained separately from failed attempts. No production mutation
or financial state-transition test was enabled by those failed attempts.

Backend format check also found two pre-existing whitespace-only mismatches in the shopping bootstrap
and wishlist routes. They were formatted without behavioral changes. No unrelated source change,
accepted task status or existing user/staged content was replaced. Sanitized logs/reports are retained
under `test-results/P05-005/`.

## Recovery and review

No database migration, configuration/dependency change, external mutation or publication occurred.
This read-only capability can be rolled back as source/build output; no persisted financial snapshot
or provider effect exists to reverse. Future consumers must persist immutable pricing and allocations
through their owning checkout/order service rather than recalculate accepted history from live prices.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-005 moved from
In Review to Done under AGENTS §13. Historical verification results and failed attempts above remain
unchanged. P05-006/P05-007, checkout, external gates, client stages and product milestones retain
their separate acceptance requirements.
