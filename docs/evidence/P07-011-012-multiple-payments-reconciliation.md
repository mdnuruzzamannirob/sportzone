# P07-011 / P07-012 — Multiple paid sources and durable reconciliation

Status: **Done** for each task; project-owner acceptance recorded below.
Executor: Codex, 29 October 2026. Revision: working tree based on
`1e52ea960f972347db04e7c615f20d16fe253f32` (accepted P07-009/010).
The owner requested paired full implementation and Done after review; acceptance remains separate per task.
Sources: FR-12/FR-18/FR-29;
[API §§12.3–12.4](../API.md#123-ipn-browser-returns-and-independent-verification),
[Database §8.7](../DATABASE.md#87-payment-accounting-and-receipt-allocation),
[Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases),
[Operations §8](../OPERATIONS.md#8-background-jobs--scheduled-tasks).

## Separate task acceptance checklist

| Task | Delivered behavior | Observed assertions | Status |
| --- | --- | --- | --- |
| P07-011 | Preserve each independently paid source/attempt; cap original merchandise funding once; new exact excess becomes source-specific correction with separate refund obligations/counters | Real failed-first/second-attempt preparation followed by independently verified overlapping Paid; both attempts/receipts kept; one stock/coupon commitment; correction-only obligation; replay has no extra effect; existing receipt/late/risk and refund-projection regression | Done |
| P07-012 | Merchant-partitioned leased status verification with durable cursor/last-check scheduling, bounded status-aware retries, restart safety, investigation escalation and resolution | Missing IPN; query timeout remains uncertain; Paid proof preserved on later timeout; foreign merchant isolation; job/IPN overlap; crash after commit; takeover during provider I/O; expiry after stock writes rolls back money; cursor fairness; escalation once and resolved once; new quarantine on Paid remains unresolved; compiled local/test entry/default-off/deployed refusal | Done |

## Delivered ownership and behavior

Payments' receipt coordinator now allocates an exactly matched verified source to at most remaining original
merchandise entitlement. Its remainder is correction; an additional whole paid attempt cannot fund merchandise,
stock, coupon or fulfillment again. Each new correction source creates its own under_review/not_reserved refund
obligation through the existing Refunds capability, without consuming merchandise unit entitlements or changing
merchandise refund progress. Existing approved refund-projection states remain intact. Mismatches against the
immutable attempt expectation and unknown ownership remain quarantined/unmatched, not automatic funding.
Historical unassigned receipts are not silently reclassified; supervised reconciliation retains that authority.
No currency/price/order snapshots are recalculated and no refund approval, reservation or payout is added.

`payment-reconciliation.service.ts` owns canonical attempt/initiation/intake reads and observation writes.
`reconcile-payments.job.ts` orchestrates domain capabilities and shared leases, not private models. The script
`backend/scripts/reconcile-payments.mjs` is the explicit root composition/one-shot worker entry. Provider query
and independent validation run outside transactions through the existing adapter/receipt processor; every
query uses a persisted original merchant-bound transaction identity. The worker never initiates a charge,
generates a replacement transaction ID or decides refund eligibility.

Scheduling reuses durable attempt state/lastCheckedAt and the shared jobLeases registry. Explicit unresolved
and terminal fixed polling intervals control admission; terminal attempts are revisited for late/new money.
The bounded attempt-ID cursor advances across unresolved/foreign candidates and wraps, so one old unknown
record does not starve later records. No new collection/schema/index or financial TTL is introduced. Existing
state/lastCheckedAt and unique job/receipt indexes remain canonical. Initiation already records lastCheckedAt,
so the first poll honors its configured grace interval rather than querying immediately.

Before provider I/O, financial processing, recovery, observation updates and cursor checkpoint, the worker
requires its current owner/expiry. Shared lease fencing now makes an actual monotonic updatedAt write even
under the same clock, matching the existing account-fence principle rather than relying on a possible no-op.
Financial and recovery transactions check ownership again after writes; a stale runner cannot commit money,
allocation or progress. Receipt uniqueness and payment/order revisions still guard effects independently of
leases. Crash/retry may repeat safe status reads, not a charge or allocation. Existing expiry consumers pass
regression with the strengthened technical fence.

Timeout, malformed/unavailable verification or unknown result is unresolved, never new proof of Failed.
Original terminal/Paid proof remains retained even if its current query is unavailable. A Paid attempt with
new quarantined funds is also unresolved. lastCheckedAt is observation time, not collection proof. Overdue
unresolved observations create one protected payment.reconcile.escalated audit per attempt; subsequent verified
resolution records payment.reconcile.resolved. New escalation counts mean newly persisted investigations;
unresolved counts remain visible after an earlier escalation. Audit facts plus current protected attempt/intake
state form the operator investigation trail, not a public customer message or automatic refund/retry permission.

CLI activation is independent of callback availability: PAYMENT_RECONCILIATION_ENABLED must explicitly be true
in local/test, with valid sandbox adapter and every bounded scheduling parameter supplied. No defaults or legal
periods are invented. Invalid/missing config and deployed environments are refused before database access.
The command emits aggregate counters or a generic failure only, without transaction IDs, credentials or raw
provider data. HTTP startup never schedules or provisions it. An actual external scheduler/cadence/duty owner
must be qualified separately; no deployed schedule or provider delivery SLA is claimed.

The existing additive payment-initiation bootstrap now provisions the already canonical jobLeases protections
alongside payment/refund/audit state. It preserves progress and facts and still refuses deployed convenience
execution. A worker fails closed on missing protection; it does not repair persistence at runtime. No package,
CI inventory, frontend, new HTTP route or public API DTO was added. API accounting/procedure, Database, Testing,
Operations, sanitized env template and Changelog are synchronized. Providers retain protocol/secret ownership;
controllers import no private persistence; shared code has no business imports. Executable boundaries pass.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica sets, real transactions,
local HTTP/Supertest and injected synthetic provider transport. The compiled command fixture additionally
replaces global fetch with a refusing hook and tests an empty-due scan, not real provider success. No merchant,
live collection, refund, customer communication or production database action occurred.

| Command / selection | Observed result |
| --- | --- |
| Backend integration runner, `checkout-quote.test.ts payment-records.test.ts payment-verification.test.ts payment-callback.test.ts payment-correction-migration.test.ts` | Passed 176 at owning regression revision: checkout 107, records 15, verifier 32, callbacks 19, migration/intent 3; local `test-results/payment-reconciliation-regression.json` |
| Same runner, `checkout-quote.test.ts -t 'multi/reconcile batch'` | Passed final 13 affected tests, 96 intentionally not selected (109 total cases); local `test-results/payment-reconciliation-review.json` |
| Same runner, final post-allocation lease-expiry selection | Passed the real-write rollback/restart case; local `test-results/payment-reconciliation-final-fence.json`; also included in final 13 |
| `npm run test:unit --workspace=backend -- payment-reconciliation.test.ts payment-risk.test.ts sslcommerz.test.ts` | Passed 60 cases, explicit policy bounds and provider adapter regression |
| `npm run test:contract --workspace=backend` | Passed 105, four artifacts verified; unchanged 92 implemented/72 planned operations |
| `npm run typecheck --workspace=backend` | Passed final runtime/tests |
| `npm run build --workspace=backend` | Passed final runtime; compiled entry exercised after build completion |
| `npm run lint --workspace=backend` | Passed, 348 files |
| `npm run lint:boundaries` | Passed, 329 files and zero errors |
| `npm run format:check` | Passed, 512 files |
| `npm run lint` | Repository documentation checks passed |
| `git diff --check` | Passed |

Dedicated report runner from backend:
`../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/<report>.json <selection>`.
Local reports are generated workspace artifacts, not committed release evidence. Counts overlap: the original
96 checkout cases were retained with changed correction expectations, not counted as newly added cases.
The final two review cases and dispute detection were checked in the scoped 13-case suite; unchanged owning
regression results were reused under change-based verification.

Initial job fixtures incorrectly expected an immediate poll despite initiation's persisted lastCheckedAt;
synthetic time now advances past the explicit grace interval. No production delay was weakened. One compiled
entry run overlapped build cleanup and failed with a missing dist module; the complete affected suite then
passed sequentially after build. Review also separated terminal proof from a currently successful query and
kept new quarantined money on Paid unresolved. No failed check remains unresolved.

## Review, limits and rollback

Executor reviewed actual diff, capped correction accounting, separate refund classes, preserved immutable
sources, merchant identity, lease/cursor ownership, real transaction fences, provider I/O exclusion, callback
and worker races, retry cadence, escalation facts, secret-free command output and existing user changes.
Project-owner acceptance of each task is recorded below; no milestone or external gate is accepted.

Not Run: actual provider sandbox/live timestamp/ACK/uniqueness qualification, production scheduler cadence,
clock-skew/failover/restore deployment exercises, real admin alert delivery/UI, actual refund approval/payout,
frontend/browser or full backend-stage/release regression. The prior explicit-offset collection-time decision
remains: timezone-free v4 tran_date is retryable pending evidence. P07-005/P06-010 reviews, P06-003 legal sign-off,
P06-011 confirmation/shipping, P07-013 safe user retry admission and other merchant/refund/milestone gates remain
separate. Existing terminal nonpayment proof is not fresh permission to issue another charge after an unknown
current query; P07-013 must perform its own safe admission. No fresh charge is issued by this worker.

Freeze/rollback by stopping scheduled reconciliation and disabling its flag along with other affected API/admin
financial writers. Do not delete leases/cursors or rewrite source classes to force a retry. Preserve attempts,
intake/collections, correction obligations, audit facts, movements and all provider identities. Removing a
worker cannot undo collected money. Resume through reviewed operational reconciliation; historical unassigned
funds remain supervised. No branch, commit or push was performed by Codex for this batch.


## Independent acceptance

On 29 October 2026, after the paired implementation, verification and executor-review handoff,
the project owner explicitly answered: “দুটোই গ্রহণ করছি—Done করুন”.

- **P07-011 accepted:** submitted multiple-paid-source accounting with capped merchandise allocation,
  source-specific correction obligations, separate refund accounting and recorded verification. Status Done.
- **P07-012 accepted:** submitted local/test durable merchant-scoped reconciliation, status-aware
  scheduling/retries, lease/restart protections, escalation/resolution facts and recorded verification. Status Done.

Acceptance retains the documented local/test, explicit timestamp, provider, scheduler, recovery and refund
limits. It does not accept prior reviews, safe retry admission, actual refund approval/payout, deployed
activation, legal approval, provider qualification or any milestone. No live financial action is authorized.
