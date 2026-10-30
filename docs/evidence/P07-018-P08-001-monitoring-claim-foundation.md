# P07-018 / P08-001 — Payment monitoring and claim foundation

Status: **Done**, independently accepted by the project owner on 30 October 2026 (Asia/Dhaka).
Executor review: Codex.
Base revision: `df3b602`; no commit, push, deployment or external business mutation performed.
Sources: FR-12/29 and FR-17/32; API §§12.1.1/13.1, Database §§7.3/9.1,
Architecture §§4–6 and Testing §§10–11/15.5. Both tasks have accepted prerequisites.
P06-011 retains the blocked P06-003 prerequisite; this batch does not bypass that gate.

## Separate acceptance checklist

| Task | Delivered behavior | Observed checks |
| --- | --- | --- |
| P07-018 | Current-admin list/detail with strict filters, bounded pagination, scoped opaque attempts/collections/corrections/audit and unmatched/quarantined intake | No-session/customer/suspended denial, exact DTO/secret exclusion, search intersection, invalid query/page, absent record, actual root activation |
| P07-018 | Existing risk decisions retained; audited durable manual reconcile with reason/CSRF/idempotency; worker independently verifies | Concurrent same-key convergence, changed-body conflict, audit-index failure rollback/recovery, no timestamp/financial mutation from scheduling, worker discovery and durable processing |
| P08-001 | Requested claims with server IDs, trusted requester/eligibility metadata, reasons and exact protected ordinals | Physical/shortage races exhaust one shared pool; duplicate IDs/lines and caller ordinals rejected; no transaction/authority denied |
| P08-001 | Canonical Orders balance CAS, immutable entitlement, no resolved/refunded/held reuse, whole-transaction claim/audit writes | Resolved and partially refund-held unit exclusion, later-line failure rollback, audit failure rollback/recovery, no duplicate protection |
| P08-001 | Strict BSON/index readiness, requested-record mutation denial and additive local/test bootstrap | Duplicate lines/quantity mismatch rejected by DB, drift refusal, compiled repeated bootstrap preserves records and deployed config is refused |

## Ownership and contracts

Payments owns monitoring, routes/DTOs and scheduling requests. Root composition activates only under
current admin auth in local/test. List pagination uses canonical response meta; separate detail
histories have bounded per-section pagination. Refunds and Audit expose narrow read capabilities;
Payments does not import their private models. Controllers only validate/adapt HTTP and call services.
No raw provider credentials/session/bank/validation IDs, contact details or free-text audit reasons
enter monitoring DTOs. All routes inherit no-store. Risk clearance still needs funded stock/coupon
allocation; no monitoring route relinks/discards funds or forces Paid/refund completion.

Manual requests reuse durable append-only audit identity with a hash of payment/key and reason digest.
Same-key replay does not refresh request time; equal concurrent requests resolve in a fresh authorized
transaction after a duplicate-key race. Worker priority considers up to 100 latest requested payments,
with ordinary periodic cursor reconciliation retained for older requests. Scheduling never resets
lastCheckedAt or changes collection/risk state. Existing merchant/lease/receipt fences remain intact.
A 202 response means intent accepted, not verified collection; inspect canonical payment afterward.

Returns owns requested-claim persistence and coordinator. Orders owns its canonical balance models and
exposes only transactional ordinal selection. Stable purchased-unit entitlement is never recalculated
from catalog prices. Request/each line protection/audit commit or roll back together. Required current
ownership/eligibility is an injected trusted capability; synthetic fixtures are not real policy approval.
P08-001 enables no public claim route. Window rules, customer/guest HTTP flow, rejection/release,
approval, private-media attachment, inspection/restock and payout remain their later owning tasks.
Evidence arrays are intentionally empty until that separately authorized attachment path exists.

## Verification

Environment: local Node/npm with isolated MongoDB 8.0.16 replica sets, local HTTP and compiled
child-process fixtures; gateway/provider behavior uses controlled doubles. No `.env` read or edited.

| Command | Observed result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before compiled bootstrap tests |
| `npm run api:generate --workspace=backend` | Four artifacts generated; 95 implemented/69 planned operations |
| `npm run test:contract --workspace=backend` | Passed: 108 and four artifacts current |
| `npm run test:unit --workspace=backend -- payment-risk.test.ts payment-reconciliation.test.ts orders.test.ts checkout-intent.test.ts` | Passed: 12 across four files |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-monitor-claim-regression.json checkout-quote.test.ts orders.test.ts payment-records.test.ts payment-initiation.test.ts guest-access.test.ts` | Four suites Passed: orders 23, records 15, initiation 25, guest 19; checkout had 132 Passed/one status assertion failure |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-monitor-claim-checkout-final.json checkout-quote.test.ts` | Final checkout suite Passed: 133 after assertion correction; 215 distinct current integration cases across both runs |
| `npm run lint --workspace=backend` | Passed: 359 files |
| `npm run lint:boundaries` | Passed: 339 files, zero errors |
| `npm run format:check` | Passed: 523 files |
| `npm run lint` | Passed: 676 files, 1452 local links, zero errors |
| Task register/checkbox audit | Passed: 210 tasks, all checkboxes match status |
| `git diff --check` | Passed |

Initial focused runs found incorrect fixture assumptions (customer/suspended sessions return 401,
protected attempt updates require current-state filter) and a real list-pagination envelope defect.
Fixtures and route were corrected without weakening guards. Added BSON duplicate-line/quantity checks,
partial refund/later-line rollback and compiled bootstrap coverage. One retry invocation used an
incorrect working-directory path and lacked local-listener permission; no tests executed there.
The final permitted suite passed. Formatter mismatches were corrected and format check passed.
Ignored JSON files under test-results are local replaceable artifacts, not committed release evidence.

Not Run: live merchant/provider/email, real qualified claim policy/eligibility, staging deployment,
frontend/browser and integrated milestone acceptance. No dependency/package or existing financial
schema migration was added. The new returnRequests collection needs explicit owned local/test
bootstrap; runtime neither migrates nor repairs drift. Restore requests, unit balances and audit as
one consistent set. Do not delete requests or reset financial history to force availability.

## Executor review

Reviewed diff for owner/import direction, private models, authorization, replay/concurrency, timestamp
integrity, monetary/quantity caps, secrets and unrelated changes. Executable boundary and route-parity
checks pass. Existing accepted runtime behavior is retained; owner acceptance is recorded below.

## Independent acceptance

The project owner explicitly accepted both submitted tasks on 30 October 2026:
“দুটোই গ্রহণ করছি—Done করুন”.

- **P07-018: Done** — accepted payment monitoring and audited reconciliation APIs with recorded checks.
- **P08-001: Done** — accepted private requested-claim and canonical quantity protection foundation.

Acceptance covers the submitted local/test scope and recorded verification. It does not accept
future claim eligibility/lifecycle/media attachment, deployed provider/legal/staging gates or milestones.
