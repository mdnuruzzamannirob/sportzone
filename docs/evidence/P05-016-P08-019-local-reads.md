# P05-016 and P08-019: local read work

**Current status: Package E P05-016, P08-016 and P08-019 Done.** The
[Package E completion](#package-e-completion) below supersedes historical implementation gaps and
per-feature independent-review blockers in this record. External qualification and application/milestone
closeouts remain separately owned by their existing tasks.

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

## 1 November 2026 — additional local review and admin claim reads

P05-016 now has a transaction-scoped Catalog-owned review visibility capability using the same active product, category ancestry and valid variant checks as public catalog browsing. Local tests inject this actual capability; normal root composition remains disabled and purchase eligibility in the review API tests remains synthetic.

P08-019 now has locally composed paginated administrator claim queue and detail reads with current-admin session checks, strict filters and redacted evidence and eligibility metadata. These are read-only and do not enable decisions or refunds. Customer/guest access remains unchanged. The local queue is pending accepted prerequisites, full API composition and independent review; the existing task limitations above still apply.

Checks on an isolated MongoDB replica set: `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'claim history local' --reporter=default` passed 3 tests (232 skipped); the corresponding command for `reviews.test.ts` passed all 30 tests. `npm run test:contract --workspace=backend` passed 112 tests. `npm run typecheck --workspace=backend`, `npm run build --workspace=backend`, `npm run lint --workspace=backend`, `npm run lint:boundaries`, and `npm run format:check` passed. No deployed integration or external provider check was run.

## 1 November 2026 — blocked-task review and real review composition

[The blocked-task review](./blocked-backend-review-2026-11-01.md) adds an explicit local/test root
factory combining real order qualification, catalog visibility, current-admin transaction fences and
durable audit receipts. Actual HTTP tests cover create/moderate/edit, replay without reapproval,
foreign/undelivered proof, CSRF and suspended admin. This closes the synthetic-moderator composition
gap above, but full P05-016 still depends on accepted P08-016 and real completed-refund integration.
Ordinary deployed review activation and the unfinished P08-019 surfaces remain blocked.

## Package E completion

2 November 2026 (Asia/Dhaka). Executor and implementation reviewer: Codex. Starting revision
`77d0eb7`, clean working tree. Scope: P05-016, P08-016 and P08-019 under the owner-approved ordinary
engineering completion convention in Tasks §2. No frontend, new dependency, production mutation,
external transfer or customer data export was performed.

### Delivered behavior and ownership

- **Reviews:** explicit application and actual server startup composition connects the existing
  public approved list, customer submit/edit/history and protected admin moderation to real Catalog,
  Orders, current Auth and Audit capabilities. Existing replay receipts, public field allowlists,
  one-active-review constraint and moderation-after-edit remain enforced; admins cannot rewrite ratings.
- **Purchase qualification:** a registered delivered purchase qualifies until every unit is canonically
  resolved and its positive net entitlement has actually completed refund settlement. Approved/held
  money does not count. Orders fences the order and unit balance in the review transaction, preserving
  serialization with settlement. Zero-value units require canonical claim resolution, but no fictitious
  payout; an unreturned zero-price purchase remains eligible. Legacy aggregate quantity cannot overrule
  canonical unit facts. Existing reviews survive refund and can be edited back to pending moderation;
  another eligible delivered purchase remains usable.
- **Customer histories:** `/me/claims` and `/me/refunds` use current authenticated customer scope,
  ownership-filtered counts and strict filters before stable descending creation-time/ID pagination.
  Orders supplies only immutable owned order identities, never a model or private collection handle.
  A customer can see all their orders without trusting claim `requestedBy` or client-supplied owner IDs.
- **Nested refunds:** customer/exact verified guest order list and refund detail recheck current
  ownership in the same transaction. Malformed customer credentials never fall back to guest proof.
  Safe public status timelines are chronological/deduplicated, bounded to 40 events; explicit original
  approval and verified completion timestamps remain. Merchandise and correction totals stay separate.
  Unknown/pending payout stays processing/held. A durable investigation marker is exposed safely and
  cleared by the verified terminal outcome. Missing calendar timing stays under review with no target.
  Provider/bank references, payout destinations, consent/proof, administrative actors and diagnostics
  never enter the public DTO; opaque source IDs remain per API Appendix D.2. A shorter approved business-day target is retained from the timing snapshot.
- **Claims and private evidence:** the same activated Return composition supplies customer/guest/admin
  list/detail/decision/receipt/inspection/completion and signed private evidence retrieval from Package B;
  Package C/D retain source/quantity caps, protected refund decisions and verified payout authority.
  The old arbitrary 100-claim failure was removed from the documented unpaginated exact-order list;
  customer cross-order lists use the canonical paginated envelope.

### Activation, data and rollback

`AFTER_SALES_HISTORY_ENABLED` defaults false. Explicit local/test activation requires both auth
 audiences and `RETURN_OPERATIONS_ENABLED=true`. The application root also checks admission when
called directly. Actual `startServer` wiring is tested. Existing reviewed bootstraps initialize
persistence, including `bootstrap-reviews.mjs`; normal startup performs no DDL. Deployed admission
remains refused consistently with Packages B–D. Disabling the flag removes history/review routes and
preserves all durable claims, reviews, audit and financial facts. There is no new collection, index,
validator migration, ownership backfill or financial retry.

Owners/paths: Orders owns delivered proof and customer identity projection; Returns owns claim
history; Refunds owns refund/attempt history and masking; existing Reviews owns moderation and public
ratings; Auth owns current customer/admin/guest authorization; Media owns private URL issuance; Audit
owns milestone projection. New route modules only validate HTTP input and call owning services.
Boundary negative fixtures now also prohibit Refund history imports of Orders/Payments/Audit models.

The four new GET routes are checked against the existing API paths by executable local-router parity.
As with B–D, explicit local/test composition is tracked separately from the standard deployed operation
registry (98 implemented-registry entries plus 68 planned, 166 total). `api:generate`/`api:check` confirm
all four generated artifacts remain unchanged; no deployed activation is implied.

### Verification

Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica set with actual database transactions and
Supertest/server listeners. Provider cash/refund evidence, merchant policy and Media adapters in tests
are clearly synthetic; canonical reservation, settlement, balances, moderation, auth and history readers
are real. The local HTTP/MongoDB checks use the execution permission needed for local listeners.

| Command/check | Observed result |
| --- | --- |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package E\|Package B/E' --reporter=dot` | Passed: 7 selected, 317 outside selection, before the final investigation-marker assertion; all final assertions are covered by the consumer run below |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts reviews.test.ts orders.test.ts guest-access.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-e-integration.json` | Passed: 412 across four files, including all 324 checkout consumer tests, actual server activation, completed payout→review denial, zero-price resolution, private evidence, another purchase, moderation/replay, customer/guest ownership, revocation, CSRF, quantity/source caps, retries and transaction races |
| `npm run test:unit --workspace=backend -- reviews.test.ts orders.test.ts refund-investigation.test.ts return-operations-config.test.ts` | Passed: 39 across four files |
| `npm run test:contract --workspace=backend` | Passed: 112; generated artifacts verified and new route-owner inventory/parity covered |
| `node --test --test-isolation=none --test-name-pattern=HISTORY-BOUNDARY tests/tooling/development.test.mjs` | Passed: one negative boundary fixture with seven reader/foreign-owner combinations |
| `npm run typecheck --workspace=backend` | Passed |
| Final `npm run build --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed: 451 files |
| `npm run lint:boundaries` | Passed: 408 files, zero errors |
| `npm run format:check` | Passed: adopted repository formatting inventory |
| `npm run lint` | Passed: repository structure and document links |
| `npm run test:security -- --scope=backend` | Passed: redacted gitleaks 8.30.1 history/working-tree scan and dependency audit; this script remains repository-global despite the argument, with no frontend build or UI tests |
| Final `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package E\|Package B/E' --reporter=dot --reporter=json --outputFile=../test-results/package-e-final.json` | Passed: 7 selected, 317 outside selection; final exact public field allowlist, investigation/clearing and shorter approved timing assertions included |
| Task checkbox/count audit and `git diff --check` | Passed: 210 tasks, 125 Done, 6 Blocked, 77 Not Started, 2 Deferred; checkbox/status consistency and clean whitespace |

Initial focused runs found three fixture errors: reused checkout idempotency key, incorrect assumed
pagination envelope nesting, and an inactive-route assertion made before authenticating through the
existing `/me` guard. The fixtures were corrected and all affected tests rerun. The final isolated selection also exposed a startup fixture that relied on an earlier test to initialize refund-attempt persistence; explicit initialization corrected that order dependency, and the isolated selection passed. One command used an
incorrect working directory and reran unchanged tests; it made no source mutation and is not counted
as successful verification. Lint informational template suggestions were corrected. Failed attempts
are not counted as passes. Formatting-only changes after regression do not change behavior.

Not Run: full unrelated backend integration inventory, admin/storefront builds or browser journeys,
full-project/release suites, hosted staging/provider/real cash or payout qualification, application
closeout and milestones. They are not prerequisites for these ordinary backend development tasks;
none is represented as completed by this evidence. No live external payout was performed.

### Final executor review and disposition

Reviewed the actual tracked and untracked diff against `77d0eb7`: preserved existing fixture defaults,
module ownership, NodeNext imports, session/CSRF/guest boundaries, provider separation, original financial
facts and all unrelated changes. No package, lockfile, production environment or durable business schema
was changed. Exact public refund key allowlist is asserted through HTTP. Backend-only affected regression
was selected; final DTO/timing refinements reran the focused consumer selection rather than the unchanged
full pipeline. The 412, 39, 112 and focused 7 results are separate runs, not a claim of unique additional tests.

Final source/test/config snapshot SHA-256:
`43b8ca50efa3478e998f9b8ba8b17b69997b18d67b9cd91017c5514234322627`.
It covers the 16 sorted changed/untracked paths under `backend/src/`, `backend/tests/`, `tests/tooling/`
and the two sanitized environment examples, encoded as path + NUL + bytes + NUL. Documentation is
excluded. No source behavior changed after the final focused verification.

P05-016, P08-016 and P08-019 are **Done** under Tasks §2. API §13.1/Appendix D.2 now document the
safe investigation/summary projection; Operations owns actual configuration/bootstrap/rollback steps.
Database contracts and persisted schemas remain unchanged. Historical blockers in this and related
records are superseded for these three development tasks. Package F/G and explicit external, application
closeout and milestone acceptance retain their existing tasks. No commit, staging or push was performed.
