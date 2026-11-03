# P09-016 / P09-017 — local support and audit reads

**Current development status: Done under [Package F completion](./P06-016-017-commerce-delivery-support.md#package-f-completion).** The historical limits below are superseded by authoritative source/API integration, affected verification and executor review; external/stage gates remain separate.

1 November 2026, Asia/Dhaka. Executor: Codex. Status: **Blocked** for both tasks; local code is not independent acceptance or an integrated release.

## P09-016 — complaint queue

The locally composed `GET /admin/complaints` reads the existing order-linked complaint service using a current admin session, strict status filtering, stable paginated order and a projection that excludes reporter contact. It does not activate the application root or expose complaint mutation routes. P06-017 acceptance, anonymous intake and anti-abuse, customer history, contact/response events, policy and full operational API integration remain outstanding.

## P09-017 — audit history

The locally composed `GET /admin/audit-logs` uses current admin authorization, bounded page size, stable ordering and strict target/date filters. It projects actor and subject identity, action and time; free-form reasons, digests, correlation material and operation keys are omitted to avoid leaking raw PII. `targetId` locally requires `targetType`. Production-sized query/index profiles, accepted dependencies and stock/payment/refund/reconciliation exception queues remain outstanding. No root activation or operational mutation is enabled.

## Observed checks

- **Passed:** isolated replica-set `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'support read local|commerce/exception batch:.*complaint' --reporter=dot` — 7 passed, 232 skipped. Exercises active/suspended/wrong-role sessions, pagination/filtering, redaction, existing complaint authorization and transaction behavior.
- **Passed:** `npm run test:contract --workspace=backend` — 112 tests, including separate registration coverage for these locally composed planned routes.
- **Passed:** `node --test --test-isolation=none --test-name-pattern=SUPPORT-BOUNDARY tests/tooling/development.test.mjs` — one negative boundary fixture.
- **Passed:** `npm run typecheck --workspace=backend`, `npm run build --workspace=backend`, `npm run lint --workspace=backend`, `npm run lint:boundaries`, and `npm run format:check`. An initial format check raced the formatter and failed; a sequential rerun passed.
- **Not run:** full integration/checkout regression, production-sized MongoDB query profiles, deployed/browser, real support delivery, independent review and milestone checks.

No API, database or operational policy contract changed. The changes are local-only and rollback removes the uncomposed read router/services; no data migration or external effect is introduced.
