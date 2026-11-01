# P08-007 / P08-008 — Local multi-source planning and refund transport

## 1 November 2026 — correction advisory follow-up (P08-006 / P08-007)

Payments now provides a private, transaction-scoped snapshot of correction balances for a verified
collection linked to the exact order and payment. Refunds uses it to produce a deterministic,
nonbinding multi-source correction plan, separately from merchandise quantities. Duplicate and
foreign sources fail, and source/order held and completed counters constrain the plan. Nothing
reserves capacity or creates an obligation or payout; the caller still needs authorization and a
future mutation must re-read and atomically fence current balances. Both P08-006 and P08-007 remain
Blocked on their accepted prerequisites, reservation/attempt work and independent acceptance.

On isolated MongoDB replica set, `cd backend && ../node_modules/.bin/vitest run --config
vitest.integration.config.ts checkout-quote.test.ts -t 'refund advisory local|correction advisory
local|multi-source refund local' --reporter=dot` passed 11 tests (226 skipped). `npm run test:unit
--workspace=backend -- refund-calculation.test.ts` passed 17 tests. Backend build, typecheck, lint,
boundaries and format checks passed. Initial typecheck found missing generated-schema TypeScript
fields in the test fixture and the first integration run correctly rejected a fixture update lacking
a revision guard; both were corrected and the affected checks rerun. No deployed/provider acceptance
or full checkout suite was run.

Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Prior P08-005/006 work was uncommitted at
turn start and subsequently appeared in commit `37e7826` during this work; it was preserved, and this
work did not create that commit. Status: **Blocked** for full task acceptance. The owner requested the
next batch and previously authorized safe local work on blocked dependencies. No provider, task,
policy, application stage or milestone acceptance is inferred.

| Task | Local subset | Remaining work and acceptance |
| --- | --- | --- |
| P08-007 | Nonbinding multi-source planning reads canonical claim/order/linked verified collection facts within one transaction; deterministically splits item ordinals and delivery across source capacities and checks the order cap | Accepted P08-006, atomic CAS reservations of source/order/unit/delivery balances, unique source-funded obligations, durable payout intents, concurrency/retry/rollback tests and independent acceptance |
| P08-008 | Isolated SSLCOMMERZ initiation transport validates bank/merchant references, integer-poisha amount and provider response; strips raw fields, makes one request, returns acceptance or uncertain, and refuses execution inside a database transaction | Accepted P08-007, durable reserved attempt and identity, authorized executor, merchant-qualified provider-backed sandbox evidence, independent acceptance and separately verified payout |

Multi-source output is a **snapshot advisory**, never a reservation or authorization to pay. Its
allocation order is stable by source ID, item ID and unit ordinal; no slice exceeds source availability,
unit remainder or order capacity. A real reservation must re-read, lock/guard and commit each slice,
all held balances, the obligation and durable attempt together as Database §12.5 requires. No refund
writer, payout executor, live/sandbox request or runtime activation was added. The transport caller
must provide the already-persisted merchant refund ID and original bank reference; the currently
unimplemented executor must prove those prerequisites before any network request.

Provider protocol was checked against [SSLCOMMERZ v4 Refund API](https://developer.sslcommerz.com/doc/v4/#refund-api)
on 31 October 2026. A `success` or `processing` initiation with a matching bank and provider refund
reference is recorded only as transport acceptance, never payout completion. Missing/mismatched or
unexpected responses and network failures stay uncertain. No request, secret, raw response or personal
data is logged or returned; the documented GET uses credentials in the provider URL, so deployment
logging must not capture it. Tests use synthetic credentials and a fake fetch implementation only.

References: FR-18/33, Architecture §§6/10.5, Database §§8/9/12.5, API §13.3 and Testing RFD-01–08/§15.5.
The Orders, Returns and Payments owning services provide bounded capabilities; Refunds never imports
their private models. SSLCOMMERZ provider code contains only protocol/transport and does not make a
business or persistence decision. No package, collection, migration or external financial operation
was added. Reconcile uncertain outcomes before any retry; never generate a replacement ID on timeout.

## Verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica set; local COD collections
with synthetic proof; synthetic provider responses and fetch. JSON files under ignored test-results
are local replaceable evidence, not real merchant or provider acceptance.

| Check | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- refund-calculation.test.ts sslcommerz.test.ts` | Passed: 92, including 100 capacity-split conservation scenarios, multi-source caps and synthetic gateway initiation |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'multi-source refund local\|refund advisory local\|refund transport local' --reporter=default --reporter=json --outputFile=../test-results/multisource-refund-local.json` | Passed: 10, 200 outside selection; real isolated source snapshots and transaction-boundary denial; no changes to balances or obligations |
| `npm run lint --workspace=backend` | Passed: 405 files |
| `npm run lint:boundaries` | Passed: 371 files, zero errors |
| `npm run format:check` | Passed: 570 files |
| `npm run test:contract --workspace=backend` | Passed: 111; four API artifacts unchanged |
| `npm run lint` | Passed: 737 files, 1482 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 87 Not Started, 14 Blocked, 2 Deferred; boxes consistent and diff whitespace clean |

The first multi-order integration fixture reused a synthetic globally unique COD reference and was
correctly rejected. A distinct reference fixed the fixture; the rerun passed. Earlier failures are
not counted as passes. No live/sandbox merchant call, real payout, production policy, atomic refund
reservation/concurrency, durable attempt write, browser, backend-stage or integrated-release test ran.
