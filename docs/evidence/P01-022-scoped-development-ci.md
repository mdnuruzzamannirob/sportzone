# P01-022 — Application development and CI isolation

**Date:** 23 October 2026 · **Executor:** Codex · **Status:** Done

## Delivered changes

- Root `npm run dev:backend` supervises only the existing compiler/API coordinator through runDev;
  signal, failure and descendant cleanup use the same tested process-group lifecycle as integrated dev.
- `ciPlan(root, selected)` validates only selected workspace manifests/checks while preserving root
  workspace identity and inventory structure. Unknown scopes fail before unrelated workspace reads.
- `npm run ci -- --scope=backend` includes root tooling tests, backend-only formatting and all six
  existing backend checks. The inventory owns rootChecks; full runs reuse repository tooling/formatting.
  Comma-separated scopes are supported; duplicate/unknown selections fail closed.
- Hosted selection uses validated base/head SHA values and NUL-separated Git paths, never event text
  interpolated into a shell. Backend-private changes with documentation select backend,supply-chain;
  UI changes include both frontend builds, backend and their shared browser audit. Shared/tooling or
  unknown paths, missing metadata, empty diffs and manual dispatch use all. Git errors fail the job.
- Playwright engine installation is conditional. The pinned actions, single install, stable required
  result, failure reports and full candidate/release verification remain.

## Verification

Local environment: Node.js 24.20.0; isolated mongodb-memory-server replica sets with
MONGOMS_DISTRO=ubuntu-24.04. Tests never use application MongoDB credentials.

| Command/check | Result |
| --- | --- |
| `npm run test:unit` | Passed: 58 tooling cases, including backend selection with documentation, conservative fallback, invalid unrelated frontend metadata, unknown scope, hosted wiring, failure propagation and process cleanup |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run ci -- --scope=backend` | Passed final combined scope: all eight inventory commands, 58 tooling cases, backend lint/types, 392 unit tests, build, real-DB smoke and 382 MongoDB integration tests. Report: test-results/ci/backend.json; database cases: test-results/database.json. No frontend command ran. |
| `npm run format:backend` | Passed: 162 source/tooling files; generated dist and unrelated configuration excluded |
| `npm run lint` | Passed final handoff: 423 files, 1,207 local links, zero errors |
| `npm run lint:boundaries` | Passed: 205 source files, zero errors |
| `git diff --check` | Passed during implementation |
| `node --test --test-isolation=none --test-name-pattern='affected checks\|hosted checks' tests/tooling/ci.test.mjs` | Passed: two focused cases after retaining repository quality guards for UI selection |
| Task/contract metadata audit | Passed: 209 task IDs/counts/dependencies, unchanged prerequisite reachability; 34 FRs, 38 collections and 164 API/Testing operation slots |
| Frontend builds/UI/browser tests | Not Run for local backend iteration. Passed in the hosted full verification required for shared CI-tooling changes: storefront 98/admin 80 unit cases and 36 Chromium/Firefox/WebKit cases, zero skipped/unexpected/flaky cases. |
| Hosted GitHub Actions | Passed: run 39989593949 at e968ff0, all 23 inventory commands, 58 tooling, 392 backend unit and 382 MongoDB integration cases, all builds/smokes and security checks. No dependency advisories or secret findings. Reports uploaded successfully. |

The first sandboxed tooling/backend attempts failed because process/loopback fixtures were restricted;
normal approved execution passed. An initial broad formatter path included generated dist/configuration;
it was corrected to the existing adopted backend/source scope before verification.

## Remote verification boundary

An isolated worktree at /tmp/sportzone-p01-022-hosted contains only nine task tooling files, committed
on codex/p01-022-scoped-ci (final code revision e968ff0; initial implementation f98bd4f). The main workspace's staged documentation was not committed,
reset or overwritten. The owner subsequently authorized publication: “অনুমতি দিলাম—task branch push ও CI চালাও”.
The branch was pushed to the existing SportZone origin; main was not merged.

Automatic approval review rejected `git push -u origin codex/p01-022-scoped-ci`: publishing private
source to the remote was not explicitly authorized. That rejection was preserved and no workaround used;
publication resumed only after the owner's explicit authorization above.
[Hosted run 39989593949](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/39989593949)
targets e968ff072f1229295badd0d471bc7fe32a4bb587. New-branch fallback selects the full inventory,
including browser setup; all steps and 23 commands Passed. Reports were downloaded and inspected from
the run's ci-1 artifact: ci.json, database.json, ui-report.json and security.json. The hosted run proves
the full-fallback workflow. Backend-only execution is evidenced by the local eight-command report;
backend-path selection and conditional workflow wiring are tested by the same 58 tooling cases on
GitHub. A separate backend-only hosted push was not created under the nine-tooling-file authorization.
No milestone/provider approval is implied. Owner publication approval does not constitute task acceptance;
the independent task acceptance is recorded below under AGENTS §13.

## Independent acceptance

The project owner reviewed the completed implementation and verification evidence and accepted the
task through the review popup: “Review করেছি—accept করছি, Done করো”. P01-022 moved In Review → Done.
The earlier publication authorization remains a separate decision. Main was not merged; no application
stage, milestone or provider gate is accepted by this task decision. Register: 66 Done, 142 Not Started,
1 Blocked and zero In Review. P01-023 is the next foundation task.

## Rollback

Revert the nine task tooling files together through a reviewed change; preserve user-staged edits.
The prior full CI inventory and integrated dev command remain compatible. Reverting selection restores
unconditional browser/full verification; it must not remove required checks or change the required job name.
There is no schema, application-data or external-provider mutation to roll back.

## 31 October 2026 — CI audit corrections

This maintenance revision supersedes the historical affected-path behavior above without changing
accepted milestone/provider outcomes. Found and corrected:

- Prose-only changes selected all applications and browser engines. They now retain repository and
  supply-chain checks; executable docs/API.md also retains backend contract checks.
- Backend-only rootChecks omitted import-boundary enforcement. It is now mandatory, with a negative
  inventory fixture proving it cannot be removed.
- PR scope compared branch tips directly and rename detection could hide the old owner. It now uses
  merge-base comparison and both old/new paths. Missing force-push revisions conservatively select
  the full inventory, with a static warning and no skipped checks. Scope ordering is deterministic.
- Dockerfile/runtime-build input changes did not block the required CI result on image failures.
  The required job now selects the shared scripts/ci/container.mjs image build/non-root/secret-exclusion
  gate. Manual image verification reuses it; provider jobs remain explicit and protected.

Observed local verification: `npm run test:unit` Passed 67 cases outside constrained process/port
sandboxing; `npm run lint`, `npm run lint:boundaries`, `npm run format:check`, JavaScript syntax,
workflow YAML parsing and `git diff --check` Passed. The local Docker gate was Blocked by current
socket permissions; no permission/host changes were requested as part of this CI fix. Actual hosted
Docker verification remains required before claiming that new gate Passed.

Read-only GitHub settings verification found main already requires the exact CI required result
check, strict up-to-date status and administrator enforcement. These policies were not changed.
Historical Dependabot run 41059288856 failed under a proposed Biome 2.6.3 update at storefront lint
(schema drift/new component-hook-factory diagnostics); that is an upgrade compatibility failure,
not grounds to bypass lint or silently upgrade the pinned current toolchain. No dependency versions,
deployment flags, provider credentials, database state or production resources were changed here.

Two real runs on the same revision (`41167031832` PR and `41167029937` push) confirmed duplicate
feature validation. Automatic feature validation now runs on PR events; main/tag pushes and manual
dispatch force full verification. A branch without a PR can use a draft PR or manual dispatch. No
passing/skipped placeholder is introduced, and required-check/main protection settings remain intact.
The hosted PR run already Passed the shared Docker gate before continuing application/browser checks;
final verification targets the subsequent deduplication revision, not an interrupted predecessor.

### Hosted failure diagnosis and security patch

The single PR run [41167260706](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/41167260706)
completed all application builds/checks, 1,057 database tests and browser verification successfully,
but correctly failed its final security command. Downloaded native ci.json/security.json reports
showed no secret findings and one high advisory in transitive follow-redirects 1.16.1, used through
mongodb-memory-server-core. The [reviewed advisory](https://github.com/advisories/GHSA-mrwp-f3q8-3g9p)
identifies patched release 1.16.2, compatible with the parent's existing ^1.16.0 range.

Updated only that package's version/resolved/integrity in the lockfile, preserving unrelated optional
platform dependencies. No direct dependency versions, exceptions or lint/security rules changed.
`npm run test:security` now Passed locally: zero secret findings and zero dependency advisories.
The CI inventory now executes supply-chain checks after repository checks and before expensive
application/database/browser suites. Its ordering regression is included in 67 Passed tooling tests.
A new hosted run is required for the final patched revision; the failed predecessor is not relabeled.
