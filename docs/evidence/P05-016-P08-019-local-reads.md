# P05-016 and P08-019: local read work

31 October 2026. Executor: Codex. Both tasks are **Blocked**, not accepted; this record describes local work in the current working tree, not a deployed release.

## P05-016 — reviews

Locally composed routes expose approved public review lists, customer-owned lists and submit/edit, and administrator moderation lists/actions. The review service resets moderation on edits and audits moderation. Tests exercise actual local sessions, CSRF and ownership. Public rows are allowlisted. Public product visibility is a required injected transaction-scoped capability; missing capability fails closed. The tests use synthetic visibility and purchase qualification. Ordinary application root composition, real catalog visibility integration, accepted P08-016 qualification and independent review remain outstanding.

## P08-019 — claims

Locally composed order-claim list and claim detail authenticate a customer or scoped guest and verify the exact nested order in the same transaction. Evidence metadata requires matching private, clean, attached Media records and claim/item references; storage URLs and internal claim fields are excluded. The guest session in the test is issued through the session service after a synthetic proof exchange, not a demonstration of real guest proof delivery.

This is a partial implementation: `/me/claims`, admin claims, refund histories and timelines, signed private-image retrieval, timing and investigation surfaces remain outstanding. The local unpaginated order list fails closed above 100 claims rather than silently truncating; the complete API needs an approved approach to that limit before activation. The router is not composed into the application root. Accepted P08-011 and other relevant return/refund prerequisites, end-to-end authorization and independent review remain necessary.

## Verification

Local Node environment with isolated MongoDB replica set; HTTP exercised via Supertest. No external provider, deployed environment or independent acceptance is represented.

- **Passed:** `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts reviews.test.ts orders.test.ts --reporter=default` — 67 tests, including private evidence scope and review routes.
- **Passed:** `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'claim history local' --reporter=default` — 2 tests, 232 skipped; customer and guest nested ownership and invalid-credential denial.
- **Passed:** `npm run test:contract --workspace=backend` — 112 tests; local-only router inventory checked separately from the implemented registry. An initial run failed because the new route owners lacked parity fixtures; corrected and rerun.
- **Passed:** `npm run typecheck --workspace=backend`, `npm run build --workspace=backend`, `npm run lint --workspace=backend`, `npm run lint:boundaries`, `npm run format:check`, `npm run lint`, and `node --test --test-isolation=none --test-name-pattern=HISTORY-BOUNDARY tests/tooling/development.test.mjs`. Initial typecheck and lint runs found fixture/import issues; corrected and rerun.
- **Not run:** full checkout integration suite, real provider or hosted integration, frontend/browser, independent acceptance and milestone checks.

No API, database, operational or business policy contract was changed. Local router behavior is provisional and is not included in the implemented API registry. Rollback removes the uncomposed routes and readers; no migration or external effect is involved.
