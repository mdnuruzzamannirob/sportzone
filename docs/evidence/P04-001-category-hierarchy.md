# P04-001 — Category schema and hierarchy

Date: 21 October 2026 (Asia/Dhaka). Executor: Codex. Status: Done.
Independent reviewer: project owner; accepted through explicit popup reply on 21 October 2026.
No milestone acceptance claimed.

## Scope and contracts

Sources: PRD FR-04/FR-24; Architecture §§4–6; Database §6.1; API §§10.1/14.1;
Testing CAT-01/CAT-04 and §15.5; Implementation Plan Phase 04.
Dependency P03-002 is recorded Done. Working tree was clean before implementation.

- `backend/src/modules/categories/category.model.ts`: timestamps, strict schema, normalized
  slug format, unique slug index, parent/status/sort index, status, optional parent/image,
  nonnegative safe integer revision/sort fields. Automatic index creation remains disabled.
- `category.service.ts`: validated create/patch, explicit null-to-root versus omitted-parent
  preservation, revision CAS, missing-parent/cycle checks, full active-ancestry visibility,
  guarded deletion and transaction-scoped ancestry capability for product associations.
- Ancestry writes touch revisions to prevent snapshot write-skew. Concurrent reparenting,
  child creation/deletion and cooperating product association/deletion cannot strand references.
  Dependency touches conservatively invalidate ETags; documented in Database/API.
- Required product-reference callback has no permissive default. Real products module must
  supply its owning reader and use the ancestry capability in its transaction (P04-002/005).
  Image-bearing deletion fails closed until media detachment is integrated (P04-003/004).
- No new HTTP route, UI, provider adapter, dependency or startup index migration.
  P04-004 owns admin integration; P04-009 owns public API discovery. Public filtering here is
  an internal foundation; endpoint pagination/DTO projection belong to that integration.

## Verification

Environment: local Node/npm workspace, isolated generated MongoDB 8.0.16 single-member
replica set; no external database configuration or production/customer data.

| Command | Observed result |
| --- | --- |
| `npm run test:integration -w backend -- tests/integration/categories.test.ts` | Passed: 8 tests, 1 suite; `test-results/database.json` (generated, ignored) |
| `npm run typecheck -w backend` | Passed |
| `npm run lint -w backend` | Passed |
| `npm run lint:boundaries` | Passed |
| `npm run format:check` | Passed (existing scoped baseline) |
| `npm run lint` | Passed: repository documentation/links |
| `git diff --check` | Passed |

Eight runnable cases cover schema/unique slug validation; missing/deep/self cycles;
inactive ancestry/null/omission/CAS; child/product deletion guards and rollback;
mutual reparent and lost-edit races; child-create/delete race; image/orphan fail-closed;
and real transactionally persisted product-reference/delete contention plus inactive
association rejection. Product persistence in the last test is an isolated fixture,
not a claim that P04-002 is implemented.

Initial typecheck errors (nullable parent/type inference) were corrected. Initial sandbox
MongoDB port binding failed with EPERM, then the same isolated tests passed with approved
local-port execution. Formatting from repository root encountered nested Biome configuration;
no configuration was changed. New files follow adjacent TypeScript conventions.

Not Run: full cross-project CI/build/browser suites (no frontend/HTTP/runtime composition change),
provider/deployed integration (outside this task). No release/provider acceptance inferred.

## Review and recovery

Database/API/Testing contracts reconciled; TASKS dashboard/log and CHANGELOG updated.
No existing source files, dependency graph, runtime registrations or user edits overwritten.
Review performed against the added files and documentation diff; independent acceptance recorded below.
Rollback removes these unused module files/tests; no deployed data or external effects exist.
Future rollout explicitly creates declared indexes through the existing additive index helper.


## Owner acceptance

Reviewer: project owner. Date: 21 October 2026 (Asia/Dhaka).
Decision: accepted through the task-review popup — “Review করেছি—accept করছি, Done করো”.
P04-001 transitions In Review → Done with its checkbox checked. Existing eight-test replica-set
and static verification evidence remains applicable; no application source changed for acceptance.
Documentation-only acceptance checks: `npm run lint` and `git diff --check` passed.
M2 and later HTTP/UI/media integration tasks retain their separate acceptance requirements.
