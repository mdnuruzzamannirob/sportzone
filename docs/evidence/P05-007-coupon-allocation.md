# P05-007 — Durable coupon allocation primitives

## Scope and revision

FR-09; Database §§8.1–8.3 and Architecture §§6.1–6.2/7.3; Testing PRM-02/03/04.
Base revision: `c27e61f40fa87f094b26b2fbf4e42c536e25181d`, plus this task's changes.
Verification: 24 October 2026, Linux, Node.js 24.20.0/npm 11.19.0, disposable MongoDB 8.0.16
WiredTiger replica sets. P05-006 is independently accepted. No external account/credential or
frontend build is a prerequisite for these internal primitives.

## Delivered persistence and behavior

- `coupon.model.ts` owns the single canonical coupons, couponRedemptions and
  couponCustomerCounters models. Strict server validators and declared indexes enforce safe
  integer fields, valid date/type/value/capacity combinations, unique normalized codes, one
  order/coupon/generation, one active coupon generation per order, unique registered-customer
  quota keys, bounded/unique scope IDs and state-dependent hold/expiry/active-key fields.
  Optional product/category filters have a concrete 200-distinct-ID limit per list in Database §8.1.
- `coupon.persistence.ts` explicitly initializes missing collections/indexes additively and verifies
  exact compatible validators. Existing incompatible options require a reviewed migration;
  no validator replacement, syncIndexes/drop or automatic financial collection repair occurs.
- `coupon-allocation.service.ts` requires an active outer ClientSession and a **mandatory** owning
  order capability. The capability must authorize/fence durable order/payment/lifecycle state in
  that same session and return authoritative immutable coupon identity, accepted terms/prices,
  current validated prices/eligibility and customer identity. There is no default or permissive
  implementation. Every command, including replay, compares coupon ID to the bound order snapshot;
  a released active-key index cannot authorize switching the lifetime coupon identity.
- Reserve and accepted COD redemption conditionally consume global and, for registered customers,
  customer capacity. Held+redeemed usage is checked; absent customer counters are established
  transactionally under their unique key. Customer counters are maintained even before a customer
  maximum is configured, preserving prior usage for future policy evaluation. Guest-limited coupons
  are denied using the existing eligibility policy. Increments, ledger writes and order fence are
  one transaction; no countDocuments-based quota authority is used.
- Online reserve uses the caller's single trusted heldAt shared with inventory and expires exactly
  15 minutes later. Commit converts held to redeemed once; expired holds cannot commit. Eligible
  release decrements held or redeemed exactly once and clears the active key. The mandatory order
  gate must forbid redeemed release after dispatch and verify payment before hold commit.
  Current master deactivation/new guest limits do not invalidate an already accepted live hold.
- Replays use natural order/coupon/generation identity and conditional ledger status. They do not
  consume capacity twice, extend expiry, resurrect a released generation or turn a held generation
  into COD. A new generation requires explicit release and exact generation succession; current
  eligibility and accepted pricing compatibility are revalidated. Old-generation release replay
  cannot release another generation. lastOperationKey is a trace of the latest transition, not an
  extra HTTP idempotency receipt ledger; request-level idempotency remains with checkout.
- Guarded atomic update pipelines avoid negative-counter setter coercion and protect bounds and
  revisions. Commit/release compare-and-set the source state, and any error requires the outer caller
  to abort the transaction. No nested transaction or provider call is introduced.

## Integration boundaries and procedures

These are internal domain primitives, not exposed coupon/checkout APIs. The production orders module
is not yet implemented; tests supply an explicit durable test-only orders capability that fences its
own records and rejects unverified payment/dispatched release. This is not represented as production
order authorization or full checkout/payment acceptance. Future owning order/checkout work must supply
real lifecycle authorization, approved current coupon product/category scope resolution and commercial
snapshots; a browser cannot supply these trusted inputs. P05-015 owns coupon API wiring.

Inventory coordination is exercised with the actual inventory service/model, not counter doubles:
stock reservation rolls back when coupon capacity fails; successful holds share the exact expiry;
commit and eligible release update stock and coupon capacity together in one outer transaction.

Operations documents the actual local/test command after backend build:
`node --env-file=.env backend/scripts/bootstrap-promotions.mjs`.
It creates only the three owning collections and indexes, preserves data on compatible reruns and
refuses staging/production. Deployment migration/configuration approval remains separate. No runtime
route, startup activation, scheduled expiry worker, dependency or new public API operation was added.
The already-accepted API artifacts remain unchanged and fresh.

## Verification

| Actual command/check | Observed result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon-allocation.test.ts tests/integration/coupon.test.ts tests/integration/pricing.test.ts tests/integration/inventory-allocation.test.ts` | Passed: 57 cases (25 durable coupon, 6 coupon-policy/catalog, 10 pricing/catalog, 16 existing inventory allocation). Real transaction/conditional-write/concurrency/replay/rollback assertions on isolated replica sets |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon-allocation.test.ts -t 'explicit local/test bootstrap'` | Passed: one subsequently added bootstrap case, including two actual compiled bootstrap invocations preserving existing data and production-mode refusal. The 25 intentionally filtered cases are reused from the successful run above, not claimed as executed here |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon-allocation.test.ts -t 'enforces raw validators'` | Passed: updated raw-validator case; unique generation/active/customer keys, invalid expiry, negative/over-limit counters, percentage cap and scope bound tested. It is not added again to the distinct count |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/coupon-allocation.test.ts -t 'reconciles mixed\|customer CAS'` | Passed: two added cases reconcile mixed ledger/global/customer totals and prove a successful global increment/order fence rolls back when the customer CAS cannot advance. Other filtered cases reuse unchanged passing results |
| `npm run test:unit --workspace=backend -- tests/unit/coupon-allocation.test.ts tests/unit/coupon.test.ts tests/unit/pricing.test.ts` | Passed: 114 cases (14 new real-driver/session guard tests, 60 coupon rules, 40 exact pricing). Guard tests use real disconnected driver sessions and perform no network I/O |
| `npm run typecheck --workspace=backend`; `npm run lint --workspace=backend`; `npm run build --workspace=backend` | Passed; strict optional fields/session types and real compiled modules/bootstrap entry verified; lint checks 186 files |
| `npm run test:contract --workspace=backend` | Passed: 48 schema/router/negative/freshness cases; no new public route or artifact drift |
| `npm run format:backend`; `npm run lint:boundaries` | Passed: 200 format files and 225 boundary files; existing negative private-model/shared/provider boundaries apply |
| `npm run lint`; `git diff --check`; task/checkbox audit | Passed: 473 files, 1,244 local links and zero errors; 209 task identities/counts/checkbox parity and all 72 accepted records preserved; diff whitespace check passed |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories |
| Full backend/full-project CI, frontend/UI/browser, hosted CI, HTTP smoke, real provider/production order workflow | Not Run: no HTTP/runtime wiring changed; focused owning/consumer verification follows Testing §15.5. Production lifecycle, checkout/payment/provider and stage acceptance remain separate |

Final distinct applicable integration coverage: **60 cases**, including **28 durable-coupon cases**.
Cases cover global and customer final-slot races, separate customer capacity, guest restrictions,
same-generation reserve/release races, commit/release conflict, expiry and generation re-acquisition,
immutable lifetime coupon identity, changed accepted prices, mandatory order/payment gates,
post-dispatch denial, counter corruption, raw index/validator constraints, outer rollback, actual
inventory coordination and additive bootstrap. Skipped/filtered rerun cases and repeat successes
are not added to counts. Sanitized logs/reports are retained under `test-results/P05-007/`.

Initial integration: 8/15 passed and 7 failed because negative $inc operands were rejected by the
shared nonnegative Mongoose setter; bounded atomic pipelines fixed it. The corrected 15-case run,
expanded 21-case run and final affected-consumer run passed. Initial strict optional-date/type issues
and MongoDB-expression lint warnings were fixed without weakening validation, compiler settings or
lint rules. A failed local edit command left the old equivalent expression in place until corrected;
final validator tests establish the adopted expression. Failed outputs remain historical, not relabelled.

## Recovery and independent review

No existing data migration/deletion, external financial mutation, deployment or publication occurred.
Roll out compatible validators/indexes additively before integration. Preserve accepted redemptions,
counters and order history across source rollback/restore; reconcile against order/payment state.
Never use TTL deletion or a blind counter reset to release capacity. An incompatible validator or
corrupted counter causes failure and reviewed recovery, not automatic destructive repair.

On 24 October 2026, the project owner independently accepted the submitted implementation and
verification through the review popup: “Review করেছি—accept করছি, Done করো”. P05-007 moved from
In Review to Done under AGENTS §13. Historical verification results, failed attempts and limitations
above remain unchanged. Checkout/order production wiring, coupon APIs, expiry scheduling, client
stages and product/provider milestones retain their separate acceptance requirements.
