# P01-015 — Structure decision and documentation reconciliation

Date: 20 October 2026 (Asia/Dhaka). Status: **In Review**. Executor: Codex. Reviewer/acceptance owner: project owner; acceptance of this resulting document change is not yet recorded.

## Authority and scope

The owner supplied concrete frontend/backend feature structures, reviewed the resulting architecture proposal, and instructed: “now docs gula update kore felo then amra aste aste current projects gulaw refactor kore felbo”. This authorizes documenting the selected direction and planning gradual refactors. It does not assert completed code moves, database migration, provider readiness or milestone acceptance.

Selected direction: Next.js storefront, React/Vite admin, Express modular monolith, MongoDB/Mongoose, HeroUI and npm workspaces. Feature-based UIs; entity-prefixed backend model/validation/service/controller/routes/types; typed composition; public module capabilities; existing durable transaction/job safeguards. No PostgreSQL migration is selected.

## Reconciled documents

| Document | Reconciliation |
| --- | --- |
| [Architecture](../ARCHITECTURE.md) §§4–6,14 | Target trees, naming, placement, module ownership, fetching/state/validation, canonical models and composition |
| [Database](../DATABASE.md) §4.2 | Concrete owner mapping for users/variants/delivery/media; no collection/schema/index change |
| [API](../API.md) §2.2 | Concrete module mapping while preserving operation/URL/DTO/session/CSRF contracts |
| [Design](../DESIGN.md), [UI Components](../UI_COMPONENTS.md) | Layout/feature/reusable component ownership with current-path transition notes |
| [Implementation Plan](../IMPLEMENTATION_PLAN.md) §3.6, [Tasks](../TASKS.md) | Incremental work and five added stable IDs, correct counts/statuses; old acceptance retained |
| [Testing](../TESTING.md), [Operations](../OPERATIONS.md) | Import/test-discovery parity, worker/tool/runbook compatibility and recovery requirements |
| [README](../../README.md), [AGENTS](../../AGENTS.md), [Changelog](../../CHANGELOG.md) | Orientation, execution rules and documentation-only change record |

PRD requirements did not change. Manifests, lockfile, CI scripts/inventory, app sources and database data were not modified. TanStack Query/frontend Zod are selected for future consuming features; installation and compatibility checks remain their implementation work.

## Planned implementation and verification limits

- P03-019: typed composition/config/runtime registration; P03-020: cohesive backend boundaries/file conventions and provider adapters.
- P02-012: storefront layout/route/feature placement; P02-013: admin composition/layout/feature placement.
- All four implementation tasks are **Not Started**. Documentation task is **In Review**, with no checkbox or milestone self-approval.
- Existing accepted auth/database/UI evidence remains historical evidence. Future changes require the affected runtime, replica-set, HTTP and browser parity checks; silent test-discovery loss is unacceptable.

## Verification

Working tree was clean at the start of this documentation task. Repository baseline, package scripts, current source paths and owning specification sections were inspected before editing.

| Check | Environment | Result |
| --- | --- | --- |
| `npm run lint` | Local repository documentation guards | Passed — 258 files, 1,101 local links, 0 errors; repeated after diff review |
| `git diff --check` | Local working tree | Passed — no whitespace errors |
| Task register audit (IDs, statuses, dependencies, phase/dashboard totals) | Read-only `node --input-type=module -e` audit | Passed — 176 unique tasks across 12 phases; 39 Done, 1 In Review, 136 Not Started; no checkbox/header/dashboard or missing dependency mismatch |
| Compare existing tasks against `git show HEAD:docs/TASKS.md`; traverse dependency graph | Read-only Git output piped into Node audit | Passed — all 171 existing task checkboxes/statuses preserved, 5 tasks added, dependency graph acyclic |
| Application builds/unit/integration/browser/provider checks | No runtime changes | Not Run — outside this documentation-only task; no runtime acceptance claimed |

Supplemental audit initially hit sandbox `spawnSync git EPERM` when Git was launched inside Node. Running Git directly and piping its read-only output into Node completed the same audit successfully; no escalation or application mutation was required. Diff review confirmed only Markdown changes plus this new Markdown evidence record.

Concurrent table alignment appeared in API.md during final review and was preserved. A read-only normalized comparison against `HEAD:docs/API.md` verified that contract content from §3 onward is unchanged after excluding whitespace/table separators; the architecture edits are confined to date and §2 ownership/transition text.

## Research basis

The preceding analysis used official [Next.js organization](https://nextjs.org/docs/app/getting-started/project-structure), [server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components), [React state](https://react.dev/learn/choosing-the-state-structure), [React Router modes](https://reactrouter.com/start/modes), [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) and [Mongoose transactions](https://mongoosejs.com/docs/transactions.html), accessed 20 October 2026. Those sources explain mechanisms; the owner-selected structure is a project design decision. No performance benchmark, live merchant check or external deployment was performed.

## Acceptance

Pending independent project-owner review of the resulting documentation diff. No unresolved product/financial contract conflict identified; physical path migration and dependency installation remain explicitly future work.
