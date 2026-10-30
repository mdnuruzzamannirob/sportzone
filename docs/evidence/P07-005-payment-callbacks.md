# P07-005 — Separate payment callback transport

Status: **In Review**, independent acceptance pending. Executor: Codex, 29 October 2026.
Revision: working tree based on `29e95d8123443e48e359c7014eadd24c90a4ef74`.
Sources: FR-12; [API §12.3](../API.md#123-ipn-browser-returns-and-independent-verification),
[Database](../DATABASE.md), [Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases),
[Operations](../OPERATIONS.md). Provider protocol reference: [SSLCOMMERZ v4](https://developer.sslcommerz.com/doc/v4/).

## Delivered scope and boundaries

Payments owns the strict callback schemas, transport and normalized untrusted claim boundary. Exact
POST `/api/v1/webhooks/sslcommerz/ipn` and GET/POST
`/api/v1/payment-returns/sslcommerz/{success|fail|cancel}` accept bounded URL-encoded forms before the
normal JSON parser. No broader browser Origin/CSRF exception, session minting or credentialed CORS
access is added. Normal initiation/status remain subject to their owning authorization protections.

Browser returns send an empty-body 303 to explicit canonical HTTPS targets on the configured storefront
origin, discarding provider form/query values. They never invoke the financial processor. IPN rejects
invalid, duplicate, oversized, compressed, unknown-field or mismatched-merchant input. Known sensitive
fields are bounded then discarded before processing or audit. Neither browser hints nor claimed VALID,
FAILED or CANCELLED are financial authority.

The service records only keyed security fingerprints of selected claims/reasons through Audit's service.
These facts are neither receipts nor reconciliation jobs. Auth owns a narrow callback rate capability
using its existing canonical quota persistence, a separate HMAC namespace, real socket peer and fixed
minute. No private auth persistence import remains in Payments or root composition. Boundary checks
pass; controllers do not import financial models, shared code does not depend on business modules and
provider protocol stays separate. No package, collection or CI inventory change was needed.

A separately composed independent processor can acknowledge plain-text `OK` only after its awaited
`committed` result. Missing, pending, thrown or failed processing returns retryable 503. At the original transport-only revision, server wiring
supplied no financial processor, so all well-formed IPNs remained 503. Tests inject synthetic
processing outcomes, including a committed audit fact and a delayed promise; these prove transport
ordering, not independent provider verification or financial ingestion. P07-006/007/012 retain those
responsibilities. Transaction exclusion is enforced before processing.

Callback activation defaults off and is restricted to local/test sandbox in configuration and root
composition. Explicit return URLs and rate limit are required. Additive compiled bootstrap provisions
existing audit/quota protection, preserves facts, refuses drift and deployed environments before DB
access. Startup never provisions persistence. Operations documents activation, privacy, retry and
rollback. API, Database and Testing contracts plus generated OpenAPI/Postman artifacts are synchronized.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, Vitest 5.0.5; isolated MongoDB 8.0.16 replica sets and local
HTTP/Supertest. No real provider, credentials, collection or payout call was made.

| Command / selection | Result |
| --- | --- |
| `npm run test:unit --workspace=backend -- payment-callback.test.ts` | Passed 22 tests |
| Backend integration runner, `payment-callback.test.ts` | Passed 19 tests; local `test-results/payment-callback.json` |
| Same runner, `checkout-quote.test.ts -t hosted-init` | Passed 6 selected tests, 50 not selected; local `test-results/payment-callback-initiation.json` |
| `npm run test:contract --workspace=backend` | Passed 104 tests; four artifacts verified, 91 implemented/73 planned operations |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed; compiled additive bootstrap exercised against isolated DB |
| `npm run lint --workspace=backend` | Passed, 331 files |
| `npm run lint:boundaries` | Passed, 317 files, zero errors |
| `npm run format:check` | Passed, 495 files |
| `npm run lint` | Passed, 642 files and 1408 local links, zero errors |
| `git diff --check` | Passed |

Dedicated integration commands, from backend:
`../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/payment-callback.json payment-callback.test.ts` and the same runner with
`--outputFile=../test-results/payment-callback-initiation.json checkout-quote.test.ts -t hosted-init`.
Reports are local generated artifacts, not committed release evidence.

Negative coverage includes all three browser outcomes without invoking even an injected processor;
no financial documents or sessions; normalized sensitive-field exclusion; no early acknowledgment;
duplicate fingerprint deduplication; wrong merchant/query/JSON/form bounds; real-peer rate admission
ignoring forwarding headers; missing quota/audit protection; processor retry/failure; root default-off;
normal authenticated customer/proven guest CSRF/ownership isolation; transaction exclusion; repeated
bootstrap preserving evidence and valid production configuration refusal.

An initial private quota persistence import failed the executable boundary check and was replaced by
the owning Auth service capability. Formatter drift was corrected without semantic changes; concurrent
Cloudinary import edits were preserved. A restricted contract run failed loopback `listen EPERM` and a
subprocess output assertion; the full suite subsequently passed with required local listener access.
No failed verification remains unresolved. Broader backend regression, frontend/browser UI checks,
staging/production rollout, actual merchant retry/ACK qualification and independent provider verification
were **Not Run** in this backend transport package. No milestone or external gate is accepted.

## Recovery and review

Disable callback composition to roll back local transport; preserve audit/quota and all existing
financial history. Do not treat lack of callbacks or browser failure as noncollection and do not blindly
retry charges. Deployed activation remains refused until financial verification, durable replay/recovery
and provider qualification are reviewed. Independent project-owner acceptance is pending.

## Current review — 30 October 2026

The original scope/results above remain historical. Accepted P07-006–013/016 now provide the
local/test independent verification, durable receipt processing, allocation and notification path.
Root composition selects the real verifier/processor when the verification gateway is supplied;
missing processing or unresolved Pending still returns retryable 503. Browser returns never invoke
that processor. Current checkout receipt/race tests and callback isolation tests are included in the
combined pending-review regression. Staging/provider qualification remains separate.

## Combined review verification — 30 October 2026

Re-reviewed current implementation at `df3b602` for the pending P06-006/007/008/009/010/015 and
P07-005 acceptance. Dependencies implemented in later accepted payment tasks are now present;
original revision-specific limitations above remain historical, not current integration claims.
No runtime mutation, dependency change, external provider call or secret read was needed.

| Current command | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed before compiled-entry integration tests |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed: 332 files, zero errors |
| `npm run test:unit --workspace=backend -- checkout-intent.test.ts checkout-quote.test.ts inventory-allocation.test.ts coupon-allocation.test.ts guest-access.test.ts payment-callback.test.ts delivery-deadline.test.ts media.test.ts container-health.test.ts` | Passed: 96 tests across nine files |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts --reporter=default --reporter=json --outputFile=../test-results/pending-review-closeout.json checkout-intent.test.ts checkout-quote.test.ts inventory-allocation.test.ts coupon-allocation.test.ts guest-access.test.ts payment-callback.test.ts delivery-deadline.test.ts media.test.ts` | Passed: 242 tests across eight files |

Environment: local Node/npm, isolated transaction-capable MongoDB replica sets, controlled gateway/
email/media doubles and local HTTP/compiled child-process fixtures. The ignored JSON report is local
execution output. Integration counts: checkout 124, guest 19, intent 14, coupon 28, callbacks 19,
media 19, inventory 16, deadline 3. Relevant cases cover concurrent same-key replay and allocation,
COD Pending/no fabricated collection, immutable shared online holds, expiry/payment races and fencing,
single-use scoped guest proof, browser/IPN isolation, actual receipt-processing integration, migration
and compiled entries. Existing valid contract/lint/format results from the preceding unchanged-code
batch are reused under Testing §15.5; frontend/full-release checks were not rerun.

Independent acceptance of each pending task is still required. Live provider/email, qualified
compliance and staging evidence remain separate; this regression does not clear blocked tasks.

## Independent acceptance — 30 October 2026

Current status: **Done** for P07-005. The project owner independently accepted
the submitted current implementation and review evidence: “সাতটিই গ্রহণ করছি—Done করুন”.
Earlier In Review statements describe their historical revision.

- **P07-005: Done** — individually included in the explicit seven-task acceptance.

Acceptance covers recorded local technical behavior and verification, including the current combined
96-unit/242-integration review. It does not approve external provider/email qualification, legal
applicability, staging deployment or milestones.
