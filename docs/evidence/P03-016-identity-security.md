# P03-016 — Identity/security foundation verification

**Date:** 21 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Status:** Done; explicitly reviewed and accepted by project owner\
**Milestone:** M1 remains Not Accepted; this is its engineering evidence package

## Scope, revision and prerequisites

Task P03-016 verifies the implemented identity foundation against PRD FR-01/FR-02/FR-21, Architecture §9,
Database §5, API §4, Testing API-01/02/06/07, ACC-01–05 and SEC-01/02/03/04/06/07/10/11/13, plus
Implementation Plan §§3.3, 6 Phase 03 and 11. No new commerce feature, schema, public endpoint or dependency.

Application baseline: commit `10813c5ff689e47a5c19ec5cc1801becc4d4841b`. Verification fixes are the test
configuration isolation, restored empty exception register and Git-aware scanner snapshot described below.
A concurrent formatting/import-order-only edit to `admin/src/app/router.tsx` was preserved; no route behavior
was changed for this task. Backend implementation and frontend identity behavior remain unchanged.

P03-014/015 and every declared P01/P02 prerequisite are Done with owner acceptance. P03-019/020 remain separate
planned backend refactors; this verification does not mark them or all of Phase 03 complete. Release acceptance
slots for future features/environments are not converted to Passed by foundation tests.

## Foundation reconciliation

| Required foundation | Evidence reviewed and current disposition |
| --- | --- |
| FR/NFR ownership and coverage protocol | Accepted [P01-003 functional mapping](./P01-003-traceability.md), [P01-004 NFR/release mapping](./P01-004-nfr-release.md), [P01-012 status protocol](./P01-012-task-protocol.md) and [P01-013 testing baseline](./P01-013-testing-baseline.md); identity assertions mapped below. Planning coverage is distinct from executed feature coverage. |
| CI governance | Accepted [P01-010](./P01-010-ci.md) and [Phase 01 final hosted evidence/acceptance](./phase-01-reconciliation.md#owner-acceptance); current local required inventory verified across initial and corrected scopes. Historical hosted success is not claimed for this revision. |
| Agent rules | Root AGENTS.md inspected; accepted [P01-011](./P01-011-agent-rules.md) preserves subject authority, independent review, safe edits, honest evidence and milestone gates. |
| Responsive/accessibility/theme foundation | Accepted [P02-011](./P02-011-accessibility.md) and [P02-014 contrast correction](./P02-014-default-heroui.md#contrast-correction-and-verified-completion); current 36-case three-engine matrix includes unsuppressed Axe, mobile/desktop, light/dark, keyboard/focus and actual UI preview interactions. |
| Runtime/operations | Accepted [P01-014](./P01-014-operations-baseline.md); all workspace builds/types/smokes, real database readiness/transactions, restricted health and shutdown checks passed. Live deployment evidence remains separate. |
| Connected identity interfaces | Accepted [P03-015](./P03-015-identity-interfaces.md#owner-acceptance); actual TLS/API browser flows rerun in Chromium, Firefox and WebKit. |

## Security and requirements observations

All following rows Passed for the implemented local identity surface. Counts identify real suites, not a claim
that every future route or commerce case is implemented. Every listed integration suite used real MongoDB.

| Scenario / requirement | Executed assertions and source |
| --- | --- |
| FR-01; SEC-01/03: password/session lifecycle | `passwords.test.ts` covers policy, salt, adaptive scrypt, no trimming and bounded KDF admission. Integration `identity.test.ts` (40), `sessions.test.ts` (20), `customer.test.ts` (18) assert unique identity, hashed/private projections, customer/admin isolation, fixation/rotation, exact-cookie selection, authoritative expiry despite TTL lag, revocation/security revision, logout replay and transaction rollback. |
| FR-21; SEC-02/03: private administrator | `admin-auth.test.ts` (22) proves one-time private provisioning, no customer promotion/public admin signup, wrong-role denial, independent admin login/logout/reset, exact cookie namespace, suspended/expired access denial and concurrent reset/login rollback. Actual browser rejects customer cookies and forged local role/auth flags. |
| API-01/07; SEC-04/11: CSRF and Origin | `browser-security.test.ts` (31), customer/admin/recovery/email suites reject missing/forged/opposite Origin, duplicate/swapped/stale credentials and CSRF, replayed contexts and invalid namespace/query/header selection. Context exchange is single-effect under concurrency and rolls back on failure. Narrow credentialed CORS and no-state-change HEAD assertions pass. |
| SEC-01/13: password reset replay | `recovery.test.ts` (28) and admin suite assert generic active/missing/suspended/wrong-role responses, expiring proof despite TTL lag, exactly one concurrent consume, replay/wrong-purpose rejection, revision/reissue fencing, no unintended login and atomic password/session/proof rollback. Delivery proof encryption/reference-only notification and uncertain-send handling are exercised without real email. |
| FR-02; ACC-01–05; SEC-06/07 | `profile.test.ts` (26) and `authorization.test.ts` (13) assert own-account projection, foreign/unknown nested address denial, strict protected-field rejection, coverage validation, maximum/default address concurrency, historical snapshot preservation and reauthorization against concurrent logout/suspension. |
| FR-01/02; SEC-03/13: sensitive changes | `email-change.test.ts` (27) preserves old email before proof, verifies new identity once, enforces uniqueness, revokes sessions/proofs and serializes logout/reset/reissue. Password-change tests require current credentials, rotate session/CSRF and revoke other sessions. All failure/rollback paths preserve authority. |
| SEC-01/10/13: shared throttles | `auth-rate-limit.test.ts` (7 integration cases plus unit/operational cases) checks exact limits under concurrent independent instances, recreation, cross-network normalized targets, spoofed-forwarded-IP resistance, fixed-window/TTL lag and saturation. Missing index/collection or unavailable storage fails closed without creating protection or changing accounts; 429/Retry-After and safe fixed audit reasons pass. |
| API-06; SEC-10: contracts/privacy | Existing identity contract validators, operational tests and all integration suites cover strict fields, bounded inputs, safe static errors, allowlisted projections/logs and absence of raw credentials/proofs/diagnostics. Contract entries for unimplemented endpoints remain specification slots, not runtime acceptance. Secret/history scan and advisory result are recorded below. |
| UI-ACCOUNT/UI-ADMIN-AUTH | Real API browser cases verify registration, login by keyboard, failed-submit draft retention, profile/address CRUD/default, password/email/recovery confirmation, removed proof fragments, JavaScript-disabled form safety, private cache headers, live expiry/suspension and cross-tab account switching. No automatic mutation replay or local-storage authorization. |

Integration suite sources are under `backend/tests/integration/`; corresponding unit/contract sources under
`backend/tests/`. Detailed named assertions and individual outcomes are in the retained JSON database report.
Frontend fixtures and real API composition are documented in P03-015. Browser proofs travel through private IPC;
auth network traces/automatic failure screenshots are disabled. No production account or external database used.

## Verification procedure and results

Environment: Node 24.20.0/npm 11.19.0; Ubuntu 26.04 local host; isolated MongoDB 8.0.16 replica sets with
`MONGOMS_DISTRO=ubuntu-24.04`; local TLS proxies and synthetic identities. Frontend builds use public synthetic
origin `https://127.0.0.1:4443`. WebKit uses the previously prepared test-only
`SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-browser/webkit.sh` plus temporary official Ubuntu libraries.
Hosted Ubuntu installs normal browser dependencies; no repository runtime/system package was changed.

| Exact command / run | Observed result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 NEXT_PUBLIC_API_ORIGIN=https://127.0.0.1:4443 VITE_API_ORIGIN=https://127.0.0.1:4443 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-browser/webkit.sh npm run ci` | Initial run: 12 checks passed, stopped at admin unit AD-01. Repository 32 cases and storefront 85 cases passed. Admin 79/80 passed. Initial failed report is retained, not relabeled green. |
| `VITE_API_ORIGIN=https://127.0.0.1:4443 npm run test:unit --workspace admin -- tests/routes.test.tsx` | Corrected 6/6 passed; 74 unchanged passing cases retained, giving 80 unique valid admin cases. |
| `npm run lint --workspace admin`; `npm run typecheck --workspace admin`; `VITE_API_ORIGIN=https://127.0.0.1:4443 npm run build --workspace admin`; `npm run test:smoke --workspace admin` | Passed after scoped correction. Smoke initially hit sandbox EPERM; only smoke was rerun with temporary listener permission and passed. Existing admin bundle advisory around 634 kB/197 kB gzip remains nonfatal and unsuppressed. |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run ci -- --scope=backend` | All six checks Passed: lint/types, 328 unit/contract cases, build, real-database compiled-server smoke and 280 integration cases across 14 suites. |
| Same synthetic origin/MongoDB/WebKit environment as initial run, `npm run ci -- --scope=browser` | Passed 36/36 cases, all three engines, zero skipped/retries/failures. Includes 12 accessibility cases/48 UI scans plus authentication-flow audits. |
| `node --test --test-isolation=none --test-name-pattern='CI-22\|CI-23\|CI-24\|CI-25\|CI-26' tests/ci.test.mjs` | Passed 5/5 scanner privacy/advisory/selection cases after the observed tooling correction. |
| `npm run ci -- --scope=supply-chain` | Initial failures and final Passed result retained; final zero repository/history findings, zero advisories and zero exceptions. No secret contents retained in reports. |

Final `npm run ci -- --scope=repository` passed all five checks, including 34/34 root tooling cases, 313 files/1197 local links, 131 source boundaries and the required formatting baseline. Explicit formatting of the changed scanner/helper/tests was normalized and its final check passed. `git diff --check` passed. Combined unique verification: **527 unit/contract/tooling cases, 280 real MongoDB integration cases and 36 browser cases (843 total)**. Passing unchanged scopes were reused after the
localized fixes, as Testing §15.5 requires. There is no claim that the initial single full-CI invocation passed.
All 23 required check commands are accounted for across the recorded inventory and scoped corrections; no check
was removed, skipped, changed to optional or bypassed. No new hosted CI execution/settings mutation was requested.

## Corrections from actual failures

1. Admin missing-configuration test AD-01 inherited the CI browser-build origin. The suite now explicitly stubs
   its intended empty `VITE_API_ORIGIN`, restores environment after unmount, and retains every denial assertion.
   This fixes test isolation; application configuration/authentication behavior is unchanged.
2. The required `ci-security-exceptions.json` had been deleted in earlier UI refactor commit `0796a59`.
   Restored its original `[]` content from the accepted governance baseline. No dependency exception was granted.
3. Raw directory scanning included Git-ignored local environment configuration. `security-snapshot.mjs` selects
   tracked files even when ignored, plus non-ignored untracked source, into a private temporary directory. It skips
   symlink targets, rejects escaped paths and fails closed on Git inventory failure. The existing independent full
   history scan, pinned/checksummed scanner, redaction, strict advisory policy and Gitleaks rules are preserved.
   CI-25/26 prove the local/working-tree distinction, current tracked content, new source, symlink isolation and
   unavailable-Git failure. Local secret files were not read into reports, modified, deleted or exempted from history.

## Artifacts

- [Initial complete-run report](../../test-results/p03-016/ci-initial.json) and [execution log](../../test-results/p03-016/ci.log).
- [Backend scope](../../test-results/p03-016/backend-final.json), [log](../../test-results/p03-016/backend.log), [280 database assertions](../../test-results/p03-016/database-final.json).
- [Browser scope](../../test-results/p03-016/browser-scope-final.json), [36 browser cases](../../test-results/p03-016/browser-final.json), [log](../../test-results/p03-016/browser.log).
- [Final repository scope](../../test-results/p03-016/repository-final.json) and [log](../../test-results/p03-016/repository-final.log).
- [Final supply-chain scope](../../test-results/p03-016/supply-chain-final.json) and [zero-finding/advisory report](../../test-results/p03-016/security-final.json).
- [Admin smoke final](../../test-results/p03-016/admin-smoke-final.log); corrected test output was observed directly in the execution session.
- [Initial missing-register failure](../../test-results/p03-016/supply-chain-initial.json), [initial sanitized local scan finding](../../test-results/p03-016/security-initial.json).

## Gate disposition and limitations

P03-016 task review is accepted as recorded below. **M1 remains Not Accepted** until a separately recorded independent
technical/QA decision; task acceptance must not silently approve the milestone. No M2–M8 gate or deployment is
accepted. P03-019/020 refactors remain Not Started. Historical P01 hosted/protection evidence remains historical;
this package verifies the current local working revision with explicit fixes, not a newly hosted/deployed revision.

Not Run: current hosted/protected-main readback, deployed TLS/CORS/cookie configuration, external sender/inbox
activation, production provisioning/key custody, live provider/merchant workflows, performance/load, operational
backup/restore and future commerce/guest/order/refund authorization. Existing registration-verification issuance
is not implemented; the API/UI does not pretend otherwise. FR-02 order/wishlist/review/return histories and
SEC cases belonging to future commerce remain with their owning tasks. These do not acquire acceptance here.

No runtime business contract, schema or rollout migration changed. Operations documents the scanner boundary;
Testing links this current evidence and preserves future release slots. Scanner rollback can restore the previous
runner while preserving all identities/audit/history, but local ignored configuration will again cause directory
findings; do not weaken history scanning or add a broad secret exception to obtain a pass.

## Owner acceptance

On 21 October 2026, the project owner explicitly reviewed and accepted P03-016 through the evidence-linked popup:
“Review করেছি—accept করছি, Done করো”. The popup disclosed the verified counts, scoped CI results and zero
security findings/advisories, and explicitly separated task acceptance from M1 approval. P03-016 is Done;
M1 remains Not Accepted. Live/hosted and other external gates retain their recorded limitations.
This status-only change preserves existing verification results and repeats documentation/link checks only.
