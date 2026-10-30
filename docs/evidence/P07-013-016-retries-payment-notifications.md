# P07-013 / P07-016 — Safe retries and verified payment notifications

Status: **Done**, independently accepted by the project owner on 30 October 2026.
Scope: Backend local/test; PRD FR-12/FR-20, API §§12.2/16.3, Database §10.1.
P07-014 is Storefront and P07-015 Admin; their stage prerequisites remain unchanged.

## Separate acceptance checklists

| Task | Implemented behavior | Acceptance evidence |
| --- | --- | --- |
| P07-013 | Reauthorize same-order/principal replay without provider I/O; independently query every prior merchant-bound attempt before a new key; only fresh terminal nonpayment permits dispatch | Actual initiation route tests: Pending/timeout/Paid denied, revoked identity denied, same-key replay, competing new keys, late Paid callback |
| P07-013 | Recheck exact history/digest/funding inside admission transaction; reacquire expired stock/coupon generation with shared clocks and immutable pricing | Real replica-set tests: fresh generation, coupon shortfall without dispatch, one concurrent winner; quarantine blocks retry |
| P07-016 | Atomic provider-verified success/failure/pending intents; one success per intake and one failure/pending per attempt | Duplicate receipt, pending/failure deduplication and missing outbox index rollback tests |
| P07-016 | Canonical order recipient/amount/receipt validation, truthful templates, stale negative suppression; explicit worker activation | Recipient tamper, quarantined collection, Paid suppression and actual composed worker tests |
| P07-016 | Stable delivery identity, bounded known-rejection retries, no uncertain resend or financial replay; additive migration | Known 429 retry, uncertain delivery, exact guest predecessor migration plus shared notification regression |

## Implementation and review

Payments owns retry admission and canonical evidence reading; Orders exposes only an immutable
notification-target capability. Notifications owns payload validation, outbox and delivery. Provider
protocol remains in its adapter. Controllers contain no new model access. No collection, public
route or DTO was added. Root composition wires narrow capabilities. Boundary checks passed.

Provider queries run outside transactions; receipt/outbox writes commit together. Final admission
rechecks current authorization and exact history. Histories exceeding 100 require investigation;
existing-key replay still works. Success describes collection, not fulfillment or refund completion.
Queued negative events are suppressed when canonical evidence changes before delivery. Transport
uncertainty cannot repeat payment processing. No exactly-once inbox-delivery claim is made.

Reviewed actual diff for cross-module access, replay races, secrets, schema compatibility and
unrelated changes. Notification payloads contain opaque IDs, order number and integer amount;
recipient remains private. No `.env` contents were inspected or modified.

## Verification

Environment: local Node/npm workspaces; isolated replica-set-capable MongoDB fixtures and local
HTTP fixtures. Gateway/email adapters are controlled test doubles, not live merchant evidence.
Commands below run from repository root unless explicitly prefixed with `cd backend`.

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed, completed before compiled-entry checks |
| `npm run test:unit --workspace=backend -- notifications.test.ts payment-risk.test.ts payment-reconciliation.test.ts sslcommerz.test.ts` | Passed: 88 |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-retry-notification-regression.json checkout-quote.test.ts payment-initiation.test.ts payment-records.test.ts payment-verification.test.ts notifications.test.ts guest-access.test.ts` | Passed: 232 before final three race/rollback cases and predecessor migration assertion; reused for unchanged consumers |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-retry-notification-final.json checkout-quote.test.ts notifications.test.ts -t 'retry/notification batch&#124;exact guest/order'` | Passed: 16 selected, 129 outside selection; final changes covered |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts notifications.test.ts` | Passed: 21 shared delivery/migration tests |
| `npm run test:contract --workspace=backend` | Passed: 105; four API artifacts verified |
| `npm run lint --workspace=backend` | Passed: 351 files |
| `npm run lint:boundaries` | Passed: 332 files, zero errors |
| `npm run format:check` | Passed: 515 files |
| `npm run lint` | Passed: 667 files, 1448 local links, zero errors after correcting evidence-table separators |
| `git diff --check` | Passed |

The initial final-focused attempt could not bind local ports (`EPERM`) and executed no tests.
Rerunning with local-listener permission passed. Ignored JSON reports reside under `test-results/`;
they are local execution artifacts, not committed release evidence.

## Rollout, recovery and limitations

Build, explicitly run the existing local/test payment-initiation bootstrap or notification migration,
then verify readiness. Only exact known predecessor validators upgrade; records/statuses remain
unchanged. Set `PAYMENT_NOTIFICATIONS_ENABLED=true` only with the existing approved test recipient
and email configuration. Default workers skip payment templates. Staging/production activation is
rejected. Preserve financial/outbox evidence on rollback; use a schema-compatible binary.

Not Run: live provider/channel qualification, actual inbox delivery, deployment/scheduler, frontend
journeys and integrated milestone acceptance. Existing timezone evidence, legal/refund/confirmation
and unrelated task reviews remain separate gates. No production external effects were performed.

## Independent acceptance

The project owner independently accepted both submitted tasks on 30 October 2026:
“দুটোই গ্রহণ করছি—Done করুন”.

- **P07-013: Done** — accepted safe retry admission, ownership, concurrency and capacity behavior.
- **P07-016: Done** — accepted verified notification intents, deduplication and guarded delivery.

Acceptance is limited to the submitted implementation and recorded local/test verification.
Live provider/channel, actual inbox delivery and milestone gates remain as stated above.
