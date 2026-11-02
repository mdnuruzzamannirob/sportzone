# P03-022 / P03-023 — Whole-backend development audit

**Date:** 2 November 2026 (Asia/Dhaka). **Executor/reviewer:** Codex.
**Input revision:** `5fbf8e1` plus this working-tree change.

## Scope and conclusion

The owner requested complete backend development with free-only hosting. This audit compares
all specified API operations, actual Express registrations, executable contracts, complete
application/worker composition, persistence bootstraps and backend regression. Existing Done
labels alone were not used as proof of implementation.

Nine of the 170 specified business operations were absent at the input revision. All nine
are implemented by P03-023. All 63 previously local-only wire contracts are also promoted.
Backend-stage acceptance P03-022 retains real P04-003/P09-011 target qualification and
independent acceptance; executable contract promotion does not activate hosted financial features.
Local fixtures do not prove live cash, merchant activation, hosted scanner or deployment.

## Complete operation inventory

| Category | Input revision | Current implementation | Evidence |
| --- | ---: | ---: | --- |
| Typed generated OpenAPI/Postman operations | 98 | 170 | Owning schemas, executable registry, actual router parity |
| Implemented operations outside generated typed contracts | 63 | 0 | All promoted; explicit local/test activation remains unchanged |
| Specified operations without runtime implementation | 9 | 0 | Full-spec parity fails on missing/duplicate operations |
| Total specified business operations | 170 | 170 | HEAD/OPTIONS transport counted separately |

`planned-operations.json` now records all 170 operations as implemented conditional capabilities.
All have owning typed request/response contracts in OpenAPI/Postman; no absent/planned operation or
untyped placeholder is used. `local-domain-registry.ts` imports the owning schemas for the 63
promoted routes. Their independent registration inventory and actual application tests retain
explicit local/test admission. Generated contracts do not prove hosted availability.

Schema promotion reuses owning runtime query/command validators and strict projection DTOs for
orders, COD/cancellation, claims/evidence, refunds/recovery/history, reviews, customers/privacy,
complaints, notifications, reports and audit. Commerce/review HTTP tests additionally intercept
actual successful responses and validate payload/status/pagination against that same registry.
A negative HTTP fixture proves injected private fields fail without being published.

Promotion exposed a pre-existing refund-group status mismatch: the approved API requires 201,
while runtime returned 200. Runtime and scenario assertions now follow 201, preserving replay
without another reservation. Normalized refund review input key order remains compatible with
historical JSON-based audit digests; the correction-promotion replay regression verifies it.
Initial verification is filterable in the admin outbox, but protected notification retry excludes
this identity proof; resending uses its bounded purpose-specific issuance flow.

## Implemented gap closures

| Operation | Implemented authority and behavior |
| --- | --- |
| `POST /auth/email-verifications` | Ambiguous bounded issuance; active customer/current email/revision; expiring purpose-bound hash and encrypted envelope; reference-only transactional outbox. |
| `POST /auth/email-verifications/confirm` | Atomic single use, exact purpose/email/revision, expiry/replay/race checks; sets verified email without granting a session. |
| `POST /coupons/preview` | Customer or guest context, Origin/CSRF, bounded selections, canonical price/stock/coverage; no hold/redemption. |
| `GET /orders/{orderId}/delivery-events` | Current owner/exact guest; canonical history/deadline without private exception contact. |
| `GET /orders/{orderId}/payments` | Current owner/exact guest; summary and latest 50 allowlisted attempts without provider/session/matching secrets. |
| `GET /admin/provider-receipts` | Current admin, strict pagination/filtering and redacted independently verified durable intake. |
| `POST /admin/provider-receipts/{intakeId}/link` | Protected matching manifest, immutable verified receipt facts, provider/merchant/attempt/order binding; once-only collection/link/audit and late-cancelled correction intent. |
| `POST /admin/payment-collections/{collectionId}/allocate` | Current admin, CSRF, If-Match/key, protected external verification then reauthorization; conserved face amounts, refund floors, aggregate projection and guarded funding/capacity transition. |
| `POST /orders/{orderId}/refund-requests` | Exact owner/guest and CSRF; qualified physical-return/shortage/cancellation/correction/delivery-exception basis; natural/source/unit deduplication without approval or payout. |

New customer refund plans remain requested/not_reserved: no approvedBy/At, financial/unit
holds or payout attempt. Protected admin approval rechecks method/consent, source balance
and entitlement units before atomically reserving and creating the first attempt. Pending
rejection releases no fictional hold. Existing canonical closed-order/correction obligations
are referenced, not duplicated. An owning order fence serializes pending planning; planned
amounts and ordinals are considered without changing actual reserved financial balances.

Matching never treats an admin body as cash proof. The protected manifest must match the
canonical intake digest/face, target, order/attempt and split. Missing authority cannot
mutate funds. Partial funding stays pending and supervised linking preserves risk review.

## Ownership, migration and composition review

Orders owns scoped reads/fences and closed-order qualification; Payments owns private
receipt/collection/attempt persistence; Returns exposes accepted quantities through a narrow
capability; Refunds owns plans/approval/recovery. Controllers contain no model imports.
Executable negative fixtures cover customer request and supervised matching boundaries.

Email verification has a separate disabled-by-default flag and proof configuration. The
existing notification collection accepts its already-specified event through an exact
predecessor additive validator migration; unknown drift is refused. HTTP startup does not
silently migrate persistence. No collection/dependency or real env secret was added.
Database/API/Testing/Operations and sanitized env examples describe the changed behavior.

`backend-completion.test.ts` runs all 17 real local/test operator bootstraps on an isolated
MongoDB replica set, then composes the actual application and all notification families.
It checks all 170 registrations and real scoped reads. External financial/approval/email
adapters throw if called; scanner/media are explicit doubles. This is composition verification.

## Observed verification

Nine-gap snapshot verification (before contract promotion): **Passed**. Source/artifact snapshot: 503 Git-inventoried files under
backend, scripts, tests/tooling and shared, plus package manifests/lockfile and ci-workspaces;
SHA-256 `ec0abd179301825be7277751d2a86c02e1c885e35e72813882c3c7de6f2afdd9`.
Digest input is sorted path + NUL + file bytes + NUL; ignored build/local-secret files and
documentation are excluded. Input commit plus this digest identifies the uncommitted work.

| Command | Observed result / environment |
| --- | --- |
| `npm run ci -- --scope=backend` | Passed all ten checks: 83 tooling, 811 unit, 122 contract and 1,257 integration cases across 52 integration files; lint/types/format/boundaries/build/compiled smoke. Node 24.20.0, isolated transaction-capable MongoDB replica sets and local HTTP; no frontend builds/tests. |
| `npm run test:contract --workspace=backend` | Final 122 Passed after correcting receipt-list activation metadata to local/test; official schema validation, freshness and actual route/spec parity. |
| `npm run api:check --workspace=backend` | Final four generated artifacts verified. |
| `npm run test:security` | Passed final Gitleaks Git/working-tree and dependency advisory scan: zero findings/advisories. |
| `npm run lint` | Passed: 814 files, 1,557 local links, zero errors before final status-only updates; rerun at handoff. |
| `git diff --check` | Passed; rerun at handoff. |

Reports: `test-results/ci/backend.json`, `test-results/database.json`,
`test-results/security.json`. Executor reviewed implementation, migration/activation, actual
diff and generated contracts; P03-023 is Done under Tasks §2. P03-022 remains In Progress.

The nine-gap full integration snapshot has **zero skipped/failed cases**. The preceding full run
had 1,255 Passed / 2 Failed: public requests incorrectly reused pre-closure snapshots after
cancellation/final delivery closure. Added a separate owning post-closure qualifier; the
16-case affected rerun Passed (337 unrelated cases deliberately not selected), followed by
the complete 1,257-case passing run above. The affected-only report is
`test-results/backend-completion-repair.json`. A stale test import then stopped one run at
lint; removing it restored lint before the final consolidated run. No failed run is relabeled.

Historical observations retained:

- Input revision backend CI Passed: 811 unit, 112 contract, 1,234 integration cases.
- Intermediate six-operation snapshot CI Passed: 811 unit, 118 contract, 1,246 integration.
  Later source changes require final verification.
- A later pipeline stopped at lint (control-character regex and missed matching registration).
  Fixed explicit character checks and root registration; lint and actual composed integration
  then passed. That failed pipeline is not reported as a passing consolidated run.
- An earlier commerce run had a wrong guest-denial expectation and an executor rebuild/test
  race removing compiled files. Corrected the expectation to the existing exact-scope contract
  and reran compiled consumers after sequential build; affected reruns passed.
- Focused pending-request approval/rejection: five Passed; email verification: seven Passed;
  protected matching/allocation: three Passed. Final regression also includes all five request
  bases and canonical delivery-closure integration.

## Complete typed-contract verification

All 170 operations now have generated owning wire contracts. **Final post-promotion backend
verification Passed**: `npm run ci -- --scope=backend` completed all ten configured checks,
with 83 tooling, 811 unit, 186 contract and 1,258 integration cases across 52 integration files.
There are zero failed/pending/skipped integration cases. Build, compiled startup smoke, lint,
backend typecheck, source boundaries (427 files) and formatting (495 files) Passed. The CI report
finished at `2026-11-02T16:39:52.683Z`.

Final source/artifact snapshot: 509 files under the same digest inventory defined above;
SHA-256 `38b66dbdcc279a265214cba836c1fc3d0b2f9d47e126900819ab1074f1248163`.
Final security scan Passed with zero findings/advisories; documentation and diff checks Passed.
Supplemental final metadata verification Passed: 186 contract tests, artifact freshness,
backend typecheck and lint. Only context/session authorization metadata
changed during the consolidated run; these affected checks were repeated against that final
metadata, without changing runtime business code or rebuilding during integration tests.

The first promotion run had 389 Passed / 2 Failed across four integration files: the compiled
startup scenario still expected the incorrect group-creation 200, and schema extraction changed
normalized refund-review key order used by historical audit digests. Corrected the expectation
to the approved 201 and preserved the established normalized key order. A three-case repair run
Passed, including the additional verification-proof admin retry rejection. Reports are
`test-results/backend-contract-promotion.json` (original failures preserved) and
`test-results/backend-contract-repair.json` (three selected cases, 351 unrelated not selected).

| Separate acceptance | This work package |
| --- | --- |
| Real hosted staging/media/scanner/worker qualification | Not Run; Deferred P04-003/P09-011 retain their free-only target evidence requirements. Historical records are linked by Tasks, not presented as this source revision. |
| Real merchant/channel activation or payout | Not Run; no actual financial/provider operation was performed. Real HTTP/MongoDB scenarios use explicit provider/evidence test doubles. |
| Frontend/browser acceptance | Not Run; backend-private scope under Testing §15.5. |
| Independent P03-022 acceptance | Not received; not self-approved by implementation or CI. |

## Remaining backend-stage acceptance

All 170 typed contracts and runtime registrations are implemented and final post-promotion backend
verification Passed. There is no unfinished ordinary Backend-stage development task in the register. P04-003/P09-011 require actual free-only target media/worker/runtime qualification; Deferred
statuses and historical evidence remain unchanged. P03-022 needs independent owner acceptance
against the final backend revision. Local regression does not supply that acceptance.

No real env file, deployment, provider transaction, live database migration, paid resource,
commit or push was performed. Frontend builds/browser suites were not run for backend-private work.
