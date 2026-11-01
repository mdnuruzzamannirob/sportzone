# P09-002 / P09-015 — local foundations

1 November 2026, Asia/Dhaka. Executor: Codex. Both tasks remain **Blocked**; this record is not independent acceptance.

## P09-002 — non-authoritative financial arithmetic

A private pure calculator consumes separate caller-supplied period order/collection/completed-payout facts and cutoff COD balances. It separates gross, discounts, accepted sales, collected cash, merchandise/correction payout, signed cash flow and COD outstanding; rejects duplicate identities, inconsistent snapshots and integer overflow. It neither accesses persistence nor establishes that supplied facts are verified, time-filtered, reconstructible at a cutoff or authorized. Arrays have a local maximum of 5,000 records; this is not a production aggregation or API limit.

Accepted P06-012/P08-005, authoritative query adapters, event-time filtering and cutoff reconstruction, pending/unassigned cash measures, production query profiles, integrated API and independent acceptance remain outstanding. No report is exposed to users.

## P09-015 — masked customer detail capability

An auth-owned read-only service verifies a current active administrator and exact customer role, then projects a masked email/phone and basic account state. It excludes credentials, addresses, deletion requests and non-customer accounts. There is no HTTP route or mutation. Accepted P06-014/P08-019, customer search and histories, status decisions with session revocation, safe deletion review, API integration and independent acceptance remain outstanding.

## Verification

- **Passed:** `npm run test:unit --workspace=backend -- report-calculation.test.ts` — 2 synthetic arithmetic cases, including duplicate and overflow rejection. Synthetic inputs do not prove real ledger reconciliation.
- **Passed:** isolated MongoDB replica set: `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'customer admin local' --reporter=dot` — 1 passed, 239 skipped; current/wrong/suspended admin and masked customer details.
- **Passed:** `npm run typecheck --workspace=backend`, `npm run lint --workspace=backend`, `npm run lint:boundaries`, `npm run format:check`, and `node --test --test-isolation=none --test-name-pattern=REPORT-BOUNDARY tests/tooling/development.test.mjs`.
- **Not run:** full backend integration, report source/cutoff reconciliation, customer administration HTTP, provider/deployment and independent acceptance.

No database or API contract changed. Removing the uncomposed reader and calculator rolls back this local work without migration or external effects.
