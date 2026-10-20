# P01-016 — CI scope and required-result verification

Date: 20 October 2026 (Asia/Dhaka). Status: **In Review**. Executor: Codex. Independent acceptance: pending.

## Implementation

Version-2 `ci-workspaces.json` owns repository, storefront, admin, backend, browser and supply-chain checks/dependencies. The runner supports all/scoped execution and browser preparation. A generated, checked workflow topology invokes a reusable locked-setup workflow; the required-result job evaluates all dependency results and matching per-scope reports. Browser checks moved to root inventory ownership; the existing admin alias remains compatible.

Reports include command outcome, duration, discovered/pass/fail/skip counts where test runners emit summaries, source/runtime/lock/inventory/run identities and completion state. Aggregate validation rejects missing/partial/failed/dirty/stale reports and failure/cancellation/skips, including a dirty aggregate checkout. Run-attempt-scoped artifacts require re-running all jobs on retries. Hosted browser workers rebuild both UI artifacts on their own runner, avoiding unsafe node_modules/native build transfer.

Gitleaks 8.30.1 Linux x64 archive SHA-256: `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, verified against the [official release](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). The script scans history and working files, suppresses raw output and retains only rule/path/line/fingerprint. npm audit reports advisory counts and high/critical blockers; exceptions are empty initially and require specific reviewed expiring records. Dependabot update configuration is included.

## Verification

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

## Acceptance boundary

Implementation was explicitly requested; P01-015 remains independently In Review rather than being silently accepted. No milestone is accepted by this work. Local verification does not satisfy hosted/settings acceptance. The remote handoff must run this exact revision on GitHub, verify `CI required result` and supply-chain/browser artifacts, configure/check protected-main requirements without dropping existing protection prematurely, and record reviewer approval. No deployment/merchant credentials are required by this CI.
