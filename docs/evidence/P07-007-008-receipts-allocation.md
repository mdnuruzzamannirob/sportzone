# P07-007 / P07-008 — Durable receipts and live allocation commitment

Status: **Done** for each task, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: working tree based on `2b2301c` (accepted P07-006); owner requested these two tasks together,
fully verified, with Done status after review. Earlier P07-005 review remains separate.
Sources: FR-12/FR-13/FR-09; [API §§12.3–12.4](../API.md#123-ipn-browser-returns-and-independent-verification),
[Database §8.6](../DATABASE.md#86-providerreceiptintake-and-paymentcollections--verified-receipts),
[Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases), [Operations](../OPERATIONS.md).

## Independent task acceptance checklist

| Task | Delivered behavior | Observed assertions | Status |
| --- | --- | --- | --- |
| P07-007 | Merchant-scoped canonical receipt identity; guarded attempt proof; independent verification before transaction; durable intake/link/audit; no stale failure downgrade or repeat monetary effect | Concurrent duplicate/service-instance replay; distinct collections; Paid after failure; failure after Paid; simultaneous outcomes; immutable conflicts and repeat conflict audits; additional funds unassigned; refund projection retained | Done |
| P07-008 | Exact fully funded, eligible online order can commit only its current matching live stock/coupon generation in the same transaction | One stock/coupon commitment across concurrent duplicates; high-risk/expired capacity not committed; real coupon failure after stock processing rolls back receipt/payment/stock; recovery, competing expiry and composed IPN 200 only after durable effects | Done |

## Delivered implementation and boundaries

Payments owns `payment-processing.service.ts` and its private canonical receipt/attempt/initiation/payment
persistence. It invokes the existing independent verifier outside all transaction retries. Canonical unique
provider/merchant/bank collection identity deduplicates money; a new transaction records intake, rechecks
attempt/order/payment/merchant mapping, links a source collection, serializes payment projection, preserves
verified attempt proof, applies live allocation and appends audit facts. Unique-key races retry local durable
work up to three times without repeating provider calls or creating another charge. Driver transaction
retries remain bounded by the existing database helper. Pending/unavailable/failed processing stays retryable.

Checkout owns `verified-allocation.service.ts`, reusing Inventory/Promotions service capabilities, canonical
reservations, movement identity and coupon redemptions. It validates exact items/quantities, matching clocks,
current generation, live expiry and coupon presence. It never releases/reacquires a generation or decrements
physical stock. Real coupon failure aborts the whole transaction, including earlier stock changes and funding.
Orders exposes only internal inspect/finish capabilities and fences its canonical row; no foreign private
models are imported. Controllers contain no financial models or decisions; shared-to-business direction and
provider separation remain enforced by executable boundary checks. No package, schema/index migration,
collection or CI inventory change was introduced.

Audit's existing append-only capability gained explicit same-digest replay admission for this coordinator.
It verifies canonical persistence, preserves the first event/time, rejects a changed digest/actor/reason under
one identity, and relies on the canonical unique index plus outer transaction retry for concurrent admission.
Default writer semantics are unchanged for other consumers. This resolves repeated conflict notifications
without acknowledging an uncommitted transaction or overwriting the original financial proof.

Exact matched money funds only remaining merchandise entitlement; later distinct collections remain
unassigned. Original receipt cores are immutable. VALID → VALIDATED is not a second collection. Contradictory
core facts generate a replay-safe audit and retain the first proof/funding. Fresh independent risk evidence
can only escalate review. Stale terminal nonpayment updates only its attempt and never releases allocations,
reverses Paid or changes another active attempt. Later valid paid proof may supersede terminal nonpayment.
Existing refund projection is not reset to Paid by a new collection.

Unknown/forged mapping, partial/excess amount or cancelled-order funds remain durable unmatched/quarantined
intake without invented order allocation. Qualified supervised matching/correction is not implemented here.
Verified matched money stays Paid when risk or expired capacity prevents commitment. No late reacquisition
is added. Successful capacity commitment leaves the order pending/admin_review: API §12.4 retains separate
authorized confirmation/deadline/notification ownership. This work neither fabricates legal approval nor
ships/confirms an order; it proves once-only commitment so later fulfillment cannot allocate twice.

Root composition can construct the verified processor only through explicit local/test sandbox dependencies.
Server activation requires PAYMENT_PROCESSING_ENABLED=true, callback composition and valid sandbox adapter;
it defaults off and refuses staging/production. Existing IPN response stays 503 without a durable processor.
With the opt-in, 200 text OK follows committed durable processing only. No pending poll worker is implied.
The actual normal initiation Origin/CSRF/customer/guest protections remain covered by regression.

## Approved timestamp decision

The provider's timezone-free v4 tran_date has no approved timezone evidence in this repository. The owner
explicitly answered: “হ্যাঁ, evidence না আসা পর্যন্ত fail closed”. Implemented valid nonfuture timestamps
with explicit offset/Z only. Offset-free, invalid calendar/time or future timestamps keep processing retryable
and do not invent collectedAt, substitute arrival time or fabricate a receipt. Synthetic explicit-offset tests
do not qualify actual provider timestamp transport, merchant activation or retry SLA.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica sets, real transactions
and local HTTP/Supertest. Actual provider adapter uses injected synthetic transport; no external merchant call,
charge, refund or production database operation occurred.

| Command / selection | Observed result |
| --- | --- |
| Backend integration runner, `checkout-quote.test.ts` | Passed 78 tests at pre-final review revision: all 56 prior checks plus initial 22 receipt tests; local `test-results/payment-processing.json` |
| Same runner, `checkout-quote.test.ts -t 'receipt batch'` | Passed final 24 affected tests, 56 intentionally not selected; local `test-results/payment-processing-final.json` |
| Same runner, `payment-verification.test.ts payment-records.test.ts payment-callback.test.ts` | Passed 66 tests (32/15/19); local `test-results/payment-processing-consumers.json` |
| `npm run test:unit --workspace=backend -- payment-callback.test.ts sslcommerz.test.ts` | Passed 81 tests, including local opt-in/deployed refusal |
| `npm run test:contract --workspace=backend` | Passed 104 tests; four API artifacts verified |
| `npm run typecheck --workspace=backend` | Passed final runtime/test revision |
| `npm run build --workspace=backend` | Passed final runtime revision |
| `npm run lint --workspace=backend` | Passed, 335 files |
| `npm run lint:boundaries` | Passed, 320 files, zero errors |
| `npm run format:check` | Passed, 499 files |
| `npm run lint` | Repository documentation checks passed |
| `git diff --check` | Passed |

Dedicated report command, from backend:
`../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/<report>.json <selection>`.
Reports are generated local artifacts, not committed release evidence. Review corrected initial strict TypeScript
optional-property/literal inference and a lint optional-chain warning; no suppression was added. Review found
repeat-conflict audit admission and refund/risk projection edge cases, corrected them, and reran the affected
24-test matrix. The earlier owning 78-test regression and unchanged consumer checks were reused appropriately.

## Review, limitations and recovery

Executor reviewed owner paths/import direction, actual diff, deterministic receipt identity, immutable facts,
payment/order concurrency fences, no provider I/O in transactions, no raw card/credential persistence/logging,
atomic stock/coupon rollback, callback acknowledgment, default-off deployment and prior user edits. Project-owner review acceptance of each task is recorded below; no milestone/external gate is accepted.

Not Run: real provider sandbox/live qualification; provider timezone evidence; actual ACK/retry SLA; deployed
multi-instance/restore exercises; frontend UI; full backend stage/release regression. These local tests do not
accept P07-005, P07-009 late/cancelled correction, P07-010 full risk operations, P07-012 polling/recovery or
P07-013 supervised correction. Existing checkout reviews/legal sign-off remain separate. No production activation.

Rollback first disables PAYMENT_PROCESSING_ENABLED; callbacks remain retryable, preserving all committed
receipt/payment/audit/allocation history. Disabling processing cannot undo money or safely erase uncertain
outcomes. Use the owning recovery/reconciliation runbooks for any external effects. Existing additive bootstrap
provisions the canonical state; HTTP startup does not migrate data. No destructive rollback is authorized.


## Independent acceptance

On 29 October 2026, after the paired implementation, verification and executor-review handoff,
the project owner explicitly answered: “দুটোই গ্রহণ করছি—Done করুন”.

- **P07-007 accepted:** submitted merchant-scoped receipt deduplication, guarded attempt outcomes,
  durable financial replay/conflict handling and recorded verification. Status Done.
- **P07-008 accepted:** submitted atomic commitment of eligible live stock/coupon holds with verified
  funding, rollback/concurrency protections and recorded verification. Status Done.

Acceptance retains the documented local/test, explicit timestamp, confirmation and recovery limits.
It does not accept P07-005, late/cancelled correction, full risk/reconciliation operations, real merchant
qualification, deployed activation, legal approval or any milestone. No live financial action is authorized.
