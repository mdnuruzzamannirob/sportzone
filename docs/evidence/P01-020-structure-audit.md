# P01-020 — Folder structure and ownership audit

**Date:** 22 October 2026\
**Baseline:** 8d7c2ab\
**Status:** Done — simplification follow-up accepted on 23 October 2026

## Simplification follow-up

The owner requested simpler organization after the initial accepted audit. Follow-up baseline: 607b1c0.
Removed three files: jobs/send-notifications.job.ts (argument-only forwarding), media/media.composition.ts
(root-owned access wiring) and media/media-dependencies.types.ts (single internal dependency contract).
setup.ts now calls the notification delivery service directly and supplies media access/default denial directly.
MediaDependencies lives with the reused media.context helpers and is exposed as a type through the media service.
The now-empty jobs directory is removed; future jobs require real coordination.

Auth composition remains because it assembles private models, admission/security and multiple routers; moving it
into root setup would expose private persistence. Media context remains because four operation services share
its validated policy/model/clock and ID/transaction helpers. Upload, access, attachment and cleanup remain
separate real responsibilities. Notification model/persistence/schema remain distinct data/bootstrap/policy owners.
No other composition/job forwarding factory remains; boundary regression STRUCTURE-06 rejects that pattern.
The ordinary UI facades and independently deployed app boundaries remain required by the approved design.

Follow-up checks passed as recorded below. The initial results/acceptance that follow describe the
previous revision; they do not approve this follow-up. Existing operator scripts and root composeNotificationWorker
remain stable; the internal forwarding factory is removed. No API, model, validator/index, provider policy or
financial behavior is changed.

### Follow-up verification

| Check / command | Observed result |
| --- | --- |
| npm run lint:boundaries | Passed: 190 source files, no violations |
| npm run test:unit | Passed: 53 tooling cases, including the new forwarding-factory regression |
| npm run lint --workspace=backend; npm run typecheck --workspace=backend; npm run test:unit --workspace=backend | Passed: 343 backend unit/contract cases |
| npm run build --workspace=backend; npm run test:smoke --workspace=backend | Passed: actual DB startup/readiness/shutdown and clean compiled operator consumers |
| npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/notifications.test.ts tests/integration/recovery.test.ts tests/integration/email-change.test.ts tests/integration/admin-auth.test.ts tests/integration/media.test.ts tests/integration/composition.test.ts | Passed: final 6-file / 118-case real MongoDB run |
| Literal source/test/tool graph | Passed: 275 files, no orphan source modules or runtime/type import cycles |
| Auth assembly formatting parity | Passed: parsed AST unchanged; retained private assembly responsibilities |
| npm run format:check; npm run lint; git diff --check | Passed: 288 formatted files; repository/local-link checks and diff whitespace |

The first integration attempt failed with ERR_INVALID_PACKAGE_CONFIG in worker startup during a concurrent
backend/package.json key-order edit. Its current JSON/scripts/dependencies are valid and the user edit was preserved;
the complete affected six-file suite was then rerun and passed. This failure is not counted as a passed run.
Logs: /tmp/sportzone-simple-integration.log (initial), /tmp/sportzone-simple-integration-final.log (118 passed),
/tmp/sportzone-simple-tooling.log, /tmp/sportzone-simple-backend.log, /tmp/sportzone-simple-static-final.log,
/tmp/sportzone-simple-format-final.log and /tmp/sportzone-simple-docs-final.log. Graph outputs are
/tmp/sportzone-simple-inventory.log and /tmp/sportzone-simple-types-inventory.log. Frontend/browser/security
suites are Not Run for this follow-up: their source/dependencies/visuals are unchanged. No schema migration is run.

## Initial audit scope and findings

The owner clarified that the requested review concerns folder structure and related naming, placement,
import direction, ownership, duplicates and unused files. This is separate from the accepted P01-019 CI recheck.
Architecture §§4–6 govern placement; no root relocation, shared UI package, empty feature scaffolding or new dependency.

| Finding | Correction |
| --- | --- |
| Delivery/retry decisions in jobs/send-notifications.job.ts; config imported the job | Existing logic moved to modules/notifications/notification-delivery.service.ts; notification.schema.ts owns retry validation. The stable job entry point only delegates. |
| Notification Mongoose schema/indexes, collection validators and bootstrap mixed into service | notification.model.ts owns the single unchanged RegistrationNotification registration; notification.persistence.ts owns unchanged validators/initialize/migration/index verification. The public service retains its methods. |
| Auth router/service assembly named auth.service.ts | Renamed to auth.composition.ts; setup consumer updated; contents identical. |
| Media service/context types depended on composition | media-dependencies.types.ts owns internal injected dependencies. Public media.types.ts remains free of private model dependencies; no private persistence leaks into auth/controller imports. |
| Formatter tests retained old format-bdt source names | Both apps use tests/format.test.tsx; existing Vitest discovery and all case IDs retained. |
| Preview catalog/compositions had a type-only import cycle | PreviewUI belongs beside AppCompositions; the catalog consumes that interface, with no reverse type dependency. |

The structure guard now enforces kebab-case source filenames, config/domain→job prohibition (including types/helpers),
domain→composition prohibition, jobs delegating private persistence through services and Mongoose schema placement in
.model.ts (including aliased Schema imports). Five negative STRUCTURE cases supplement existing controller/provider,
private-model, shared purity, frontend/UI and browser/server boundaries. Framework routes and NodeNext imports remain.

## Inventory and retained organization

Inspected backend/src, storefront/src, admin/src, shared, repository scripts, test helpers/tooling/e2e,
workspace configs and operator consumers against the approved trees. The resulting literal-import graph covers
278 source/test/tool files: no unreachable source modules and no runtime or type-import cycles. Framework/runtime
entries, jobs, scripts and tests are explicit roots; reachability includes modules retained for real test/preview consumers.
This is not a proof that every exported facade member has a production consumer; no planned reusable UI is deleted on that basis.

Nine identical source-file pairs remain across the two applications: IdentityForm, five UI facade modules and three
transport/error/query modules. They preserve independent app-owned UI/navigation/runtime boundaries under Architecture
§§4.2,5.3; extraction would introduce a separate shared runtime/UI ownership decision. Root shared remains pure theme/money
utilities. Each app retains its blocking public theme bootstrap. No empty source/script/test directories, stale current
path references, extra lockfile or speculative application folders were found. Ordinary folder names also pass kebab-case review;
Next.js route groups/dynamic segments retain framework naming.

The audit deliberately retains catalog-local model/validation helpers, auth-owned identity response contracts,
delivery-owned coverage capability, provider client/schema separation, backend operator scripts and cross-app test helpers.
Historical task evidence is retained as historical; current source consumers use the new paths.

## Initial audit verification

Linux x64, Node 24.20.0, npm 11.19.0; isolated transaction-capable MongoDB fixtures. No live provider or production changes.

| Command/check | Observed result |
| --- | --- |
| node /tmp/sportzone-structure-audit.mjs; node /tmp/sportzone-structure-types-audit.mjs | Passed: 278-file graph, zero orphan source modules/cycles; duplicate pairs reviewed above |
| node /tmp/structure-parity.mjs | Passed: original schema/index AST, all five validators and notification service/persistence method bodies, worker body and exact auth assembly preserved |
| npm run lint:boundaries | Passed: 193 source files, zero violations |
| npm run test:unit | Passed: 52 tooling cases, including five new STRUCTURE negative fixtures |
| npm run lint --workspace=backend; npm run typecheck --workspace=backend; npm run test:unit --workspace=backend | Passed: 343 unit/contract cases |
| npm run build --workspace=backend; npm run test:smoke --workspace=backend | Passed: clean compiled paths, real DB startup, readiness and shutdown; obsolete dist/modules/auth/auth.service.js absent |
| npm exec --workspace=backend -- vitest run --config vitest.integration.config.ts tests/integration/notifications.test.ts tests/integration/recovery.test.ts tests/integration/email-change.test.ts tests/integration/admin-auth.test.ts tests/integration/customer.test.ts tests/integration/media.test.ts tests/integration/composition.test.ts | Passed: 7 files / 136 real MongoDB integration cases |
| npm run test:unit --workspace=storefront; npm run test:unit --workspace=admin | Passed: 7 files / 85 cases and 7 files / 80 cases; renamed tests discovered |
| npm exec -- tsc --project tests/e2e/tsconfig.json | Passed: preview type-direction correction |
| npm run lint; npm run format:check; git diff --check | Passed: 398 repository files / 1185 local links, 291 formatted files, no diff whitespace errors |

Logs/artifacts: /tmp/sportzone-structure-audit.json, /tmp/sportzone-structure-types-audit.json,
/tmp/sportzone-structure-tooling-final.log, /tmp/sportzone-structure-backend-final.log,
/tmp/sportzone-structure-integration.log, /tmp/sportzone-structure-storefront.log and /tmp/sportzone-structure-admin.log.
Full CI/browser/security reruns are Not Run for this
change: frontend runtime/visuals, provider contracts and dependencies are unchanged; scoped real DB/HTTP/worker checks
cover the moved backend behavior. Prior accepted full-check results are not relabelled as new runs.

## Review and recovery

Initial and follow-up owner acceptances are recorded below. Existing accepted task statuses, EXT-04 and milestone gates remain intact.
Roll back source/tests as one compatible artifact and rebuild backend output; no database migration or durable-state
rollback is required. Operator command names and root worker composition remain stable.

## Owner acceptance

On 22 October 2026, the project owner reviewed the structure audit, six corrections and verification evidence
and explicitly accepted P01-020 through the popup: “Structure review করেছি—accept করছি, Done করো”.
This accepts the structure-audit task; provider, deployment and milestone acceptance remain separate.

## Follow-up acceptance

On 23 October 2026, the project owner reviewed the simplified structure and its verification evidence and
explicitly accepted the follow-up through the popup: “সংশোধিত structure accept করছি—Done করো”.
P01-020 returns to Done; the initial acceptance remains historical and external gates remain unchanged.
