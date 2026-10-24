# P01-024 — Foundation stage readiness

## Scope and revision

Foundation closeout under Implementation Plan §3.1, Testing §15.5 and Operations §5.
Base revision: `b19a790090693bf33da3fa39d1b97be0ea958497`; final working-tree changes are
this evidence, task/changelog records, the compatible body-parser lockfile patch and smoke assertion.
Verification date: 24 October 2026; Linux, Node.js 24.20.0, npm 11.19.0.

P01-023 has explicit independent acceptance. This review establishes local backend development
readiness, not M1, backend feature completeness, provider activation or deployment acceptance.
No private `.env` contents, credentials or external database were inspected or modified.

## Setup and isolation

- A clean temporary directory received only the root lockfile/manifest and three workspace manifests.
  `npm ci --ignore-scripts --no-audit --no-fund --prefix <temporary-directory>` succeeded, including
  a second clean installation of the final patched lockfile: 333 packages. Browser installation and
  application lifecycle scripts were not required. The checkout was then installed from that exact
  final lockfile with the same safe flags; no manifest version was changed.
- `npm run workspaces:check` resolves all three installed workspace manifests. This is dependency
  inventory, not a frontend build or frontend acceptance claim.
- `npm run ci -- --scope=backend` selects two repository commands and seven backend commands:
  tooling tests, scoped format, lint, typecheck, contract, unit, build, smoke and integration.
  No storefront/admin server, build, test or browser install is in this plan.
- Existing positive/negative tooling cases cover scope selection, missing required scripts,
  failed command propagation, compiler failure, watcher restart, coordinated termination and
  import boundaries. Contract checks require real router parity and deterministic fresh artifacts;
  planned operations remain outside executable API claims.
- Smoke and integration create loopback-only disposable MongoDB 8.0.16 replica sets with WiredTiger.
  Tests exercise real transactions/indexes, rollback and concurrent writes. The local-tool integration
  case starts/stops `db:local` without consuming an external URI. Stopping it discards synthetic data;
  a new invocation can assign a new port, so its printed URI must be refreshed in private config.

## Security correction

The first functioning security run found no secrets but one high-severity dependency advisory:
[GHSA-27r3-jxmh-p828](https://github.com/advisories/GHSA-27r3-jxmh-p828).
The compatible Express transitive resolution changed from body-parser 2.3.0 to patched 2.4.0.
No other lockfile package entry changed; optional platform entries were preserved. The application
already rejects compressed JSON with `inflate: false`; the compiled-server smoke now also verifies
that gzip with trailing invalid bytes returns the canonical 400 validation error and the process still answers liveness requests.
The advisory is fixed by the package update as well as retaining the existing input restriction.

An exploratory unlocked install was discarded by a clean checkout `npm ci` before final checks.
Initial sandbox restrictions caused two tooling child-process cases and the scanner to fail; the
same commands ran with approved process/network capability. These attempts are not labelled passes.
A broad process-stop request was automatically rejected; no process was killed, and a subsequent
PID-specific read-only check found no matching process. Final verification uses the exact lockfile.

## External inputs and affected gates

The authoritative appointments/readiness remain in the [existing readiness register](./P01-005-readiness.md#current-readiness-inventory)
and [Tasks external gates](../TASKS.md#61-external-readiness-and-blocker-register).
All named appointments and external test/production approvals remain Pending; functions below are
accountable roles, not invented named approvals. The project owner must appoint people and supply
private configuration references through the approved secret mechanism before affected acceptance.

| Input | Accountable function | Required next evidence | Gate impact |
| --- | --- | --- | --- |
| EXT-01 merchant/channels | Merchant owner | Account-controlled sandbox access and verified bKash/Nagad/Rocket activation | P07 payment integration; P11 live-channel acceptance |
| EXT-02 refunds | Merchant/finance owner | Supported status/refund method, limits and real sandbox outcomes | P08 refunds and P11 payout readiness |
| EXT-03 database/recovery | Infrastructure/data owner | Approved deployment URI reference, access control and measured restore | Local replica transactions are proven; staging/production recovery remains pending |
| EXT-04 media | Store administrator | Cloudinary/scanner configuration references, approved type/size/retention/legal-hold policy and deployed security evidence | P04-003 remains Blocked; media activation and affected backend closeout cannot be accepted |
| EXT-05 email | Store owner | Approved sender/provider and actual delivery/retry/proof evidence | Recovery/guest/order notification deployment and backend acceptance |
| EXT-06 catalog/store identity | Store administrator | Approved products, assets, prices, opening stock and contact | Operator catalog/configuration and launch acceptance |
| EXT-07 fulfillment | Store administrator | Approved zones, charges, service arrangements and contacts | Checkout configuration and operational acceptance |
| EXT-08 policy/privacy | Store owner/authorized policy approver | Qualified current review and publication approval | Checkout/returns/privacy publication and release |
| EXT-09 hosting/origins | Release owner | Named account ownership, origins/DNS, credentials references, HTTPS/session/deploy/restore evidence | Staging integration and production deployment |

These pending inputs do not prevent isolated synthetic backend implementation. They do prevent the
specific real-service, policy and release acceptance above. No external gate is cleared by this task.

## Verification results

| Command / check | Observed result |
| --- | --- |
| Clean `npm ci --ignore-scripts --no-audit --no-fund` in temporary directory and checkout | Passed; final locked dependencies installed without lifecycle/browser scripts |
| `npm run workspaces:check` | Passed for final installed dependency graph |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run ci -- --scope=backend` | Pre-patch run passed all nine commands. Patched run passed 58 tooling, scoped format, lint/types, 42 contract, 392 unit and build; stopped on new smoke assertion expecting raw 415 instead of canonical 400. Preserved as Failed; remaining checks run separately below |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:smoke --workspace=backend` | Passed after assertion matched existing 400 INVALID_REQUEST contract; compiled DB startup, protected readiness, malformed compressed-body rejection, post-request liveness and shutdown |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend` | Passed: 382 cases in 21 files on final patched lockfile |
| Actual `npm run dev:backend` loopback probe | Passed: compiler/API start, liveness, no frontend command and owned process-group shutdown checked with synthetic values and disposable replica |
| `npm run lint --workspace=backend`; `npm run format:backend`; `npm run lint:boundaries` | Passed; final smoke source included; 173 formatted files and 208 boundary files |
| `npm run test:security` | Patched lockfile Passed: zero advisories and zero secret findings |
| `npm run lint`; `git diff --check` | Documentation/reference and whitespace checks run at final handoff |
| Frontend builds/UI/browser; hosted CI; real provider/deployment | Not Run: no frontend behavior or CI workflow changed; provider/deployment acceptance remains with external gates |

Sanitized reports/logs are retained in `test-results/P01-024/`; failed/replaced attempts are preserved
separately. A second smoke probe initially used the wrong error-code assertion, corrected to the existing
INVALID_REQUEST response. Development probes initially assumed numeric npm exit status and then attempted
cleanup of an already-signalled process; the final probe checks signal status and disappearance of the
whole owned process group. These harness failures are not product passes. No failed pipeline JSON is
rewritten as successful; applicable final results combine the unchanged passing checks and focused reruns.

## Recovery and independent review

No database migration, provider mutation, publication or production action occurred. Rollback is a
reviewed matching lockfile reinstall; do not restore a vulnerable version in an exposed environment.
Delete only task-owned disposable fixtures if desired; never clean a configured external database.

On 24 October 2026, the project owner independently accepted the submitted foundation readiness
implementation and verification through the review popup: “Review করেছি—accept করছি, Done করো”.
P01-024 moved from In Review to Done under AGENTS §13. Foundation-stage readiness is accepted;
backend work may proceed in dependency order. Historical verification failures remain recorded above.
This acceptance does not approve M1 or other product milestones, backend-stage completeness,
external-provider/policy gates or deployment readiness.
