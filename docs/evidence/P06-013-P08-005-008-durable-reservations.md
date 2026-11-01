# P06-013 / P08-005–008 — durable refund reservations and funded cancellation

1 November 2026, Asia/Dhaka. Executor: Codex. Starting HEAD `ac50d5a`; the earlier review/customer
changes were already staged by the user and were preserved. This record covers subsequent financial
work in the working tree. Full tasks remain **Blocked**; no policy, merchant, operator or independent
acceptance is supplied by this record.

During execution, the earlier staged review/customer work appeared in commit `c592c3e`. This work
did not create or publish that commit; its changes were preserved. The financial changes here are
the subsequent working-tree delta, not a claim of a clean committed release.

Final source/test/script/API delta relative to `c592c3e` has SHA-256
`54c07c8adb09f9004ebcd1eb3564eead72c29a67dea86f413015105e28ab42e5`.
It hashes the 21 sorted changed/untracked paths under `backend/src`, `backend/tests`, `backend/scripts`,
`backend/api` and `tests/tooling`, each as path + NUL + bytes (or `<deleted>`) + NUL. Documentation is excluded.

## Delivered local behavior

- Canonical `refunds` now supports source-funded merchandise/correction obligations with method,
  policy, approval, timing and capacity states. Generic edits/deletes remain prohibited; strict BSON
  checks bind class, amount, item/unit sums, approval and completion shape.
- Canonical `refundAttempts` has durable original bank/merchant identity, amount, status and CAS
  revision, unique request/reference identities and one open attempt per obligation. Created,
  submitted and uncertain remain distinct from confirmed payout. No TTL is permitted.
- Private current-admin reservation commits source-class and order holds, original unit/delivery
  holds, approved obligations, created attempts and audit together. Original prices/ordinals come
  through owning Orders/Returns capabilities; financial collections remain private to Payments.
  A deterministic natural group deduplicates changed keys and reasons. Multiple verified sources
  can split one original unit into separately funded obligations. Existing correction intents are
  advanced rather than duplicated; merchandise/correction capacities remain independent.
- A protected policy capability must supply method/version and consent where required. Request-body
  overrides are forbidden. Delivery reservation requires policy authority and original-charge caps.
  No approved calendar is invented: timing remains under review without a target date.
- Paid cancellation now has a real transaction-bound refund capability. Pending request, original
  pre-dispatch units and verified collected amount are reread, then refund reservation/attempts,
  stock/coupon release, cancellation history and audit commit atomically. Partial COD creates only
  the actually collected liability. Cross-admin cancellation/shipment races have one winner;
  downstream failure rolls financial and fulfillment effects back together.
- Explicit local cancellation HTTP exposes request/history and admin queue/decision. Customer and
  exact guest ownership/CSRF, exact Origin, mandatory replay keys, strict input and admin authorization
  are exercised. Ordinary application startup does not install these routes or refund capabilities.
- The private gateway dispatcher commits submitted intent before one outside-transaction provider
  call. Concurrent/replayed/different-key requests do not resend an already submitted/uncertain
  attempt. Provider acceptance preserves Processing and held balance; timeout preserves uncertainty
  and the original identity. No independently confirmed payout or automated retry is inferred.
- Payment-monitor correction queries now filter correction classification, keeping merchandise
  obligations out of the correction list. The approved `REFUND_BALANCE_EXCEEDED` error was added to
  executable error definitions and generated OpenAPI artifacts; implemented operation count stays 98.

## Migration and recovery

`bootstrap-refunds.mjs` is explicit local/test only. It recognizes only the exact correction-only
predecessor, checks row compatibility, adds declared indexes, upgrades validation and creates attempt
persistence without rewriting historical intents. Repeated execution preserves data; unknown drift
and deployed configuration are refused. No external database migration was run.

Use a compatible binary on rollback and preserve source/payment/unit/delivery counters, refund and
attempt identities, cancellation/allocation history, audit and notifications together. Never reset
submitted/uncertain to created or generate a new merchant ID merely to retry. DB failure after a
possible provider effect leaves the durable submitted identity for investigation.

## Actual verification

Local Node/npm, isolated MongoDB replica sets and Supertest. Cash/policy/consent and gateway outcomes
are explicitly synthetic fixtures. Real persistence, authorization, CAS, transactions, races, migration
and compiled bootstrap are exercised; real merchant or cash-verification acceptance is not established.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend` | Passed before compiled bootstrap and smoke checks. |
| `npm run typecheck --workspace=backend` | Passed. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts payment-correction-migration.test.ts payment-records.test.ts orders.test.ts --reporter=dot --reporter=json --outputFile=../test-results/refund-cancellation-regression.json` | Passed: 320 tests / 4 files, including full affected order/payment/claim regressions and the new reservation, cancellation, dispatch and migration cases. |
| `npm run test:unit --workspace=backend -- --reporter=dot --reporter=json --outputFile=../test-results/refund-durable-unit.json` | Passed: 781 tests / 44 files. |
| `npm run test:contract --workspace=backend` | Passed: 112 tests, 4 API artifacts verified; local cancellation registration covered separately from implemented operation parity. |
| `node --test --test-isolation=none --test-name-pattern=REFUND-DURABLE-BOUNDARY tests/tooling/development.test.mjs` | Passed: one negative ownership/controller fixture. |
| `npm run lint --workspace=backend`, `npm run lint:boundaries` | Passed; 427 linted files, 390 source files with zero boundary violations. |
| `npm run test:smoke --workspace=backend` | Passed: compiled real DB startup, liveness/restricted readiness and graceful shutdown. |
| `npm run test:security` | Passed: redacted secret scan and dependency audit. |
| `npm run format:check`, task/checkbox audit, `git diff --check`, `git diff --cached --check` | Passed; 210 tasks remain 107 Done, 77 Not Started, 24 Blocked and 2 Deferred. |

The first API freshness check correctly reported stale generated OpenAPI after adding the approved
refund-balance error; `npm run api:generate --workspace=backend` regenerated the artifacts and the
contract rerun passed. An initial documentation-edit helper failed before writing; it was corrected.
No failed attempt is relabeled as a successful check. Local JSON artifacts are replaceable and ignored.

## Remaining work and gates

This completes the local durable reservation/attempt/one-shot-dispatch and funded-cancellation path,
not the complete requested backend. Independent final payout proof, atomic held-to-completed/release
transitions, safe retry and reconciliation worker, manual confirmation, refund notifications/timelines,
additional partial-refund request semantics, full refund HTTP/root activation and real provider/operator
qualification still remain. Other blocked task findings remain in the
[cross-task review](./blocked-backend-review-2026-11-01.md#task-by-task-review), except that its earlier
"correction-only/no reservation/no durable attempt" descriptions are superseded by this implementation.

P06-003 qualified rule/sign-off and accepted prerequisites remain unresolved. Existing task statuses
stay Blocked and checkboxes remain unchecked; no milestone or backend-stage acceptance is inferred.
