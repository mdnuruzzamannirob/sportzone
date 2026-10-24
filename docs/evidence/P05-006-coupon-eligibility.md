# P05-006 — Coupon eligibility and usage rules

## Scope and revision

FR-09, Database §§2.3, 8.1–8.3 and API §14.3; Testing PRM-01/02.
Base revision: `4473b79e485a1fae25ec62c2540a9cc251ccf048`, plus this task's working-tree changes.
Verification date: 24 October 2026; Linux, Node.js 24.20.0/npm 11.19.0.
P05-005 is independently accepted. No frontend, merchant/provider or external credential is needed
for this internal policy work package.

## Delivered policy

`promotions/coupon.schema.ts` and `coupon.service.ts` own strict validation and read-only evaluation
over authoritative detached coupon/counter/accepted-order/hold records and priced selections:

- Normalize one bounded code case-insensitively; reject arrays, extra coupon terms nested in pricing,
  invalid fixed/percentage values, negative/fractional counters, invalid windows and unsupported actors.
  Start is inclusive, expiry exclusive. Current missing/mismatched/inactive/future/expired coupons fail
  with the documented static `409 COUPON_UNAVAILABLE`, without exposing raw code, usage or identity.
- Minimum applies only to eligible post-sale merchandise. Delivery and noneligible lines do not help
  reach it. Zero eligible merchandise is denied. Pricing reuses P05-005 exact arithmetic and allocation.
- Global capacity includes held plus redeemed usage, using BigInt comparisons. Limited-per-customer
  coupons require a customer user ID and a counter context bound to both that ID and coupon ID.
  Guests, including a purported matching checkout email, cannot supply a quota identity. Missing
  customer usage information fails closed; it is never silently assumed to mean zero. The persistence
  owner must establish a missing counter's absence before supplying an explicit zero snapshot.
- Accepted coupon identity/code cannot be switched on the same order. A live authoritative hold
  must match the accepted order/coupon, its customer/guest identity and exact 15-minute lifetime;
  future/malformed holds fail. While live, accepted prices, allocations and snapshotted terms survive
  master deactivation, price/value changes or full counters. Replay does not extend expiry or count
  its existing held capacity as a new reservation.
- At exact hold expiry, current activation/dates/minimum and global/customer capacity apply again.
  Expired held usage is not subtracted speculatively: the allocation owner must release it explicitly.
  Reacquisition must preserve accepted coupon identity/type/value and canonical monetary/item values.
  Compatible item reordering and a newer compatible master version are allowed; the original accepted
  snapshot remains historical. Changed price/quantity/scope/delivery/allocation produces STATE_CONFLICT,
  never silent repricing.

This evaluator is **not** an HTTP DTO, account authorization, catalog scope resolver or quota writer.
Its priced lines and couponEligible flags follow the existing P05-005 trusted internal boundary;
future API/checkout consumers must resolve approved product/category eligibility and load owned
records themselves. It does not certify a browser-supplied counter, identity or hold. No preview route,
coupon CRUD, coupon persistence/index rollout, new hold, redemption or release is enabled here.
P05-007 owns durable conditional capacity writes and concurrency/replay; P05-015 owns the exposed
coupon API. A successful read-only evaluation is not a reservation or final purchase authorization.

## Contracts and changes

Approved business arithmetic and data/API rules are unchanged. Added the already-documented
COUPON_UNAVAILABLE error definition and regenerated its OpenAPI error components. Business operation
counts remain 38 implemented/126 planned out of 164, and Postman environment values remain blank.
No new route, collection, dependency or configuration procedure was introduced. Source specifications
were retained; Tasks/Changelog record delivery and this evidence owns execution details.

## Verification

| Actual command / check | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/coupon.test.ts tests/unit/pricing.test.ts` | Corrected initial run Passed: 97 cases. Expanded final suite has 60 coupon and 40 pricing cases; all 100 passed in the later combined run below |
| `npm run test:unit --workspace=backend -- tests/unit/coupon.test.ts tests/unit/pricing.test.ts tests/unit/operations.test.ts` | Coupon 60/60 and pricing 40/40 Passed; operations had 14 loopback EPERM failures in the restricted sandbox (26 passed). This command is retained as Failed, not relabelled |
| `npm run test:unit --workspace=backend -- tests/unit/operations.test.ts` with approved loopback execution | Passed: all 40 operations cases. Together with the unchanged 100 policy/pricing cases, 140 distinct applicable unit cases have successful evidence; reruns are not added to counts |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon.test.ts tests/integration/pricing.test.ts` | Passed: 16 cases (6 coupon/catalog integration, 10 existing pricing/MongoDB). Actual replica-set catalog prices and caller transaction regression; coupon/counter/hold contexts are synthetic authoritative fixtures, not proof of deployed durable coupon persistence |
| `npm run api:generate --workspace=backend`; `npm run test:contract --workspace=backend` | Generated error components; 48 schema/router/negative/freshness cases Passed |
| `npm run typecheck --workspace=backend`; `npm run lint --workspace=backend`; `npm run build --workspace=backend` | Passed: final backend modules/tests/tooling compile and actual build succeeds; lint checks 180 files |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 194 format files and 222 boundary files; no private foreign models or shared-to-domain imports |
| `npm run lint`; `git diff --check`; task/checkbox audit | Passed: 466 files, 1,239 local links and zero errors; 209 task identities/counts/checkbox parity and all 71 accepted records preserved; diff whitespace check passed |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories |
| Full CI/backend closeout, browser/UI/frontend builds, hosted CI, HTTP smoke, live providers, durable quota races | Not Run: no HTTP/bootstrap/mutation path changed. Owning policy/catalog tests and affected error/contract consumers were selected under Testing §15.5. Durable coupon races belong to P05-007; application/provider gates remain separate |

Coupon tests cover normalization/one-code, both discount types, dates and exact boundaries, minimum
and excluded delivery, held+redeemed limits, large counters, guest/customer distinctions, missing or
foreign customer counters, live/expired/malformed/foreign holds, snapshot corruption, price/value/
identity/delivery/quantity/eligibility conflicts, compatible reorder/version and initial version zero.
Catalog integration proves current sale-price minima and unchanged accepted live-hold pricing after
real catalog edits. Neither evaluation nor replay writes coupon counters, holds, orders, stock or carts.

Initial fixtures exposed a required-versus-optional nested coupon-schema field and strict indexed
fixture typing. These were corrected; synthetic diagnostics were removed. Failed type/unit outputs
are retained separately from later successes. Sanitized logs and reports: `test-results/P05-006/`.

## Recovery and independent review

No database migration, external mutation, financial effect or publication occurred. Rollback is the
matching policy/error-definition/generated-artifact revision; accepted order/hold data is untouched.
Future callers must use authoritative scoped records and transactionally enforce capacities before
accepting a reservation; this read-only result alone must never authorize a financial state change.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-006 moved from
In Review to Done under AGENTS §13. Historical verification results and failed attempts above remain
unchanged. Durable coupon primitives, public/admin coupon APIs, checkout, client stages and
product/provider milestones retain their separate acceptance requirements.
