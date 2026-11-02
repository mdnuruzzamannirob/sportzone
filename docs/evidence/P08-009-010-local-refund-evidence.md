# P08-009 / P08-010 — Local refund status and manual evidence checks

**Current status: Package D P08-009/010/011 Done.** [Completion and consolidated verification](#package-d-completion) supersede the historical local-only limits below.


Date: 31 October 2026 (Asia/Dhaka). Executor: Codex. Prior P08-007/008 work was uncommitted at turn
start and subsequently appeared in commit `b046550`; it was preserved, and this task did not create
that commit. Full task status: **Blocked**. The owner requested the next batch and previously
requested safe local work with blocked prerequisites. No task, legal policy, provider, application
stage or milestone acceptance is inferred.

| Task | Local subset | Remaining work and acceptance |
| --- | --- | --- |
| P08-009 | SSLCOMMERZ status query validates provider/bank references and optional merchant echo, strips other fields and returns a matched report; read-only investigation and retry assessment never authorize a payout | Accepted P08-008, durable attempt/receipt identity and amount binding, qualified provider timestamp and final-state evidence, job replay/reconciliation, protected retry transaction, merchant sandbox evidence and independent acceptance |
| P08-010 | Private read-only manual evidence gate checks current admin before/after external verifier; binds reserved obligation/source/attempt, amount, transfer, method and optional required consent, and detects revision/identity changes | Accepted P08-007/P06-012, real canonical reserved snapshot/source and consent/evidence authorities, audited atomic completion and commitment transitions, actual manual payout proof, independent acceptance |

The gateway report is not a completion decision. `processing` is pending, `cancelled` remains an
investigation, and `refunded` still needs independent durable identity/amount/time verification:
the documented response does not supply the amount and its timestamp lacks a qualified timezone.
A no-payout retry assessment yields only `retry_review_required`, never permission to dispatch; proof
must bind the same refund/source/attempt/amount, be later than the latest operation, and have no
other open attempt. A real current-admin, durable CAS recheck remains mandatory.

Manual verification uses a **trusted injected** reserved-snapshot reader and independent transfer
verifier, not browser assertions. It requires a verified source amount, source and obligation reserved
amounts, active attempt, appropriate timestamps, and consent evidence where required. It checks
same admin and an identical revision-bound snapshot after the external evidence read; errors are
sanitized and masked destination data is not returned. There is no runtime reader/verifier wiring or
HTTP endpoint, and no refund, attempt, source, order or audit record is changed. In integration
tests the admin session is real and the reserved source/evidence/consent facts are explicitly synthetic.
No synthetic evidence establishes a real collection, consent or payout.

Provider status protocol was checked against [SSLCOMMERZ v4 Refund API](https://developer.sslcommerz.com/doc/v4/#refund-api)
on 31 October 2026. Queries use the documented authenticated GET endpoint and return redacted facts;
transaction-boundary checks prevent provider calls within MongoDB transactions. No real sandbox/live
request was sent. No automatic retry, new provider reference, financial write, provider secret or raw
personal data is returned or logged. No package, collection, migration or runtime activation was added.

References: PRD FR-18/33; Architecture §§6/10.5; Database §§8/9/12.5; API §13.3;
Testing RFD-02/03/04/06/07/08 and §15.5. Refunds owns the local evidence/decision checks; provider
code owns protocol and cannot import refund domain logic. No frontend imports backend runtime/models.

## Actual verification

Environment: Node 24.20.0 / npm 11.19.0; isolated MongoDB 8.0.16 replica set; current local admin
sessions, synthetic reservation and evidence authorities, and synthetic provider fetch. JSON output
under ignored `test-results` is replaceable local evidence, not a real merchant/payout acceptance.

| Check | Result |
| --- | --- |
| `npm run build --workspace=backend` | Passed |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run test:unit --workspace=backend -- sslcommerz.test.ts refund-investigation.test.ts refund-calculation.test.ts` | Passed: 108; gateway report and retry assessment include mismatch, timeout, unknown, evidence and proof time cases |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'manual payout evidence local\|refund status local\|refund transport local' --reporter=default --reporter=json --outputFile=../test-results/refund-evidence-local.json` | Passed: 7, 209 outside selection; authorization, zero-source denial, binding/consent, stale snapshot, revocation, sanitization and transaction guards |
| `node --test --test-isolation=none --test-name-pattern='RETURN-BOUNDARY\|REFUND-BOUNDARY' tests/tooling/development.test.mjs` | Passed: three named fixtures, including new provider/refund and private-auth negatives |
| `npm run lint --workspace=backend` | Passed: 408 files |
| `npm run lint:boundaries` | Passed: 373 files, zero errors |
| `npm run format:check` | Passed: 573 files |
| `npm run test:contract --workspace=backend` | Passed: 111; four generated API artifacts unchanged |
| `npm run lint` | Passed: 741 files, 1485 local links, zero errors |
| Task status/checkbox audit and `git diff --check` | Passed: 210 tasks, 107 Done, 85 Not Started, 16 Blocked, 2 Deferred; boxes consistent and diff whitespace clean |

The original node test pattern without `--test-isolation=none` reported a file pass without proving
that individual matching fixtures ran. The corrected command above ran all three actual fixtures;
prior related evidence records carry the correction. No durable reconciliation/retry worker,
confirmed payout transaction, legal/consent approval, external provider evidence, frontend, backend
stage or integrated-release verification was run.

## Package D completion

**2 November 2026 · P08-009/010/011: Done.** Executor and implementation reviewer: Codex.
Owner request: “Package D fully complete and done koro.” Completion uses the owner-approved ordinary
engineering convention in Tasks §2. This section supersedes the historical local-only limits above;
no separate reviewer identity, actual payout, live merchant qualification or milestone acceptance is invented.

At task start, Package B/C work was staged. During execution it appeared in owner commit `cc58fd4`
(parent `d33071b`); that work was preserved and this task did not create/stage/publish that commit.
The D implementation is the subsequent source/working-tree delta relative to `cc58fd4`. No actual
.env, deployed database, customer account or third-party service was changed by this work.

### Completed behavior and ownership

| Task | Engineering outcome |
| --- | --- |
| P08-009 | Canonical recovery reauthorizes current admin around external investigation; exact original refund/order/source/attempt/amount/method/merchant/bank/merchant-ID bindings and qualified independent time/amount proof precede completion. Provider status alone remains uncertain/reserved. Lost acceptance references recover through independently bound artifacts plus provider query, without resending payout. Completion and verified no-payout release settle exact source/order/unit/delivery counters with refund/attempt CAS, audit and outbox in one transaction. Explicit retry reacquires capacity, creates the next unique attempt only after verified terminal nonpayment, and preserves original approval/timing/history. |
| P08-009 | The scheduled runner reuses recovery, due timestamps, bounded batches, resumable cursor and existing durable lease owner/expiry fences; it never dispatches payout. Invalid proof is deferred with investigation metadata, allowing other cases to progress. Expired/competing owners cannot settle; restart is safe. Aging unknowns remain held and visibly require investigation. |
| P08-010 | Manual bank/bKash/Nagad/Rocket admission records intent before the operator's actual transfer. Confirmation loads a protected independent original artifact, verifies digest, exact method/amount/reference/masked destination/qualified timestamps and applicable approved consent reference/digest/time, then reauthorizes. Request fields/screenshots are not financial evidence. Confirmed manual transfer references are unique; duplicates roll back without a second payout fact. Qualified gateway failure can use a protected consented manual fallback under the original refund policy, keeping original approval/timing and old gateway attempt. |
| P08-011 | Reservation/cancellation approval, processing, rejection, verified failure, retry and completion create immutable causal audit plus transactional refund status intents. Status-specific outbox identities deduplicate while retaining both approval and processing from one retry. Return and refund renderers are composed in the separately enabled standard worker. Delivery verifies original recipient, immutable status audit and, for completed messages, completed refund plus matching confirmed attempt. Tampered intent sends nothing. Return completion never asserts refund payout. |

Refunds owns recovery/proof validation and its persistence; Payments owns class-specific funding
settlement/projection; Orders owns ordinal counters and original immutable entitlements. Underfunded
COD completion remains Pending; correction payout does not change merchandise refund progress;
fulfillment snapshots/history are retained. Transactional per-ordinal writes preserve immutable identities,
and negative held-counter increments use guarded owner writes plus strict BSON validators. Refunds
never restocks inventory. The job imports domain capabilities, not models. Notifications owns its outbox,
renderer and compatible validator; Audit exposes bounded safe status facts without proof or actor data.
New executable boundary negatives enforce these directions. No new package, infrastructure or collection.

The existing admin routes now include review, reconcile and manual-confirmations; payout-attempts
supports controlled gateway retry/manual admission. Strict bodies, current admin, Origin/CSRF and keyed
payload checks apply. Initial correction review stores its replay receipt in the approval transaction,
so a changed key payload conflicts even after promotion. Histories include safe public status facts and
bounded attempts/investigation codes; bank references, transfer evidence and destinations remain private.

### Activation, migration and recovery

- Existing `REFUND_OPERATIONS_ENABLED` remains explicit local/test with admin authentication; no
  deployed activation is implied. `REFUND_PAYOUT_EVIDENCE_FILE` is an owner-controlled regular JSON
  registry of exact refund/attempt IDs, relative original artifact paths and SHA-256 byte digests.
  Unsafe permissions/symlinks, duplicate identities, artifact drift, ambiguous timezone strings and
  mismatched facts fail closed. Protected records must be genuinely qualified independent settlement
  evidence; merely configuring a path/string/digest does not make payment true.
- Explicit `bootstrap-refunds.mjs` retains known refund migration, provisions the new unique manual
  transfer-reference index, migrates the exact prior return notification validator additively, and
  provisions existing job leases. Unknown drift/duplicates stop activation, not history deletion.
  `migrate-notifications.mjs` remains supported. Application startup performs no repair.
- `reconcile-refunds.mjs` requires explicit local/test worker activation, bounded batch/lease/poll
  settings and canonical original-merchant sandbox settings. It uses protected proof if configured,
  reports aggregate counts only, never impersonates an admin or initiates payment. Unknown/bad cases
  retain holds; investigation markers clear only after qualified recovery. Missing provider IDs are
  investigated/recovered, never replaced by a new payout identity to “try again.”
- `AFTER_SALES_NOTIFICATIONS_ENABLED=true` enables both guarded return/refund renderers only in
  local/test; sender safeguards and test-recipient override remain. Default workers skip these events.
  Preserve attempts, funding/unit counters, audits, outbox/leases and original evidence together on
  restore; rollback uses a compatible binary, without dropping validators or financial records.
- Exact procedure and artifact fields are maintained in Operations (refund bootstrap/outcome evidence
  and notification worker sections); API §13.3 and Database §§9–10 own the matching contracts.

### Observed verification

Integration tests use isolated disposable MongoDB 8.0.16 replica sets, actual transactions/indexes,
real temporary HTTP servers and compiled runners. All provider/cash/settlement/email records and
adapters are explicitly synthetic fixtures; no real merchant, transfer or email delivery was exercised.
Vitest commands run from `backend`; npm/tooling commands run from repository root.

| Command / check | Observed result and local artifact |
| --- | --- |
| `../node_modules/.bin/vitest run --reporter=dot --reporter=json --outputFile=../test-results/package-d-final-unit-all.json` | Final **806 Passed**, 49 files; supersedes earlier 805-case run after adding strict timezone coverage |
| `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts tests/integration/orders.test.ts tests/integration/payment-correction-migration.test.ts tests/integration/notifications.test.ts tests/integration/customer.test.ts tests/integration/guest-access.test.ts tests/integration/payment-records.test.ts tests/integration/authorization.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-d-integration.json` | **446 Passed**, eight affected suites; includes actual additive schema/index migration, compiled bootstrap/worker activation/refusal, financial rollback and auth/notification consumers |
| `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-d-final-checkout.json` | **313 Passed** after localized review-command correction; unchanged other-suite inputs retained under Testing §15.5 |
| `../node_modules/.bin/vitest run --config vitest.integration.config.ts tests/integration/checkout-quote.test.ts -t 'Package D:' --reporter=dot --reporter=json --outputFile=../test-results/package-d-final-focused.json` | Final **23 Passed**, other 295 cases intentionally unselected, covering final new recovery/notification/provider branches after localized changes |
| `../node_modules/.bin/vitest run tests/unit/refund-evidence.test.ts tests/unit/notifications.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-d-final-unit.json` | **32 Passed** for protected evidence/timezone parsing and notification configuration before final full unit rerun |
| `../node_modules/.bin/vitest run --config vitest.contract.config.ts --reporter=dot --reporter=json --outputFile=../test-results/package-d-contract.json` | **112 Passed**, including explicit review/reconcile/manual-confirmation route parity; canonical inventory remains 166 |
| `node --test --test-isolation=none tests/tooling/ci.test.mjs tests/tooling/development.test.mjs` | **80 Passed**, including new recovery/job/notification private-persistence negatives |
| `npm run typecheck --workspace=backend`; `npm run build --workspace=backend`; `npm run lint --workspace=backend`; `npm run lint:boundaries` | **Passed**, 449 lint files and 406 boundary files, zero boundary errors |
| `npm run api:generate --workspace=backend`; `npm run api:check --workspace=backend` | **Passed**, four current artifacts |
| `npm run test:smoke --workspace=backend` | **Passed**, compiled startup, safe defaults, restricted readiness and graceful shutdown |
| `npm run test:security -- --scope=backend` | Final **Passed**, no findings and no dependency advisories; sanitized `test-results/security.json` |
| `npm run format:check`; `git diff --check` | **Passed**, 614 formatting-inventory files; final repository/task audits recorded below |

The final 23 cases cover manual/gateway completion, provider status insufficiency, amount/method/
consent/client-time negatives, release and explicit retry, pre-dispatch rejection, outbox rollback,
worker checkpoint, concurrent confirmations, manual transfer reuse, stale/delayed proof, lease
exclusion/expiry, bad-case fairness, verified/tampered email intent, mid-verification suspension,
manual retry status intents, partial-COD projection, actual configured protected-artifact startup,
review replay across correction promotion, all three manual wallets, recovered lost gateway response,
and qualified consented manual fallback with retained timing/history. Tests are not summed as though
reruns were distinct cases; earlier broad inputs are reused only where unchanged.

Development checks exposed bounded-integer setters rejecting negative increments and Orders rejecting
whole-coverage replacement. Settlement now uses guarded owner raw counter writes and permitted
per-ordinal paths, retaining BSON/cap/CAS checks. Fixture reference collisions, unknown mock input types,
current-auth error expectations and format drift were corrected before passing reruns. Concurrency and
notification-failure checks prove actual rollback; they are not mock-only acceptance.

Security initially flagged the ordinary phrase `funding/quantity/concurrency` in an earlier C evidence
narrative. Private diagnostics confirmed that exact 28-character prose value, not a credential. The
only exception added is an anchored literal-value expression; no file, rule, commit or scan is disabled.
A same-document synthetic-credential control still produced a finding, while prose alone produced
none; complete history/current-tree scanning then Passed. No sensitive scanner match was printed.

Implementation review covered actual owner/import boundaries, current authorization around external
calls, immutable identities, source/order/unit/delivery caps, manual-reference uniqueness, retry/lease
races, outbox proof/deduplication, compatibility, logging and recovery. No irreversible action or actual
payout was performed. Existing release tasks retain real merchant capability, consent/legal/source
qualification, deployed scheduler/email and launch acceptance. No application closeout or M1–M8 gate
is accepted. Package E customer history/review and F/G work retain their own scope/status.

Transition: P08-009/010/011 **Blocked → In Progress → Done** under ordinary engineering acceptance.
Final register: **210 tasks; 122 Done, 9 Blocked, 77 Not Started, 2 Deferred**.

Source/test/script/API/tooling plus sanitized activation/scanner configuration snapshot relative to
`cc58fd4`: 37 sorted changed/untracked paths under backend/src, backend/tests, backend/scripts,
backend/api and tests/tooling, plus .env.example, .env.staging.example and .gitleaks.toml; each encoded
as path + NUL + bytes + NUL, excluding documentation:
`27bcb6c84e315e5da99fdb6524ecbaff885b74f4815ccc381ef06540a0693944`.

Final closeout: repository/document checks **Passed** (788 files, 1546 local links, zero errors);
`npm run format:check` **Passed** (614 files); `git diff --check` **Passed**. Inline register audit
confirmed 210 unique IDs, checkbox/status parity, 122 Done / 9 Blocked / 77 Not Started / 2 Deferred,
and Done immediate prerequisites for all three D tasks. Final source review also verified that the
compatibility-helper cleanup changed comments/import arrangement/formatting only; no behavior changed.
Final observed artifact success/zero-failure counts and the redacted security result were rechecked.
