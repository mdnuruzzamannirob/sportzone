# P08-003 / P08-004 — Private physical return receipt and inspection

**Current status: Package B P08-002/003/004 Done.** See [completion and verification](#package-b-completion).

The initial record below is historical for its stated revision.


Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Base revision `bb1ec51`; prior P08-002/003
changes were staged at the start and subsequently appeared in commit `160d636` during this work.
Those changes were retained; this work did not create that commit. Status: **Blocked** for full acceptance.
The owner requested the next tasks together and had authorized safe local work where prerequisites are
blocked. No task, provider, legal policy, application stage or milestone acceptance is inferred.

| Task | Local implementation | Remaining acceptance |
| --- | --- | --- |
| P08-003 | Current-admin private single receipt and inspection, bounded to approved ordinals; records received, inspected, accepted and resellable sets, receipt reference and reasons; completion after all approved units are received and accepted; replay and revision fences | Accepted P08-002; additional receipt batches, partial-case resolution and real protected HTTP/CSRF/DTO integration; independent task review |
| P08-004 | Inspection uses canonical delivered order/item and protected claim ordinals; only resellable units gain physical stock, with a unique append-only return movement | Accepted P08-003, complete physical lifecycle and integrated authorization/operational acceptance; independent task review |

Partial receipts are recorded, but further receipt batches and partial-case resolution are not implemented;
unreceived and nonaccepted ordinals remain protected and cannot be completed. Full received and accepted
physical claims may complete after inspection without repeating stock movement. Shortage claims cannot receive, inspect or restock. Approval
or receipt alone does not change stock. No refund obligation or payout is inferred from inspection.
There is no new route, ordinary runtime composition, scanner/provider call or external effect.

References: PRD FR-13/17/32; API §13.2; Database §§9.1/12.5; Architecture §§4–6; Testing RET-02/03/06
and §15.5. This evidence supersedes only the statement that private local physical receipt/inspection
were unavailable in [the preceding local record](./P08-002-003-local-return-eligibility-lifecycle.md);
that record remains historical for its revision and checks.

## Ownership and safety

Returns owns physical receipt/inspection state and evidence, using a current-admin transaction and
revision CAS. Orders supplies the immutable order-item variant and enforces delivered state, current
protected claim ownership and per-unit restock fences. Inventory owns stock mutation and a unique
claim/item movement; its catalog stock capability preserves product boundaries. Same-key replay returns
current state; a different key cannot repeat an already completed inspection. Receipt, ordinal fence,
variant stock, movement, claim state and audit commit together; missing audit readiness rolls all back.
No frontend or controller imports private models. The extended boundary fixture denies direct Returns
imports of Orders, Media and Inventory persistence.

The current strict BSON validator adds physical receipt/inspection ordinal arrays and dates. The explicit
local/test `bootstrap-returns.mjs --lifecycle` upgrade accepts only the exact prior foundation or
review-only validator, checks indexes, retains existing claims and rejects unknown drift. Do not use an
older requested-only/review-only binary with new states; restore claims, ordinals, stock, movements and
audit consistently. No migration against external/user data was run.

## Verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica sets, actual local admin
session and synthetic customer authorization/inspection facts. JSON output is a local replaceable
artifact under ignored test-results. No simulated inspector or provider qualifies real-world receipt.

| Command | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts orders.test.ts checkout-quote.test.ts -t 'claim foundation\|return lifecycle local\|return evidence local\|return eligibility local\|physical return local' --reporter=default --reporter=json --outputFile=../test-results/physical-return-regression.json` | Passed: 31; 206 outside selection. Nine new physical cases cover stock timing, partial/nonresellable quantities, replay, race, authorization, shortage denial and rollback after a stock/movement write; prior local claims and both recognized migration sources also pass |
| `node --test --test-name-pattern=RETURN-BOUNDARY tests/tooling/development.test.mjs` | Passed: one extended negative fixture |
| `npm run lint --workspace=backend` | Passed: 401 files |
| `npm run lint:boundaries` | Passed: 368 files, zero errors |
| `npm run format:check` | Passed: 566 files |
| `npm run lint` | Passed: 731 files, 1476 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 91 Not Started, 10 Blocked, 2 Deferred; boxes consistent; diff whitespace clean |

Not Run / Blocked: additional receipt batches, partial-case resolution, customer/admin HTTP/CSRF flows,
qualified policy/provider evidence, frontend, application-stage and integrated release acceptance.
No test doubles establish real physical custody or deployed merchant/operator qualification.

Initial repository lint found two Markdown table-column errors from unescaped command separators;
corrected them and reran successfully. The missing-audit-index test fails before the mutation; a
separate injected failure after stock and movement writes verified actual transaction rollback.

**Boundary verification correction (31 October 2026):** The earlier focused `node --test` command
reported the test file as passed without establishing that its matching fixture ran. On the later
working revision, `node --test --test-isolation=none --test-name-pattern='RETURN-BOUNDARY|REFUND-BOUNDARY' tests/tooling/development.test.mjs`
explicitly ran and passed the three named return/refund fixtures. This does not change the historical
implementation or independent-acceptance status recorded above.

## Package B completion

**1 November 2026 · P08-002, P08-003, P08-004: Done.** Executor and implementation reviewer:
Codex, under the owner-approved ordinary engineering completion convention in Tasks §2. User request:
“now Package B fully complete and done koro.” This section supersedes the historical implementation
limits below; it does not fabricate a separate reviewer, deployed environment or provider approval.
Base HEAD `dbd5474`; implementation is in the working tree, with no commit/push or actual env mutation.

### Delivered behavior

- **P08-002:** Exact current customer/guest order scope; readonly eligibility and delivered-item
  availability; seven-calendar-day physical window, explicit server-protected per-order/type exceptions
  and separate shortage eligibility. Submission rechecks authority and reserves unit ordinals atomically.
  Client overrides, expired standard claims, undelivered orders, overlapping quantities and changed
  idempotency payloads are denied. Same command replay returns current historical claim without
  reevaluating a now-expired request window. Description and eligibility snapshot persist.
- **P08-003:** Full scoped submission/history and admin review/receipt/inspection/completion HTTP,
  strict DTO/Origin/CSRF/key guards, current-account suspension/revocation checks, partial approval and
  additional cases on released quantities. Physical completion requires every approved unit to be
  received and inspected; accepted units resolve, rejected units release without refund/restock effects.
  Shortage completes without physical receipt/inspection/restock. Creation records the trusted actor.
- **P08-003 evidence:** Existing private Media ledger, validated multipart upload, opaque asset IDs,
  exact owner/order/type/item attachment in the claim transaction, scoped short-lived private retrieval
  and admin exact-claim access. Reauthorize current identity within Media transactions; no nested auth
  transaction. Type/signature/size/pixel/scanner/provider checks, uncertain intent reconciliation,
  orphan cleanup and retention/legal-hold safeguards use the canonical Media implementation.
- **P08-004:** Multiple partial receipt/inspection rounds accumulate ordinal sets. Stable receipt
  reference deduplicates the same parcel even across command keys; aliases retain payload conflict
  protection. Only newly inspected resellable ordinals restore stock. Claim CAS, per-unit restock fence,
  Inventory batch movement and item/transition audit commit together. Original first-batch movement
  identities remain compatible; later batches have distinct server-derived keys. Retry/race cannot
  create a second stock effect.
- **Runtime/migration:** Explicit local/test `RETURN_OPERATIONS_ENABLED` with both identity domains;
  protected optional policy JSON, PRD development baseline otherwise. With `MEDIA_ENABLED` and valid
  canonical settings, actual `startServer` composes Cloudinary/ClamAV. Development deletion capability
  permits only expired unreferenced private claim evidence and honors holds. Default startup omits
  claims; staging/production switches are refused. Explicit `bootstrap-returns.mjs --lifecycle` accepts
  only exact known foundation/review/single-receipt predecessors, verifies indexes and preserves rows;
  repeated upgrade is safe and unknown drift is rejected. No startup schema repair.

Ownership remains Returns → public Orders/Inventory/Media/Audit/Auth capabilities. Controllers contain
no persistence imports; the new executable negative fixture proves these boundaries. API, Database,
Operations and Testing own the corresponding contract/procedure changes. Two explicit private GET
routes bring the canonical operation inventory to 166; generated artifacts and contract fixture agree.

### Observed verification

All commands ran from the repository root unless stated. Mongo tests use isolated, disposable
replica-set-capable MongoDB with real transactions/listeners; provider/scanner results are explicitly
synthetic protocol fixtures, not merchant or antivirus qualification. Local test artifacts are ignored
regenerable files, not committed provider evidence.

| Command/check | Observed result |
| --- | --- |
| From `backend`: `../node_modules/.bin/vitest run --reporter=dot --reporter=json --outputFile=../test-results/package-b-unit.json` | **798 Passed**, 47 files, before final root Media wiring; unchanged cases retained under Testing §15.5 |
| From `backend`: `../node_modules/.bin/vitest run tests/unit/return-operations-config.test.ts tests/unit/media.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-b-final-unit.json` | Final configuration/protocol consumers **12 Passed**, including four return configuration cases |
| From `backend`: `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts tests/integration/orders.test.ts tests/integration/media.test.ts tests/integration/guest-access.test.ts tests/integration/customer.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-b-integration.json` | **381 Passed**, five files; includes existing lifecycle stock/audit rollback, partial approval, eligibility and exact-predecessor migration regressions |
| From `backend`: `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts -t 'Package B HTTP' --reporter=dot --reporter=json --outputFile=../test-results/package-b-http.json` | Final root/current authorization changes **11 Passed**; other 275 file cases intentionally unselected |
| From `backend`: `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/media.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-b-final-media.json` | Final missing-private-asset 404 change and canonical access/retention **19 Passed** |
| From `backend`: `../node_modules/.bin/vitest run --config vitest.contract.config.ts --reporter=dot --reporter=json --outputFile=../test-results/package-b-contract.json` | **112 Passed**; default implemented 98, planned 68 (166 total); explicit local routes separately registered/covered |
| `npm run api:generate --workspace=backend`; `npm run api:check --workspace=backend` | **Passed**, four current artifacts |
| `npm run typecheck --workspace=backend`; `npm run build --workspace=backend`; `npm run lint --workspace=backend` | Final source **Passed**, lint 438 files |
| `npm run lint:boundaries` | **Passed**, 398 files, zero errors |
| `node --test --test-isolation=none tests/tooling/ci.test.mjs tests/tooling/development.test.mjs` | **78 Passed**, including new Returns negative import fixture |
| `npm run test:smoke --workspace=backend` | **Passed**, real DB startup, restricted health, safe configuration and shutdown |
| `npm run test:security -- --scope=backend` | **Passed**, redacted gitleaks report and zero dependency advisories (`test-results/security.json`) |
| `npm run format:check` | **Passed**, 603 files; final documentation/diff check recorded at closeout |

The 11 HTTP cases cover eligibility/replay, ownership/CSRF/injection, delivery/window/exception,
multiple physical batches, rejected-unit release plus additional shortage, evidence attachment/private
URL, concurrent request/receipt/inspection, invalid evidence and expiry, real guest proof/revocation,
suspended actors, and actual default-versus-enabled server startup. Configured scanner/provider wiring
is exercised without external I/O: invalid input rejects before those calls. Missing assets return 404.

During development, tests exposed a receipt preparation race; rereading only allowed current states
before the canonical guarded operation fixed it. A race-test reused receipt keys for inspection and
correctly hit idempotency conflict; distinct operation keys corrected the fixture. Old HTTP expectations
and inventory counts were corrected to the owning contract, not by weakening guards. Type/lint errors
and synthetic numeric Cloudinary-key formatting were corrected before passing reruns. Tooling watch
failed in the listener-restricted sandbox, then all 78 passed with the required local subprocess access.

Source/test/script/API/tooling SHA-256 for 29 sorted changed/untracked paths relative to `dbd5474`:
`8a0a72e235b11311f6ee7166088981fbf335a6382a39067ef71e6e0f4b7010a4`.
Encoding: path + NUL + bytes + NUL for each changed path under backend/src, backend/tests,
backend/scripts, backend/api and tests/tooling. Documentation is excluded. Executor inspected actual
diffs for scope, ownership, current-auth checks, financial/ordinal invariants and compatibility.

### Separate release checks

P11-007 retains real applicability/legal review and approved policy publication; P04-003/P11-008
retain deployed Cloudinary privacy, actual scanner/signature freshness, retention and provider account
qualification. These are existing release checks, not unfinished Package B engineering. No real
external upload, deletion, email, refund, payout, migration of deployed data or staging acceptance ran.
Refund calculation/dispatch/outcomes stay in Packages C/D; claim completion never asserts payout.
Application closeout and M1–M8 status are unchanged.

Transition: **P08-002/003/004 Blocked → In Progress → Done**. Their immediate prerequisites are Done.
Overall: **210 tasks; 115 Done, 16 Blocked, 77 Not Started, 2 Deferred**. No other task was accepted.

Final closeout: `npm run lint` **Passed** (777 repository files, 1546 local links, zero errors);
`npm run format:check` **Passed** (603 files); `git diff --check` **Passed**. Inline register audit
verified 210 unique task IDs, checkbox/status parity, 115 Done / 16 Blocked / 77 Not Started /
2 Deferred, and Done immediate prerequisites for all three Package B tasks. Recomputed source snapshot
matched the hash above. No staged/user changes were overwritten, no commit or push was made.
