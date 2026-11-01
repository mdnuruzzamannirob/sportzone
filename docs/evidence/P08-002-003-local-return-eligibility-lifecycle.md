# P08-002 / P08-003 — Private return eligibility, review and evidence

Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Base revision: `bb1ec51`.
Status: **Blocked** for full task acceptance; the safe local subset below is implemented and verified.
No task, application stage, policy, provider or milestone acceptance is claimed.

## Authorization and separate outcomes

Owner selected “P08-002/003 local কাজ এগিয়ে নাও” after disclosure that P06-011 and independent
acceptance prevent Done. This authorizes local work, not qualified policy sign-off or public activation.
References: PRD FR-17/32, Architecture §§4–6, Database §9.1, API §13, Testing §11/§15.5.

| Task | Implemented local subset | Observed checks | Remaining work and acceptance |
| --- | --- | --- | --- |
| P08-002 | Orders-owned scoped delivered-state/revision fence; inclusive seven-calendar-day physical window; protected policy/exception capability; stable ineligibility reasons; shortage without an invented physical deadline; request-time expiry recheck | Exact deadline ±1 ms, future delivery, invalid clock, protected exception, client override, wrong guest scope, pending order, transaction rollback | Accepted P06-011, actual current-auth/policy composition, qualified policy/rights review, public eligibility/submission integration and independent acceptance |
| P08-003 | Requested → Under Review → Approved → Awaiting Return for physical claims; review rejection; partial approval/release; shortage Approved → Completed resolves approved units; CAS and keyed replay; append-only from/to audit identities | Approve/reject race, conflicting/repeated keys, quantity bounds, held-unit denial, audit rollback, raw BSON guards, physical completion denial | Accepted P08-002; physical receipt/inspection/completion with the owning P08-004 stock integration; real admin/customer/guest HTTP/CSRF/DTO/idempotency composition and independent acceptance |
| P08-003 | Optional private evidence attaches through existing Media capability, bound to owner/order/type/item and ledger ID, atomically with claim/coverage | Private attachment/retrieval, wrong credential, duplicate/type mismatch, missing adapter and ledger/ordinal rollback; existing Media upload/scanner/type/size, scoped access, cleanup/retention regression | Qualified protected Media access/scanner/provider integration and separately authorized upload/claim HTTP path; no external service qualification inferred |

The local subset intentionally cannot receive, inspect, restock or complete physical claims. It cannot
approve/pay a refund, send a refund-completed email or change order fulfillment. Shortage completion
means claim resolution only. Remaining task behavior is not represented by permissive stubs.

## Ownership, persistence and review

Returns owns eligibility calculations, request snapshots, review graph, evidence binding and its CAS.
Orders exposes only canonical scope/fulfillment and exact-ordinal review capabilities; its models stay
private. Media owns upload/scanning, current owner authorization, clean/nonexpired attachment, private
retrieval and retention/cleanup. Existing capability APIs are reused without importing its model into
Returns. Providers are never called inside the claim transaction. Ordinary root wiring has no new
route, policy adapter, worker or activation flag.

Unapproved/rejected units release only when their source claim matches and no refund commitment,
completed refund or restock exists. Approved units remain protected; completed shortage units become
resolved, never available. Historical protected ordinals remain on the original request even after
partial release; future physical operations must use approved ordinals. Current principal checks must
remain inside the owning auth transaction; the local tests' synthetic principal/admin/policy adapters
do not establish deployed authentication or legal qualification.

Strict BSON validation adds only the locally supported states, approval/decision timestamps and up to
five private IDs per item. Approved ordinals must be a protected subset; completed is shortage-only;
approval/completion require stage proof. Canonical model mutation/deletion remains forbidden. An
explicit local/test `bootstrap-returns.mjs --lifecycle` upgrade recognizes the exact prior foundation
validator, preflights indexes, preserves requests and refuses unknown drift; ordinary bootstrap never
silently replaces it. No migration ran against user/external data. Restore claim/coverage/media/audit
together and use a compatible binary; do not downgrade lifecycle history to the requested-only format.

Reviewed actual changes for scope, private persistence/import direction, replay and race behavior,
policy bypass, stale timestamps, stock/payout effects, PII/secrets and unrelated edits. A negative
boundary fixture proves Returns cannot import Orders/Media models and Orders cannot import the
Returns model; public service capabilities remain permitted. No new package, collection, frontend,
credential access, external operation, commit or push was introduced.

## Actual verification

Environment: Node 24.20.0 / npm 11.19.0, isolated MongoDB 8.0.16 replica sets, synthetic protected
policy/admin/guest/media authorities and fake Media provider/scanner. Fourteen new order integration
cases and thirteen eligibility unit cases. JSON output is a local replaceable artifact under ignored
test-results, not production acceptance evidence.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend` | Passed; built before final compiled bootstrap tests |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- return-eligibility.test.ts orders.test.ts` | Passed: 20 across two files |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts orders.test.ts media.test.ts --reporter=default --reporter=json --outputFile=../test-results/return-eligibility-lifecycle.json` | Passed: 56, comprising 37 order and 19 Media cases |
| `npm run test:contract --workspace=backend` | Passed: 111; four artifacts unchanged |
| `node --test --test-name-pattern=RETURN-BOUNDARY tests/tooling/development.test.mjs` | Passed: one focused ownership fixture |
| `npm run lint --workspace=backend` | Passed: 399 files |
| `npm run lint:boundaries` | Passed: 366 files, zero errors |
| `npm run format:check` | Passed: 564 files |
| `npm run lint` | Passed: 728 files, 1473 local links, zero errors |
| Task status/checkbox audit | Passed: 210 tasks, 107 Done, 92 Not Started, 9 Blocked, 2 Deferred; boxes consistent |
| `git diff --check` | Passed |

Initial sandbox integration/HTTP contract runs could not bind temporary ports (EPERM); rerun with
reviewed execution outside the sandbox passed. A negative decrement hit the existing bounded-integer
Mongoose setter; the fix sets checked nonnegative counter values under the same revision CAS rather
than weakening validation. Private Media callback types omit document `_id`; attachment now records
the already-bound canonical asset ID. Fixture API names were corrected from upload/id to the existing
uploadEvidence/assetId contract. A compiled-bootstrap test caught stale compiled validator output;
rebuilt before final regression. Initial lint warnings were fixed. Failed attempts are not counted as
passing results. The initial register audit found stale dashboard totals for two already-Deferred
tasks; current totals were reconciled without changing those task statuses or historical records.

Not Run / Blocked: qualified return-policy/legal sign-off, ordinary current-auth/CSRF claim HTTP,
physical receipt/inspection/restoration/completion, external Media/scanner qualification, frontend,
backend stage closeout and integrated acceptance. Existing Media fake-provider tests do not prove
Cloudinary or antivirus deployment. No full task acceptance is requested while these gaps remain.

**Boundary verification correction (31 October 2026):** The earlier focused `node --test` command
reported the test file as passed without establishing that its matching fixture ran. On the later
working revision, `node --test --test-isolation=none --test-name-pattern='RETURN-BOUNDARY|REFUND-BOUNDARY' tests/tooling/development.test.mjs`
explicitly ran and passed the three named return/refund fixtures. This does not change the historical
implementation or independent-acceptance status recorded above.
