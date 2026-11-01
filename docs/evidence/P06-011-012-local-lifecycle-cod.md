# P06-011 / P06-012 — Private lifecycle and COD capabilities

Date: 30 October 2026 (Asia/Dhaka). Executor: Codex.
Status: **Blocked** for full task acceptance; authorized local implementation/tests completed.
No task checkbox or milestone is accepted by this record.

## Authorization and scope

After the owner requested the next two tasks, the dependency audit found no Ready backend task.
P06-011 depends on blocked P06-003; P06-012 depends on P06-011. The owner explicitly selected:
“Local implementation/tests এগিয়ে নাও”, after disclosure that absent qualified sign-off keeps
confirmation blocked and prevents Done. This is implementation authorization, not legal/task acceptance.

References: FR-12/14/16/26/29; API §§11.3/12.5, Database §§7.2/8.7, Architecture §§4–6,
Implementation Plan §3.1 and Testing §§10–11/15.5. No prerequisites were removed or split into an
invented accepted task. No real approval, secret, cash evidence or deployed provider call was used.

## Separate local outcomes

| Task | Implemented private capability | Observed local checks | Remaining acceptance |
| --- | --- | --- | --- |
| P06-011 | Current admin transitions with audit replay, real-event deadlines from immutable basis, qualified approval guard, payment/risk and exact committed stock/coupon fences, atomic whole-order dispatch and bounded history | Missing approval denial; forbidden skips/cancellation; historical key/current projection; exactly-once concurrent dispatch; downstream failure stock rollback; monotonic clocks; online funding; independent delivery/cash | P06-003 qualified rule/sign-off, actual protected approval adapter, HTTP/root authorization/CSRF/DTO activation and independent review; later cancellation/final non-delivery and notification tasks retain ownership |
| P06-012 | Auth-before/after protected evidence read, strict source binding/time, globally stable internal COD reference, unique source receipt, partial/excess accounting, unreserved corrections and audit | Missing/mismatched evidence; unconfirmed denial; partial/final/excess; same-key/source deduplication; cross-order reference denial; identity revocation; risk retention; late correction rollback; different-admin cash/dispatch race | Accepted P06-011, real evidence source/verifier, HTTP/root contract integration and independent review; no actual receipt/payout or live cash verification |

There are **17 new integration cases** named `lifecycle/COD local` in the existing checkout suite.
These use synthetic protected approval/evidence capabilities. Ordinary startup has no composition,
route or flag enabling these services. Existing public API artifacts remain 95 implemented/69 planned.
No migration, collection, package, provider integration or frontend was added.

## Ownership and review

Orders owns lifecycle, immutable snapshots/history and the COD order fence. Payments owns funding/risk
fences and COD source collection/aggregate decisions; Checkout coordinates Inventory/Coupon capabilities
without importing their models. Coupon access now exposes immutable coupon identity for exact matching.
Only Orders consumers use its allocation-binding helper. Controllers/root wiring were not changed.
Shared infrastructure has no business dependency; executable boundaries pass.

Qualified approval is required in the confirmation transaction; the adapter is responsible for real
protected evidence and must perform no external provider call there. Orders computes deadline dates
itself using the existing policy service, rather than trusting injected dates. Persisted Mongoose
basis is converted to plain immutable snapshot data for strict schema evaluation. Pending admin_review
can clear only through qualified confirmation after funding/capacity checks; risk/shortfall holds
remain blocking. No synthetic 14-day rule is installed in runtime.

Shipping validates the whole canonical committed generation and redeemed original coupon, then
decrements physical and committed once in the same transaction as order status/history/audit.
Delivery neither writes Paid nor creates collections. Ordinary cancellation/final non-delivery is
refused here; its custody/release/refund paths stay in their owning tasks.

COD evidence verification occurs outside MongoDB transactions, after current admin authorization,
then reauthorization and order/payment fences protect commit. Proof must bind original reference,
payment, integer amount, evidence reference, digest and actual collection date. Globally stable
`cod:<SHA-256(reference)>` under internal account prevents duplicate source credit across orders.
Same-key replay reads existing state before evidence access. Partial funding remains Pending;
full funding becomes Paid, excess/cancelled-order cash is correction, risk remains independent.
Source/counters/correction intent/audit commit together; no payout or stock effect is inferred.

Reviewed actual diff for ownership/import direction, forbidden state skips, monetary/quantity caps,
replay races, secret exposure, timestamp integrity and unrelated changes. No `.env` was read/edited;
no commit/push/deployment or irreversible external effect was performed.

## Actual verification

Environment: local Node/npm, isolated MongoDB 8.0.16 replica sets, controlled provider/approval/
cash-evidence doubles. Existing fixture HTTP flows create canonical orders; new capabilities are
called privately under actual active-admin sessions, never exposed as a new ordinary HTTP API.

| Command | Result |
| --- | --- |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed before final compiled consumer tests |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/order-lifecycle-cod-local.json checkout-quote.test.ts -t 'lifecycle/COD local'` | Earlier focused revision Passed: 13; four further cases included in full final regression |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/order-lifecycle-cod-regression.json checkout-quote.test.ts orders.test.ts payment-records.test.ts inventory-allocation.test.ts coupon-allocation.test.ts` | Passed: 232 across five files (150 checkout, 23 order, 15 record, 16 inventory, 28 coupon); all 17 new cases included |
| `npm run test:unit --workspace=backend -- orders.test.ts delivery-deadline.test.ts inventory-allocation.test.ts coupon-allocation.test.ts payment-risk.test.ts` | Passed: 50 across five files |
| `npm run test:contract --workspace=backend` | Passed: 108, four existing artifacts verified unchanged |
| `npm run lint --workspace=backend` | Passed: 364 files |
| `npm run lint:boundaries` | Passed: 344 files, zero errors |
| `npm run format:check` | Passed: 528 files |
| `npm run lint` | Passed: 682 files, 1456 local links, zero errors |
| Task count/checkbox audit | Passed: 210 tasks, checkboxes match Done status |
| `git diff --check` | Passed |

Initial tests exposed Mongoose subdocument rejection by strict deadline parsing and the required
pending admin-review confirmation handoff; these were fixed with plain persisted basis evaluation
and tightly scoped qualified confirmation. Synthetic proof fixtures initially carried an extra reason
field, and a stale-reservation fixture omitted release evidence; strict validators correctly rejected
them. Fixtures were corrected without weakening schemas. Focused and final regression then Passed.
Two accidental help-command invocations used an incorrect executable path; they executed no tests.
Ignored JSON reports are local replaceable artifacts, not committed production evidence.

Not Run / Blocked: qualified compliance/real approval validation, real COD evidence source integration,
new HTTP/root authorization/CSRF contracts, actual customer/cash/provider operations, deployed staging,
frontend/browser and milestone acceptance. No claim of full P06-011/P06-012 completion is made.

## Recovery and resume

Existing order/payment/stock schemas and indexes are unchanged. Preserve orders/commitments, source
collections, correction obligations, movements and audit as one consistent set; never reset receipt
references, dispatch movements or request keys to retry an unknown outcome. Missing approval/evidence
fails closed and rollback cannot erase verified financial facts. Ordinary runtime stays unchanged.

Resume after the owner supplies qualified P06-003 evidence and an approved protected cash-evidence
source. Implement and test the owning HTTP/root contracts and obtain independent review before Done.
No generic acceptance of this local package substitutes those prerequisites.

## Package A HTTP and root composition — 1 November 2026

Owner requested P06-011/012/013/014 implementation and Done status. Execution started from clean
HEAD `a2ad682` and preserved the committed refund/cancellation foundation. This record supplies local
engineering verification, not missing qualified policy/cash evidence or independent acceptance.
All four tasks remain **Blocked** on their declared prerequisites and external/full-task review.

### Delivered integration

- Orders owns protected admin list/detail and fulfillment-transition routes. Current admin sessions,
  exact admin Origin/CSRF, strict input and mandatory keys protect mutations. Transitions return the
  current canonical AdminOrderDetail; historical identical replay cannot re-dispatch or rewind state.
- Existing owner detail projection is reused inside Orders, preserving historical pricing, item,
  delivery and policy facts. Admin details add bounded latest-generation Inventory allocation and
  opaque Audit references through public same-transaction capabilities; no foreign persistence leaks.
- Admin search supports exact order number, customer, fulfillment and payment filters. Payment status
  is resolved through authoritative Payments summaries before pagination/counting. The cross-domain
  intersection is capped at 1,000 candidates after other filters; larger searches fail 503 rather than
  truncate/count incorrectly. Queries without that filter paginate normally. This query limit and the
  advisory nature of fulfillmentActions require reviewer awareness; actions never authorize mutations.
- COD HTTP delegates to the existing independently protected cash verifier and transactional source
  accounting. CollectionSummary now includes canonical source/allocation/held/completed balances;
  original evidence, private references and digests do not escape. Pending orders cannot record cash;
  delivery alone never marks Paid.
- Root composition accepts explicit approvedDeadline, cashEvidence and cancellationRefund capabilities.
  It joins admin operations, existing customer/guest reads and cancellation requests/decisions. Actual
  composeApplication admission/default-omission is tested; no fake authority/default adapter is added.
  Customer/admin auth and order-read admission are mandatory. Current admission remains local/test;
  ordinary server startup does not supply these authorities or activate deployed commerce.
- Paid cancellation uses the existing real durable refund capability in the composed HTTP regression:
  obligation/attempt/source holds, stock release and audit commit once; customer history and cross-owner
  denial are exercised. Missing cancellation persistence now returns safe 503 instead of raw 500.
- API/Testing/Operations describe the owning projections, HTTP expectations and admission procedure.
  Executable local router inventory and negative ownership fixtures cover the new controller.
  Implemented public registry count stays 98; local-only routes are not relabeled as deployed acceptance.

### Observed verification

Local Node/npm; isolated MongoDB 8.0.16 replica sets, real HTTP and canonical persistence. Policy and
cash proof are explicitly synthetic test authorities. Compiled checks used the final source build.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend` | Passed. |
| `npm run typecheck --workspace=backend` | Passed. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts orders.test.ts payment-records.test.ts payment-correction-migration.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-a-regression.json` | Passed: 330 tests / 4 files, including all 10 new Package A HTTP cases. |
| `npm run test:unit --workspace=backend -- --reporter=dot --reporter=json --outputFile=../test-results/package-a-unit.json` | 39 files / 609 tests Passed unaffected; five listener/subprocess suites had 58 sandbox EPERM failures, rechecked below. |
| `cd backend && ../node_modules/.bin/vitest run tests/unit/app.test.ts tests/unit/auth-rate-limit.test.ts tests/unit/container-health.test.ts tests/unit/identity-contracts.test.ts tests/unit/operations.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-a-unit-listeners.json` | Passed outside listener restrictions: all 172 tests / 5 files. Together with the 39 unchanged passing files, all 781 unit cases verified. |
| `npm run test:contract --workspace=backend` | Passed outside listener/subprocess restrictions: 112 tests; all four generated artifacts current. |
| `node --test --test-isolation=none --test-name-pattern=ORDER-OPERATIONS-BOUNDARY tests/tooling/development.test.mjs` | Passed: new negative route/private-persistence ownership fixture. |
| `npm run lint --workspace=backend`, `npm run lint:boundaries` | Passed: 428 linted files; 391 source files, zero boundary errors. |
| `npm run test:smoke --workspace=backend` | Passed outside localhost restrictions: compiled real DB startup, liveness/restricted readiness and graceful shutdown. |
| `npm run test:security` | Passed outside subprocess restrictions; redacted secret scan and dependency advisory check. |
| `npm run format:check`, `git diff --check` | Passed; scoped format inventory 593 files. |

Final source/test/tooling snapshot is SHA-256
`d2a220e3f059f9dd65416fb1b6185a88bc6935eb0acf47834212be9a73244ccb`:
13 sorted changed/untracked paths under backend/src, backend/tests and tests/tooling, encoded as
path + NUL + bytes + NUL. Documentation is excluded. No commit, push, external migration,
provider call or deployment was performed. JSON test artifacts are ignored replaceable local files.

Initial sandbox integration/contract/unit/security attempts could not open localhost ports or execute
required subprocesses; elevated local verification succeeded. Focused test development also exposed
incorrect fixture SKU/state setup, missing cancellation persistence, missing synthetic admin-recovery
configuration, a duplicate import/type mismatch and incorrect expected 401/409 instead of the existing
403/422 contracts. Those assertions/fixtures were corrected; the final four-file regression is green.
The initial failures remain failures, not purported passing runs.

### Exact remaining acceptance

1. P06-003: real approved rule/version/start basis/effective window and qualified sign-off. The local
   technical acceptance does not supply this authority.
2. P06-012: real protected original cash-evidence source/verifier and operator qualification. A synthetic
   callback or admin request field cannot establish original receipt truth.
3. P06-013: accepted P06-011 and applicable cancellation/refund policy authority, protected cash evidence
   where applicable, reviewed admission/migration and independent acceptance.
4. P06-014: accepted P06-011, reviewed admission and independent acceptance. Existing scoped read safety
   is retained and regressed; no frontend is required for backend acceptance.
5. Full-task independent review and required runtime qualification against the accepted configuration;
   current code cannot honestly mark these tasks Done or enable staging by removing local/test guards.

The owner was asked for existing policy/sign-off and protected cash-source references while engineering
work continued. None is invented in this record. Full acceptance remains pending; notifications/final
non-delivery and refund payout completion remain their separately owned packages.

### Owner follow-up and env inventory

The owner replied that none of the requested policy/sign-off/cash references are available and asked
the agent to add them, noting that secrets are configured. A values-redacted parse of `.env` and
`.env.staging` found the deadline policy-file, policy-approvals-file and required-policy-type keys
empty, with COD admission false. No configured original-cash verifier exists in the code inventory.
Existing provider secrets were neither displayed nor modified. An explicit delivery-rule review draft
and the remaining decision fields are retained in the
[P06-003 evidence](./P06-003-delivery-deadline-boundary.md#package-a-owner-response-and-configuration-check--1-november-2026).
No qualified finding, actual cash receipt, sign-off or admission was invented. This follow-up resolves
the input question as "not available"; it does not clear any acceptance gate.

## Protected authorities and configured startup — 1 November 2026

The owner requested completion without further input requests and delegated Bangladesh-context
research/development. This follow-up implements concrete authority adapters; it does not invent
actual receipts, qualified review or acceptance. Existing staged work was preserved. During work,
the earlier Package A changes appeared in owner-created commit `2158e05`; the executor did not
create or publish that commit. The new authority delta below is relative to that revision.

### Implemented

- Payments verifies operator-controlled original receipt sources and actual artifact bytes against
  SHA-256. It binds payment, original reference, amount, evidence reference and event time. Duplicate
  source identities, future/reversed times, changed bytes, missing/oversized/shared-readable files and
  symlink leaves deny. Browser evidenceRef never supplies a filesystem path. No default data exists.
- Shared bounded protected-file IO has two consumers (configuration and Payments); it imports only
  Node technical modules. File permission/ownership checks precede bounded reads. Proof IO stays
  outside transactions; the existing cash service reauthorizes and atomically commits canonical data.
- Orders verifies confirmation snapshots against the independently configured immutable rule/review
  registry, including timing/digest. A caller cannot relabel a tampered snapshot with another reviewer.
- Explicit local/test startup uses ORDER_OPERATIONS_ENABLED plus protected deadline, COD-source and
  cancellation-authority files. Configured sources are required; wrong environment, auth/read admission,
  future/ambiguous approvals and unavailable source files fail redacted startup. Off remains default.
- Request-bound cancellation policy is loaded before transactions, copied at composition, and matched
  by canonical order/request. Unknown pairs fail closed. Canonical cancellation/refund reservation
  services retain responsibility for funding, policy/consent guards, unit caps and exactly-once effects.
- Refund approval validation moved to an owning pure schema consumed by configuration and both refund
  services, with a compatibility export preserved. No collection, business API or dependency was added.
- Server startup now invokes the real loader/builder, rather than relying only on manually injected
  callbacks. Actual startup on an isolated replica DB with synthetic protected files is verified through
  real HTTP; host provider configuration is excluded from that test and restored afterward.

Operations owns file formats, permissions, restart/revocation and recovery procedure. Env examples
contain blank references and default-off activation only. Actual .env/.env.staging and deployed flags
were not changed; no actual customer/store receipt or third-party system was touched. No expiry,
retention, provider acceptance or actual cash fact is inferred from an integrity check.

### Verification

Local Node/npm; isolated MongoDB 8.0.16 replica sets and actual HTTP. All original receipts, operators
and approvals in tests are labeled synthetic. This validates code behavior, not real cash or legal facts.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend`, `npm run typecheck --workspace=backend` | Passed. Final test additions separately typechecked. |
| `cd backend && ../node_modules/.bin/vitest run tests/unit/cod-evidence.test.ts tests/unit/delivery-deadline.test.ts tests/unit/order-operations-config.test.ts --reporter=dot` | Passed: 26 affected unit cases / 3 files. |
| `npm run test:unit --workspace=backend -- --reporter=dot --reporter=json --outputFile=../test-results/package-a-authorities-unit.json` | Passed: 792 cases / 46 files, with listener/subprocess permission. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts orders.test.ts payment-records.test.ts payment-correction-migration.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-a-authorities-regression.json` | Passed: 331 cases / 4 files, including original-receipt HTTP. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package A protected authorities: real server startup' --reporter=dot --reporter=json --outputFile=../test-results/package-a-startup-authorities.json` | Passed: one later-added actual-startup case; unavailable credentials/default adapters are not substituted. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package A protected authorities: cancellation policy' --reporter=dot --reporter=json --outputFile=../test-results/package-a-cancellation-authorities.json` | Passed: one later-added configured cancellation case; wrong request rolls back, correct authority reserves once and replay has one effect. |
| `npm run test:contract --workspace=backend` | Passed: 112 cases; four generated artifacts current. |
| `npm run lint --workspace=backend`, `npm run lint:boundaries` | Passed: 434 linted files; 395 source files, zero boundary errors. |
| `npm run test:smoke --workspace=backend` | Passed: compiled real DB startup, redacted failure, restricted readiness and graceful shutdown. |

No business behavior changed after the 331-case regression; the two later integration cases were added
and verified separately instead of rerunning unchanged inputs. Together 333 affected integration
cases are covered; this is not a claim that one 333-case command was executed.

Source/test/tooling delta relative to `2158e05`: 13 sorted changed/untracked paths under backend/src,
backend/tests and tests/tooling, path + NUL + bytes + NUL; SHA-256
`1f12bffb019aa43e68d50384cd21a28e487828735e84918427e0ef830a961e0a`.
Env examples/docs are outside that hash. JSON reports are ignored replaceable local artifacts.

Final `npm run test:security` Passed. Repository checks Passed (773 files, 1547 links),
`git diff --check` Passed, and `npm run format:check` Passed (599 files). The first final formatting
check detected two new files needing normalization; only whitespace was corrected and the check
rerun passed. The recorded hash includes that final normalization. No unchanged domain regression
was repeated for formatting-only edits.


### Remaining full-task acceptance

No real protected receipt or qualified applicability record exists in the supplied setup. Research
can locate official rules and inform implementation, but cannot establish receipt of cash, manufacture
a qualified reviewer or independently accept the executor's own task. The source-mapping issue in
P06-003 and reviewed deployed admission remain unresolved. No task/milestone is marked Done.
Earlier descriptions of missing concrete verifier/root wiring are superseded by this follow-up;
real qualification and full acceptance are still outstanding. No repeat request is made for the
records the owner already confirmed unavailable.

## Prepaid mapping follow-up — 1 November 2026

The [prepaid timing implementation](./P06-003-delivery-deadline-boundary.md#prepaid-timing-mapping-implementation--1-november-2026)
now closes the previously recorded software full-payment/hourly-handover mapping gap. Canonical source
reconstruction, frozen confirmation event, quote/order/owner projections and exact-predecessor additive
migration are implemented. Latest backend evidence: 795 unit, 360 affected integration and 112 contract
cases Passed, with a final focused missing-proof rollback assertion. These results supersede earlier
implementation counts for the affected revision, not historical observations or acceptance decisions.
Qualified applicability, actual original-cash qualification, deployed admission and independent full-task
acceptance remain separate factual events; no checkbox or milestone is self-approved.
