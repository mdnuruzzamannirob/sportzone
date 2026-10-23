# P01-021 — Documentation reconciliation

**Date:** 23 October 2026 · **Executor:** Codex · **Status:** Done

## Complete-document correction

The owner reopened the accepted submission because incremental additions had left fragmented guidance,
technology/provider conflation and cross-document inconsistencies. This correction covers the twelve core
documents: PRD, Architecture, Design, Database, API, Implementation Plan, Tasks, Testing, Operations,
README, AGENTS and Changelog. Existing historical evidence and acceptance remain records of their original
revision; this review does not recertify historical application/provider tests.

| Finding | Correction in the owning document |
| --- | --- |
| Technology inventory incomplete and mixed with provider choice | Architecture §2 consolidates frameworks, validation, sessions, API artifacts, Docker, jobs, providers and verification tooling. MongoDB/Mongoose is the data technology; Operations §5.2 contains the optional managed-hosting choice and URI setup. |
| Repeated catalog cache rules disagreed | Architecture §§3, 5, 12, API §§8, 10, 17, Testing §§7–8 and Operations §§2, 14 consistently follow request-time no-store catalog freshness; future caching needs reviewed invalidation. |
| Existing collection omitted from inventory | Database §§3, 16 count all 38 collections, including the already specified authRateLimits; no schema was added. |
| Editorial pass dropped existing category rules | PRD FR-24 retains active-category membership, dependent-product reassignment before deletion and inactive-navigation rules in their authoritative requirement. |
| Guest link/code descriptions disagreed | API and Design follow Database §5.3's existing high-entropy single-use link baseline. |
| Plan still implied UI prerequisites during backend or feature-first implementation | Plan §§4, 6, 8, 11–12 and AGENTS align work-package execution with foundation → backend → admin → storefront, separating application closeouts from integrated M1–M8 acceptance. |
| Task dependency lists repeated transitive prerequisites | Reduced direct lists in 132 unfinished tasks; all 209 tasks retain identical prerequisite ancestor sets. Stable IDs, scope and the other accepted records are preserved. |
| Specifications accumulated execution diaries and duplicate status lists | Testing references Tasks/evidence instead of maintaining a second task-evidence list or per-acceptance execution-status table. Operations removes task-era commentary and its duplicate milestone status column. |
| Frontend rollout instructions were buried in security controls | Operations §5.2 groups catalog/browser build and rollout procedures; §13 retains authentication/security operation controls. README setup and links follow those locations. |
| Email timeout incorrectly implied an automatic retry | Testing REL-05 distinguishes known retryable rejection from uncertain delivery, consistent with the worker recovery procedure. |
| Stale setup and visual guidance | README uses the locked install policy; Design uses current shell/component contracts and correct accessibility references; accepted refactors are not scheduled for recreation. |

**Research:** Checked the official [MongoDB connection guide](https://www.mongodb.com/docs/manual/connect-to-cluster/),
[replication/transaction capability](https://www.mongodb.com/docs/manual/replication/),
[Mongoose transaction guide](https://mongoosejs.com/docs/transactions.html) and
[OpenAPI specification](https://spec.openapis.org/oas/v3.1.1.html) against the relevant boundaries.
No dependency version upgrade, provider selection or account activation is implied by those references.

**Verification environment:** Local working tree, Node.js 24.20.0; documentation-only changes over the
existing staged package. The read-only audit uses HEAD/index task snapshots exported with `git show`.
This avoids the sandbox restriction on spawning Git inside Node; no escalation or repository mutation is needed.

| Check | Observed result |
| --- | --- |
| `npm run lint` | Passed: 421 files, 1,202 local links, 0 errors |
| `node /tmp/sportzone-documentation-audit.mjs` | Passed: 209 unique tasks; fields, checkboxes, counts, valid dependencies, no cycles/reverse-stage prerequisites, complete stage closeout coverage and unchanged prerequisite reachability. PRD has 34 FRs; Database has 38 unique collections; all 164 API operations match Testing method/path/success-status slots. |
| `git diff --check` | Passed |
| Diff review | Twelve core files reconciled; prior staged work preserved, no application/configuration files changed |
| Application/build/browser/provider suites | Not Run: runtime unchanged; no provider or deployment acceptance claimed |

The project owner independently accepted this correction through the review popup on 23 October 2026:
“Review করেছি—accept করছি, Done করো”. P01-021 moved In Review → Done under AGENTS §13.
Current register: **65 Done, 143 Not Started, 1 Blocked, zero In Review**.
P01-022/P01-023/P01-024 remain implementation/verification tasks;
scoped hosted CI and automatic OpenAPI/Postman artifacts are specified, not implemented by this change.

## Earlier accepted submission

The following sections preserve the previous submission and its acceptance. Their staged-PRD assertion,
link counts and task totals describe that earlier revision, not the correction above.

## Scope and review

Owner requested a complete, usable documentation baseline before further application implementation.
The first submission was returned for correction: “সংশোধন দরকার”. The revised pass completes the task
decomposition and dependency changes rather than leaving them as future documentation work. The prior
PRD editorial pass and its staged contents are preserved. No runtime, CI workflow or generated API
artifact is implemented by this documentation record.

- Implementation Plan owns foundation → backend → admin → storefront → integrated release, domain
  dependencies and application-package versus aggregate feature acceptance.
- At submission, Tasks assigned all 145 unfinished tasks to execution stages. Twenty-one prerequisite/closeout tasks
  were added to the earlier 188-task inventory, giving 209 unique tasks. Protected category/product/
  stock APIs, homepage/settings projections, cart merge, coupon/review administration, payment
  monitoring, claim/refund access, customer/support/reporting/audit APIs and three mixed admin
  interfaces now have explicit owners and dependencies. Original task outcomes remain aggregate.
- Reverse application dependencies are removed: reporting no longer needs dashboard UI; moderation
  no longer needs storefront review submission; API cart merge no longer needs browser persistence.
  P01-024/P03-022/P09-010/P02-017 close foundation/backend/admin/storefront respectively. Every
  unfinished stage task is reachable from its owning closeout; no stage depends on a later stage.
- Testing owns scoped verification and application closeout. Operations distinguishes target hosted
  selection from the existing full workflow and documents the existing backend-only coordinator.
- API owns executable registry and deterministic OpenAPI/Postman requirements, route parity, planned
  versus implemented metadata and sanitized templates. Generation is explicitly not implemented.
- Architecture retains module/model ownership and labels planned responsibilities accurately; Design
  removes stale pre-session shell wording. README prioritizes actual backend-only setup. Operations
  replaces speculative root build/test aliases with the executable owning-workspace interface.
  AGENTS requires changes only to documents whose actual contract/procedure changes, keeping accepted
  editorial work settled instead of rewriting specifications after routine task completion.
- PRD received a complete editorial pass: FR-01–FR-34 are explicitly authoritative; category,
  flow, page, role, data, state, delivery and deliverable summaries identify their reference role;
  product constraints, policy approval state, handover outcomes and the table of contents are
  consistent. No product scope, business rule, acceptance criterion or external gate changed.
  Database was reviewed; its persistence contracts require no change. Financial/provider/legal gates remain.
  The staged PRD is unchanged in this corrective pass.

## Verification

Documentation-only scope. Repository/link checks, task-count consistency and diff review apply;
application builds, unit/integration/browser tests and provider checks are Not Run (unchanged runtime).
Observed results:

| Check | Result |
| --- | --- |
| `npm run lint` | Passed on final handoff: 421 files, 1226 local links, 0 errors |
| `node /tmp/sportzone-documentation-audit.mjs` | Passed: 209 unique tasks, required fields/checkboxes, phase/total counts, dependency existence/cycles/stage direction, complete closeout coverage, 64 accepted records preserved and staged PRD unchanged |
| `git diff --check` | Passed |
| Diff review | Execution/verification/current-versus-target wording reconciled; runtime and accepted history untouched |

Historical evidence links affected by renamed PRD §18 were updated; prior acceptance records were preserved.

Application suites remain Not Run because this change is documentation-only.
The read-only audit initially hit the sandbox's child-process restriction on Git; the identical audit
passed with approved execution outside that restriction. Stage inventory at submission excludes already accepted work:
4 foundation, 67 backend, 18 admin, 17 storefront, 19 integrated, 11 release and 9 handover tasks.

## Remaining foundation work

The documentation package is accepted. Its next implementation tasks are P01-022 (scoped
development/CI), P01-023 (automatic OpenAPI/Postman artifacts) and P01-024 (foundation verification).
They remain Not Started and have concrete deliverables/acceptance in Tasks; no remaining documentation
decomposition is deferred to those implementation tasks. Backend stage acceptance still requires real
database/provider evidence and external inputs. A complete specification does not claim those inputs exist.

## Independent review

On 23 October 2026, the owner independently reviewed the revised package and accepted the review popup:
“সংশোধিত docs review করেছি—accept করছি, Done করো”. P01-021 moved from In Review to Done under
AGENTS §13. The earlier correction request remains part of this record. The register now contains
65 Done, 143 Not Started and 1 Blocked task, with zero In Review. P01-022/P01-023/P01-024 remain
implementation/verification work; no foundation-stage, product milestone or provider gate is accepted
by this documentation decision.
