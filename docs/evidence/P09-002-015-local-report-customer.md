# P09-002 / P09-015 — local foundations

**Current development status: Done under [Package F completion](./P06-016-017-commerce-delivery-support.md#package-f-completion).** The historical limits below are superseded by authoritative source/API integration, affected verification and executor review; external/stage gates remain separate.

1 November 2026, Asia/Dhaka. Executor: Codex. Both tasks remain **Blocked**; this record is not independent acceptance.

## P09-002 — non-authoritative financial arithmetic

A private pure calculator consumes separate caller-supplied period order/collection/completed-payout facts and cutoff COD balances. It separates gross, discounts, accepted sales, collected cash, merchandise/correction payout, signed cash flow and COD outstanding; rejects duplicate identities, inconsistent snapshots and integer overflow. It neither accesses persistence nor establishes that supplied facts are verified, time-filtered, reconstructible at a cutoff or authorized. Arrays have a local maximum of 5,000 records; this is not a production aggregation or API limit.

Accepted P06-012/P08-005, authoritative query adapters, event-time filtering and cutoff reconstruction, pending/unassigned cash measures, production query profiles, integrated API and independent acceptance remain outstanding. No report is exposed to users.

## P09-015 — masked customer detail capability

At the original handoff, an auth-owned read-only service verified a current active administrator and exact customer role, then projected a masked email/phone and basic account state. It excluded credentials, addresses, deletion requests and non-customer accounts; no HTTP route or mutation was included. The later review below extends that scope. Accepted P06-014/P08-019, complete histories, safe deletion review, ordinary integration and independent acceptance remain outstanding.

## Verification

- **Passed:** `npm run test:unit --workspace=backend -- report-calculation.test.ts` — 2 synthetic arithmetic cases, including duplicate and overflow rejection. Synthetic inputs do not prove real ledger reconciliation.
- **Passed:** isolated MongoDB replica set: `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'customer admin local' --reporter=dot` — 1 passed, 239 skipped; current/wrong/suspended admin and masked customer details.
- **Passed:** `npm run typecheck --workspace=backend`, `npm run lint --workspace=backend`, `npm run lint:boundaries`, `npm run format:check`, and `node --test --test-isolation=none --test-name-pattern=REPORT-BOUNDARY tests/tooling/development.test.mjs`.
- **Not run:** full backend integration, report source/cutoff reconciliation, customer administration HTTP, provider/deployment and independent acceptance.

No database or API contract changed. Removing the uncomposed reader and calculator rolls back this local work without migration or external effects.

## 1 November 2026 — blocked-task review follow-up

The former query service is now cohesive `customer-admin.service.ts`, still owned by Auth.
Explicitly local customer routes support masked search/detail and reasoned, keyed active/suspended
decisions. Status/security revision, customer session revocation and exact from/to audit commit
atomically; retries do not overwrite later status, and reactivation does not resurrect credentials.
Deletion-pending/deactivated targets are protected. HTTP CSRF/input tests, concurrent duplicate
decisions and rollback after real state/session/audit writes are verified in the
[cross-task review](./blocked-backend-review-2026-11-01.md). Full histories, approved deletion/retention
review, prerequisite acceptance and ordinary activation remain incomplete. No production account was
changed; rollback of this uncomposed code requires no schema migration and must retain any local audit.
