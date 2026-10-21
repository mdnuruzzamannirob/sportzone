# P01-016 — CI scope and required-result verification

Latest Phase 01 revalidation: [current architecture reconciliation and closure procedure](./phase-01-reconciliation.md).
Final authenticated verification resolved login, hosted execution and main protection requirements.
See the linked report's final handoff for run/artifact identity, native results and settings read-back.
Final owner acceptance was recorded on 20 October 2026; P01-016 is Done.

Date: 20 October 2026 (Asia/Dhaka). Status: **Done**. Executor: Codex. Hosted run 39414507457 Passed for ac607b6; required main protection applied and read back. Accepted by the project owner on 20 October 2026: “onumoti dilam”. Earlier blocker descriptions below are historical.

## Historical implementation (superseded by simplification below)

Version-2 `ci-workspaces.json` owns repository, storefront, admin, backend, browser and supply-chain checks/dependencies. The runner supports all/scoped execution and browser preparation. A generated, checked workflow topology invokes a reusable locked-setup workflow; the required-result job evaluates all dependency results and matching per-scope reports. Browser checks moved to root inventory ownership; the existing admin alias remains compatible.

Reports include command outcome, duration, discovered/pass/fail/skip counts where test runners emit summaries, source/runtime/lock/inventory/run identities and completion state. Aggregate validation rejects missing/partial/failed/dirty/stale reports and failure/cancellation/skips, including a dirty aggregate checkout. Run-attempt-scoped artifacts require re-running all jobs on retries. Hosted browser workers rebuild both UI artifacts on their own runner, avoiding unsafe node_modules/native build transfer.

Gitleaks 8.30.1 Linux x64 archive SHA-256: `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, verified against the [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). The script scans history and working files, suppresses raw output and retains only rule/path/line/fingerprint. npm audit reports advisory counts and high/critical blockers; exceptions are empty initially and require specific reviewed expiring records. Dependabot update configuration is included.

## Historical verification

| Check | Observed result |
| --- | --- |
| `npm run test:unit` outside sandbox | Passed — 34 tooling cases, including existing failure-propagation tests and new aggregate/security/browser/count-reporting cases |
| `npm run lint`, `npm run ci:workflow`, `git diff --check` | Passed; repeated after final documentation review |
| `npm run test:security` outside sandbox | Passed — zero history/working-tree findings and zero dependency advisories; empty exceptions |
| PyYAML BaseLoader parsing of all four new/changed YAML files | Passed; this is syntax validation, not a hosted Actions run |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-ci-browser-vq3gIQ/webkit.sh npm run ci` outside sandbox | Passed — all 22 configured checks; 34 tooling + 114 storefront + 97 admin + 314 backend unit/contract cases, 260 replica-set integration cases and 30 browser cases; all three builds/smokes, lint and type checks passed |
| Hosted run and branch protection | Not Run — `gh auth status` reports no authenticated GitHub host; no commit/push or remote setting mutation performed |

Final local pipeline: 06:57:02–07:00:57 UTC (12:57:02–13:00:57 Asia/Dhaka). `test-results/ci.json` records Passed, 22 checks and 849 discovered/passed cases, zero failures/skips; `test-results/database.json`, `test-results/ui-report.json`, `test-results/ui/` and `test-results/security.json` retain detailed local artifacts. These are ignored generated files, not committed acceptance artifacts; the workflow uploads corresponding scope artifacts when run on GitHub.

## Resolved verification failures and environment

The initial full run exposed a pre-existing space-sensitive API table parser. Its regex now accepts Markdown column alignment while retaining exact 26-operation method/path comparison and the 26-operation assertion; no authentication/API implementation changed. A subsequent run passed all application/integration checks and Chromium/Firefox, but failed ten WebKit launches because this Ubuntu 26.04 host lacked runtime libraries. No test engine was removed or assertion weakened.

Official Ubuntu packages were downloaded/extracted only into `/tmp/sportzone-ci-browser-vq3gIQ`: libevent-2.1-7t64, libavif16, libmanette-0.2-0 and dependent libyuv0/libgav1-2/libhidapi-hidraw0. A temporary wrapper supplies their library paths and the official Playwright WebKit 2370 bundle using the existing test-only executable override; it clears inherited GTK/GIO module paths. No system packages or browser source were modified. The isolated WebKit rerun passed 10/10, followed by the final full 30/30 matrix. The wrapper is machine-specific temporary setup, not a CI dependency; Ubuntu 24.04 hosted jobs install official Playwright dependencies normally.

Nested Git/npm, loopback fixtures and security downloads required sandbox escalation on this host. Failure reports were retained during investigation; no failed/unavailable check was represented as Passed before the successful rerun.

## Simplification revision

The single hosted job now installs once and executes the same application/browser/security commands in inventory
order. Frontend builds are reused for browser tests. Removed the reusable scope workflow, composite setup action,
workflow generator/check, dependency graph and cross-job report aggregation/identity/count-parsing machinery.
Deleted tests exercise removed machinery only; application, real MongoDB and browser test files are unchanged.
The inventory now contains 21 commands (the removed 22nd command checked generated workflow parity).
Reports retain command outcomes/durations; native suite reports own case counts. GitHub run metadata owns
hosted source/attempt identity. Local verification follows Testing §15.5.

| Current revision check | Observed result |
| --- | --- |
| `npm run test:unit` outside sandbox | Passed — 20 tooling cases; command failures, scoped execution, repository guards and security policy |
| `npm run lint` | Passed — 268 repository files, 1,108 local links, zero errors |
| Inventory comparison with `HEAD:ci-workspaces.json` | Passed — all application/browser/security commands retained; 21 commands total, one build per frontend |
| PyYAML BaseLoader parsing of `.github/workflows/ci.yml` | Passed — one required job, read-only permissions and push/PR/manual triggers; syntax review is not hosted execution |
| `git diff --check` and scoped diff review | Passed — no whitespace errors or application source/test changes |
| Full application/MongoDB/browser/security execution | Not Run — application and security implementations are unchanged; focused tooling checks apply to this revision |
| Hosted execution/settings | Not Run — this revision has not been submitted to hosted CI; the earlier authentication blocker is recorded above |

Historical full-suite results above do not constitute a new full-suite run for this revision.
The first inventory comparison attempt hit the sandbox's nested Git restriction; reading the baseline through
the shell and comparing JSON directly completed the same check. YAML validation used `python3` after the
unversioned `python` command proved unavailable. Neither required rerunning application tests.

The simplified setup follows GitHub's documented [Node.js build/test workflow](https://docs.github.com/en/actions/tutorials/build-and-test-code/nodejs)
and [npm download caching](https://github.com/actions/setup-node#caching-global-packages-data).
Removing repeated setup and browser rebuilds reduces duplicated work; hosted elapsed time has not been measured.

## Acceptance boundary

Implementation was explicitly requested; P01-015 was subsequently accepted independently on 20 October 2026. No milestone is accepted by this work. Local verification does not satisfy hosted/settings acceptance. The remote handoff must run this exact revision on GitHub, verify `CI required result` and supply-chain/browser artifacts, configure/check protected-main requirements without dropping existing protection prematurely, and record reviewer approval. No deployment/merchant credentials are required by this CI.

## Closure review

Date: 20 October 2026. Executor: Codex. The project owner requested checking and closing all remaining
In Review tasks. The actual hosted-run and repository-settings requirements in TASKS/Operations still
apply; this instruction does not supply missing execution evidence.

- `gh auth status`: no authenticated GitHub host.
- Unauthenticated workflow-run API: HTTP 200. Filtering by current committed HEAD
  `420565d94da8c9c20ca734cd374029834857b952` returned `total_count: 0`.
- The latest public [workflow run](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/39385495398)
  completed with failure at a different commit; it is not acceptance evidence for current HEAD.
- `GET /repos/mdnuruzzamannirob/sportzone/branches/main/protection`: HTTP 401, Requires authentication.
  Protection settings were not inspected successfully or changed. The active local branch is refactor;
  no local uncommitted changes were pushed or attributed to a hosted run.

Result: P01-016 remains In Review. Required next evidence is a successful hosted run for the submitted
revision and authenticated verification of required-check enforcement under Operations §5.5. Owner
authorization is recorded, but missing verification is not represented as Passed. Existing local tests
were not rerun merely to close status records. User changes to backend/src/app.ts and staged biome.json
were preserved.

### Follow-up inspection

Public job metadata for run 39385495398 shows setup, locked installation and browser installation
succeeded; `Run required checks` failed, and report upload succeeded. Public annotations report only
exit code 1 and an upload-artifact Node 20 deprecation warning. The warning does not establish the
failure cause. Detailed job-log access returned HTTP 403, `Must have admin rights to Repository`.
`gh auth status` still reports no authenticated host. No speculative action upgrade, repeated full test
run or remote mutation was performed. Authenticated log/settings access and a successful hosted run
remain required before P01-016 can be accepted.

## Current blocker status

On 20 October 2026, another closure check confirmed that `gh auth status` still has no authenticated
host and committed HEAD is unchanged. P01-016 moves from In Review to Blocked: this is an external
verification prerequisite, not a missing owner approval. Accountable function: repository owner.
Required recovery: authenticate repository access, inspect/fix the failed CI check, record successful
hosted execution for the submitted revision, and verify protected-main required checks. Existing
401/403 and public-run findings remain the evidence; no redundant full test run or remote mutation
was performed. Done remains unavailable until the task acceptance requirements are satisfied.

## Local revalidation and execution priority

On 20 October 2026, the owner requested a fresh assessment of the CI portion, then clarified that the
approved application refactors should take priority and remote review closure should be handled later.
Implementation Plan §3.6 now states that P01-016 remote closure is not a prerequisite of P03-019.

Before that clarification, a scoped local revalidation was started and subsequently completed:

| Scope / command | Observed result |
| --- | --- |
| `npm run ci -- --scope=repository` | Passed — five commands, including 31 tooling cases |
| `npm run lint --workspaces` | Passed — storefront, admin and backend |
| `npm run ci -- --scope=storefront` | Passed — five commands; 114 unit/component cases, build and smoke |
| `npm run ci -- --scope=admin` | Passed — five commands; 97 unit/component cases, build and smoke |
| `npm run ci -- --scope=backend` | Passed — six commands; 314 unit cases and 260 isolated replica-set integration cases |
| `npm run ci -- --scope=browser` | Passed — 30 cases across Chromium, Firefox and WebKit |
| `npm run ci -- --scope=supply-chain` | Passed — configured secret/advisory checks |
| Focused `CI-11` / `CI-12` after annotation change | Passed — failed commands emit their validated command name as a GitHub annotation and still stop execution |

The 23 inventory commands were verified across scoped runs, not by repeating a full pipeline after
each edit. Repository checks ran first; the remaining scopes each ran once. After the small annotation
change only its two affected failure tests were rerun. Scope artifacts are in ignored
`test-results/ci/<scope>.json`; native browser/database/security reports retain detailed results.
Linux local configuration used `MONGOMS_DISTRO=ubuntu-24.04` and the previously documented temporary
WebKit runtime wrapper. This is local evidence, not hosted CI or branch-protection acceptance.

No workflow rewrite was necessary. The runner now uses GitHub's documented
[error annotation command](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#setting-an-error-message)
to identify future failed npm checks without exposing configuration values. The historical hosted failure
cause remains unverified. Current priority is the P03-019 backend composition refactor; remote CI closure
remains a separate follow-up under its existing acceptance requirements.

## Final hosted acceptance evidence

[Final Phase 01 handoff](./phase-01-reconciliation.md#final-hosted-verification-and-review-handoff)
records successful hosted run 39414507457 at ac607b6, 23 required checks, 846 passing cases,
zero skips/findings/advisories and authenticated main protection read-back. The owner authorized
submission/protection; all technical blockers are resolved. P01-016 is In Review pending the requested
final independent owner acceptance, not Blocked. No milestone or main merge is implied.

## Owner acceptance

The project owner approved the final evidence/Done request on 20 October 2026: “onumoti dilam”.
P01-016 In Review → Done. [Phase 01 acceptance](./phase-01-reconciliation.md#owner-acceptance)
records the independent approver, evidence and unchanged milestone boundaries. Prior pending/blocker
statements are historical; no current blocker remains.
