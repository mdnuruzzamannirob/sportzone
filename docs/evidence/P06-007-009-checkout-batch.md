# P06-007 / P06-008 / P06-009 — Combined checkout feature batch

**Date:** 27 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** All three tasks In Review; independent acceptance pending for each
**Revision:** Working tree against `151b27eeb03854e68e816b378a56ab4bae82b371` at final inspection.
No commit/reset/cleanup was performed. Concurrent import/formatting edits were preserved; an adopted
backend formatter mismatch in transaction.ts was normalized without changing its behavior.

## Authorization and task boundaries

The owner requested combined task execution to reduce turnaround. This batch stays within the Backend
stage and reuses the accepted inventory/coupon/quote/order foundations and P06-006 intent implementation.
P06-006 remains independently In Review; combined execution does not self-approve its dependency or a
milestone. Sources: FR-09/11/12/13, Architecture §§6,8,10, Database §§7–8/10.1/12–13,
API §§11.1/15 and Testing §10/15.5.

| Task | Delivered behavior | Independent acceptance checks | Status |
| --- | --- | --- | --- |
| P06-007 | Transaction-bound stock/coupon coordinator for initial COD commitment, online hold, guarded hold commit and held/committed release; exact shared generation clocks and deterministic operation identities | Last-SKU/final-coupon races; atomic rollback; duplicate movement/counter prevention; guarded release/commit and new generation | In Review |
| P06-008 | Explicitly activated COD HTTP submission; immutable Pending order, committed stock/coupon, zero-funds Pending payment and one order_received intent in one transaction | Real Origin/CSRF/session/current-commerce flow; 201 creation/200 replay; concurrent same-key effect set; registered/guest ownership; no fabricated collection/confirmation; failure rollback | In Review |
| P06-009 | Private online order/payment/notification creation and 15-minute stock/coupon hold foundation; no provider request or online HTTP activation | Every SKU/coupon shares heldAt/expiresAt; replay cannot extend clocks; released generation stays historical; next generation gets a fresh 15 minutes | In Review |

P06-003 remains Blocked for qualified compliance evidence. Test rules are synthetic; neither local
implementation nor a configuration flag supplies legal approval or merchant activation. Required
bKash/Nagad/Rocket initial-release acceptance is unchanged.

## Implementation and ownership

- Checkout owns the coordinator, completion composition and submission DTO/HTTP adaptation. It delegates
  stock changes to inventory, coupon accounting to promotions, immutable orders/current projections to
  orders, payment persistence to payments and notification intents to notifications. Private models stay
  with their owner. Inventory now assembles its existing stock capability internally; checkout imports
  no catalog counter capability. Executable boundary checks pass without weakening rules.
- Existing intent execution now exposes a separate result/replay envelope for HTTP status selection;
  existing internal submit consumers still receive the order projection. Matching keys resolve before
  quote expiry/current commercial reads; no client price, principal, financial state or allocation
  authority is accepted. Public response contains OrderSummary only, without contacts or provider secrets.
- New POST /api/v1/checkout/orders is COD-only behind CHECKOUT_COD_ENABLED=true, quote activation and
  customer-auth prerequisites. Default composition omits the route. Exact storefront CORS, durable
  checkout admission limits, Origin/CSRF, opaque customer/context scope and strict body/query/key
  validation reuse the established boundaries. Invalid customer cookies cannot downgrade to guest.
- Quote revalidation, intent, consumed consent, order/item balances, stock/coupon allocation, Pending
  payment, audit and order_received intent share one authorization transaction. Missing readiness or
  late notification failure aborts all effects. No provider/email/media call happens in the transaction.
- Orders fences initial allocation against current Pending, unconfirmed, undispatched, uncancelled state,
  selected method and generation 1. Later commits/releases require a separately supplied owning
  order/payment/cancellation decision in the same transaction. The default production capability refuses
  those actions; synthetic tests of later lifecycle accounting do not authorize real payouts/cancellation.
- Inventory/coupon generation history and movements remain authoritative, with a single server hold
  clock shared across every line and coupon. Stable operation keys prevent duplicate effects. Replaying
  an old generation never revives it or extends its expiry. Later reacquisition uses a fresh generation.
- Canonical payments contains all documented zero-funds aggregate fields, immutable expected total/method/
  currency, unique order identity and strict integer/cap/split validators. Creation is Pending even for
  COD; there is no Paid writer, collection receipt, payment attempt or gateway integration. A raw Paid
  update without funded/verified totals is rejected; real source-receipt verification remains Phase 07.
- Notifications gains an additive order_received/order-received-v1 contract: required order reference,
  optional account reference and empty payload. Account/proof event user/challenge requirements remain
  intact. Explicit migration accepts only exact known predecessors, retains existing delivery evidence
  and never silently repairs unknown schema drift. Registration/proof workers do not claim order events.
- Compiled local/test bootstrap provisions declared checkout/payment/allocation/coupon/audit persistence
  and explicitly migrates known notification validators. It seeds no catalog, policy, coverage or store
  settings, refuses production/staging and preserves existing history on repeated execution.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets with transactions.

| Command | Result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/checkout-quote.test.ts tests/unit/checkout-intent.test.ts tests/unit/orders.test.ts tests/unit/notifications.test.ts` | Passed: 43 tests / 4 files |
| `npm run test:integration --workspace=backend -- tests/integration/checkout-quote.test.ts tests/integration/notifications.test.ts tests/integration/inventory-allocation.test.ts tests/integration/coupon-allocation.test.ts tests/integration/orders.test.ts tests/integration/checkout-intent.test.ts tests/integration/email-change.test.ts` | Passed: 153 tests / 7 files |
| `npm run test:integration --workspace=backend -- tests/integration/recovery.test.ts` | Passed: 28 tests / 1 additional file |
| `npm run test:contract --workspace=backend` | Passed: 93 tests and 4 generated artifacts current |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before final compiled bootstrap checks |
| `npm run lint --workspace=backend` | Passed: 288 files |
| `npm run lint:boundaries` | Passed: 290 files, zero errors |
| `npm run format:check` | Passed: 452 files |
| `npm run test:smoke --workspace=backend` | Passed with local process/listener permissions: real DB startup, liveness/restricted readiness, invalid configuration redaction, graceful shutdown |
| `npm run test:security` | Passed: secret scan/no findings and dependency audit zero vulnerabilities |
| `npm run lint` / `git diff --check` | Passed: repository links/structure and whitespace |

There are 181 distinct passing integration cases across the two final regression runs. The main
checkout suite now has 33 cases, including 12 new combined checkout assertions. Notification migration
adds one case; COD configuration adds one unit case. Current executable inventory is 80 implemented /
84 planned of the unchanged 164 operations. Generated OpenAPI explicitly includes 201 creation and
200 replay with the same summary shape; Postman values remain blank.

[Latest generated MongoDB report](../../test-results/database.json) currently contains the separate
28-case recovery run, replacing the previous 153-case report. Counts/commands above record observed
outputs from both runs. [Security report](../../test-results/security.json) is also a generated local
artifact and may be replaced by later execution.

Initial checks exposed a private stock-capability import outside inventory, an action type-name
collision, optional proof-notification identity typing, and missing fixture transaction imports. These
were corrected; affected checks passed afterward. Initial checkout integration was 28 Passed / 2
Failed because the last two fixtures lacked inTransaction import, then the suite passed and was
expanded to the final 33 cases. Formatting mismatches were normalized and format:check rerun.
The sandboxed smoke attempt returned empty child-process diagnostics; rerunning with local process/
listener permissions passed. No failed attempt is represented as a passing result.

Not Run: full backend-stage/integrated release regression, frontend/browser journeys, live merchant/
provider channels, production provisioning or actual external email delivery. These are outside this
backend batch; change-based verification and affected notification consumers were selected explicitly.

## Operational limits and recovery

Default flags are off. Provision prerequisites and obtain qualified policy/operational acceptance before
deployment activation; no staging/production bootstrap or external business mutation was performed.
Disabling COD activation stops new submissions but never deletes intents, consumed quotes, orders,
movements, payments or notifications. Preserve compatible notification validators while new event rows
exist; do not blindly downgrade validators or erase financial/audit evidence during application rollback.

Queued order_received events await P06-016 commerce template/worker dispatch; no inbox delivery or
order_confirmation is claimed. Online provider initiation is Phase 07 and automatic hold expiry is
P06-010. The private online creation path must not be exposed before those integrations are accepted.
Expiry/payment/cancellation production authorities remain their own tasks; synthetic transition
fixtures prove accounting/retry behavior only. Missing/uncertain outcomes require durable investigation,
not a new key, a new order, or blind financial retry.

Each task is In Review pending independent acceptance. No task, milestone or external gate is
self-approved by this combined batch.

## Combined review verification — 30 October 2026

Re-reviewed current implementation at `df3b602` for the pending P06-006/007/008/009/010/015 and
P07-005 acceptance. Dependencies implemented in later accepted payment tasks are now present;
original revision-specific limitations above remain historical, not current integration claims.
No runtime mutation, dependency change, external provider call or secret read was needed.

| Current command | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed before compiled-entry integration tests |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed: 332 files, zero errors |
| `npm run test:unit --workspace=backend -- checkout-intent.test.ts checkout-quote.test.ts inventory-allocation.test.ts coupon-allocation.test.ts guest-access.test.ts payment-callback.test.ts delivery-deadline.test.ts media.test.ts container-health.test.ts` | Passed: 96 tests across nine files |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/pending-review-closeout.json checkout-intent.test.ts checkout-quote.test.ts inventory-allocation.test.ts coupon-allocation.test.ts guest-access.test.ts payment-callback.test.ts delivery-deadline.test.ts media.test.ts` | Passed: 242 tests across eight files |

Environment: local Node/npm, isolated transaction-capable MongoDB replica sets, controlled gateway/
email/media doubles and local HTTP/compiled child-process fixtures. The ignored JSON report is local
execution output. Integration counts: checkout 124, guest 19, intent 14, coupon 28, callbacks 19,
media 19, inventory 16, deadline 3. Relevant cases cover concurrent same-key replay and allocation,
COD Pending/no fabricated collection, immutable shared online holds, expiry/payment races and fencing,
single-use scoped guest proof, browser/IPN isolation, actual receipt-processing integration, migration
and compiled entries. Existing valid contract/lint/format results from the preceding unchanged-code
batch are reused under Testing §15.5; frontend/full-release checks were not rerun.

Independent acceptance of each pending task is still required. Live provider/email, qualified
compliance and staging evidence remain separate; this regression does not clear blocked tasks.

## Independent acceptance — 30 October 2026

Current status: **Done** for P06-007, P06-008, P06-009. The project owner independently accepted
the submitted current implementation and review evidence: “সাতটিই গ্রহণ করছি—Done করুন”.
Earlier In Review statements describe their historical revision.

- **P06-007: Done** — individually included in the explicit seven-task acceptance.
- **P06-008: Done** — individually included in the explicit seven-task acceptance.
- **P06-009: Done** — individually included in the explicit seven-task acceptance.

Acceptance covers recorded local technical behavior and verification, including the current combined
96-unit/242-integration review. It does not approve external provider/email qualification, legal
applicability, staging deployment or milestones.
