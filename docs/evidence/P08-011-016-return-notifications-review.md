# P08-011 / P08-016 — Local return notifications and review qualification

**Current status: P08-011 Done.** [Package D refund/return notification integration and verification](./P08-009-010-local-refund-evidence.md#package-d-completion) supersede the historical limits for that task. P08-016 is also Done under [Package E completion](./P05-016-P08-019-local-reads.md#package-e-completion), including real canonical settlement binding and resolved zero-price units. The remainder below is historical.


Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Base revision `fe32523`. Owner requested the
next batch and previously authorized safe local work despite blocked prerequisites. Full task
status: **Blocked**; no task, policy, provider, backend stage or milestone acceptance is inferred.

| Task | Implemented local subset | Remaining work and acceptance |
| --- | --- | --- |
| P08-011 | Optional claim coordinator enqueues approval/rejection/completion in the same transaction as state, quantity and audit. A separately composed local worker rechecks immutable transition audit, order/claim scope and original recipient before rendering; retries retain the same event identity and message. Return completion explicitly does not say a refund was paid. | Accepted P08-009/P08-010; refund approval/rejection/retry/failure/completion outbox and verified payout binding; ordinary worker/API composition, sender/provider qualification and independent acceptance |
| P08-016 | Orders-owned, revision-fenced proof for the exact customer, delivered purchase, product and item; all resolved and fully paid-out units disqualify that purchase; a separate eligible purchase can qualify. Existing reviews remain and edits return to moderation. | Accepted P08-005 and real completed-refund source/counter integration; zero-value ambiguity and ordinary review/API composition; independent acceptance |

The review capability must be called in the review transaction and fences both order and item balance.
A stale transaction losing a race to full refund retries against current facts. A returned item with
only pending or absent payout remains eligible, as PRD FR-10 requires return **and** refund. For zero
unit entitlement without completed-quantity evidence the local capability fails closed rather than
inventing a verified refund. Tests use synthetic completed-refund ledger values; no actual payout is
asserted. The capability is not wired to ordinary runtime review creation.

Return notifications use a stable claim/operation identity and do not contain free-form decision
reasons, payment information or private evidence. The outbox recipient comes from the immutable order
snapshot; the delivery proof rechecks claim/order, exact audit transition and time, and recipient.
The ordinary worker does not claim return events without explicit local composition. No refund
completion template or provider confirmation was added. No real email, third-party operation or
financial mutation was performed. Notification failures after commit cannot roll back business state.

The strict notification validator adds `return_update` and the previous exact commerce validator is
recognized by the existing explicit local/test migration. Queued facts, attempts and leases are
preserved; unknown drift fails closed. Operators must use a compatible binary/validator on rollback,
not delete or downgrade notification, claim, order or audit evidence. No user/staging data migration ran.

References: PRD FR-10/17/18/20/31/32, Architecture §§4–6/10, Database §§6.6/7.3/9/10.1,
API §§10.3/13, Testing RET-05/RFD-09 and §15.5. Orders owns order/balance access, Returns owns claim
and event-proof access, Notifications owns outbox/rendering; no foreign private model imports.
No frontend, new package or new collection was introduced.

## Actual verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica sets; real local
customer/admin sessions and synthetic fulfillment approval/refund evidence; fake email adapter.
JSON output under ignored `test-results` is replaceable local evidence, not delivery or provider acceptance.

| Check | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- notifications.test.ts orders.test.ts` | Passed: 35 |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'review qualification local\|return notification local' --reporter=default --reporter=json --outputFile=../test-results/returns-review-notifications.json` | Passed: 16, 216 outside selection; ownership, delivered purchase, full/partial refund, second purchase, snapshot race, audit/outbox rollback, dedupe, tampering, retry, default worker isolation and migration |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts notifications.test.ts reviews.test.ts orders.test.ts --reporter=default --reporter=json --outputFile=../test-results/returns-review-consumers.json` | Passed: 85 |
| `node --test --test-isolation=none --test-name-pattern=AFTERSALES-BOUNDARY tests/tooling/development.test.mjs` | Passed: one named negative fixture |
| `npm run lint --workspace=backend` | Passed: 409 files |
| `npm run lint:boundaries` | Passed: 374 files, zero errors |
| `npm run format:check` | Passed: 574 files |
| `npm run test:contract --workspace=backend` | Passed: 111; four generated API artifacts unchanged |
| `npm run lint` | Passed: 743 files, 1488 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 83 Not Started, 18 Blocked, 2 Deferred; boxes consistent and diff whitespace clean |

The first second-purchase fixture reused a checkout idempotency key and was correctly rejected; a
separate key fixed the fixture. Initial typecheck found a missing `zod` import and lint found a style
warning; both were corrected and rerun. Failed attempts are not counted as passes. Not Run / Blocked:
real refund approval/payout notifications, source-funded refund writer, deployed email/provider,
ordinary review/notification activation, frontend, stage or integrated-release acceptance.
