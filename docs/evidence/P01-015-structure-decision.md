# P01-015 — Engineering baseline verification

Date: 20 October 2026 (Asia/Dhaka). Status: **Done**. Executor: Codex. Accepted by the project owner on 20 October 2026.

## Scope and decision status

This revision specifies the engineering baseline for subsequent tooling and application refactoring. Normative requirements belong to the owning specifications listed below. Task acceptance, implemented capabilities and environment readiness require their own evidence.

The baseline retains Next.js, React/Vite, Express, MongoDB/Mongoose, HeroUI and npm workspaces. It defines feature-based UIs, entity-prefixed backend layers, narrow module capabilities, one locked dependency graph, inventory-driven CI, reviewed source control and traceable artifact promotion. Engineering choices are specified; hosting accounts/budget, merchant capability, legal policy, recovery targets and operational appointments remain environment inputs under Operations Appendix C and EXT-01–09.

## Document reconciliation

| Owner | Revision |
| --- | --- |
| [Architecture](../ARCHITECTURE.md) §§4–6,14 | Application structures, naming, monorepo/dependencies, module boundaries and engineering rationale |
| [Database](../DATABASE.md) §4.2 | Canonical model registration and restricted shared-collection writes |
| [API](../API.md) §2.2 | Concrete module mapping; existing HTTP and security contracts preserved |
| [Design](../DESIGN.md), [UI Components](../DESIGN.md#65-app-owned-ui-boundary-and-component-apis) | Component placement and implementation transition |
| [Implementation Plan](../IMPLEMENTATION_PLAN.md) §3.6, [Tasks](../TASKS.md) | Tooling/refactor sequence, stable IDs, dependencies and actual statuses |
| [Testing](../TESTING.md) §15 | Regression parity, discovery, CI failure/skip/cancellation and evidence requirements |
| [Operations](../OPERATIONS.md) §§5,11, Appendix C | CI execution/security/caching, Git policy, artifact/deployment compatibility and environment acceptance |
| [README](../../README.md), [AGENTS](../../AGENTS.md), [Changelog](../../CHANGELOG.md) | Setup orientation, execution rules and revision record |

Requirements are placed in their owning numbered sections; conversational rationale and repeated introductory supplements have been removed. Historical task/evidence records remain historical. PRD product scope, financial rules and existing acceptance gates are unchanged.

## Original implementation boundary (historical)

- P01-016: CI inventory/jobs, cross-app ownership, reports and required-result governance.
- P01-017: coordinated development processes, import-boundary guards and source-format checks.
- P03-019/P03-020: backend composition and cohesive module boundaries.
- P02-012/P02-013: storefront/admin placement.
- All six implementation tasks are **Not Started**. P01-015 remains **In Review** pending independent acceptance.
- Manifests, lockfile, workflow/runner, application source, database and deployments are unchanged by this revision. New commands, scanners, dependencies, containers and remote protection settings are specified targets, not verified installation/configuration.

## Research and technical conclusions

Official sources accessed 20 October 2026:

| Source | Supported mechanism and project application |
| --- | --- |
| [npm workspaces](https://docs.npmjs.com/cli/v11/using-npm/workspaces/) and [locked installation](https://docs.npmjs.com/cli/v11/commands/npm-ci/) | Workspace dependency/install behavior; retain one root lock and consuming-package declarations |
| [GitHub workflow syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) and [dependency results](https://docs.github.com/en/actions/reference/workflows-and-actions/contexts) | Explicit job dependencies and success/failure/cancelled/skipped results; aggregate required checks must evaluate actual results |
| [GitHub secure use](https://docs.github.com/en/actions/reference/security/secure-use) | Immutable action references and scoped credentials; retain SHA pinning and unprivileged PR execution |
| [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/), [Gitleaks](https://github.com/gitleaks/gitleaks), [Dependabot configuration](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference) | Dependency advisory reports, repository secret detection and controlled update PRs; pin and verify implementing tool versions |
| [GitHub deployment environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) | Protection controls and account/plan-dependent availability; verify remote enforcement before claiming it |
| [Playwright CI](https://playwright.dev/docs/ci) | Explicit browser/dependency installation and limited value of browser-binary caching; preserve required engines |
| [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting) | Runtime/reverse-proxy and build-time configuration considerations; record environment-bound frontend artifact identity |
| [Next.js organization](https://nextjs.org/docs/app/getting-started/project-structure) and [server/client boundaries](https://nextjs.org/docs/app/getting-started/server-and-client-components) | Route organization and enforced server-only imports |
| [React state](https://react.dev/learn/choosing-the-state-structure), [React Router modes](https://reactrouter.com/start/modes), [TanStack Query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults) | State ownership, existing router mode and explicit query retry/cache configuration |
| [Mongoose transactions](https://mongoosejs.com/docs/transactions.html) | Session-aware transactional behavior; avoid nested and parallel operations within a transaction |

The repository-specific choices are engineering judgments, not vendor certifications or measured performance claims. No load benchmark, hosting quote, provider transaction or deployed acceptance check was performed.

## Original verification record (historical)

The initial structure revision passed repository guards (258 files, 1,101 local links), whitespace checks and a 176-task register audit. Final engineering reconciliation extends the staged documentation; its results below supersede those counts for the current revision.

| Check | Environment | Current revision result |
| --- | --- | --- |
| `npm run lint` | Local repository/documentation guards | Passed — 258 files, 1,102 local links, zero errors |
| `git diff --check` and `git diff --cached --check` | Unstaged and staged documentation | Passed — no whitespace errors |
| Register audit | Read-only Node: IDs, statuses, phase/dashboard totals, dependencies and cycles | Passed — 178 unique tasks, 12 phases, 39 Done, 1 In Review, 138 Not Started; totals consistent and dependencies acyclic |
| Preservation review | Staged task/API baseline compared with working files; Markdown-only scope and local anchors | Passed — all 176 prior task statuses preserved, 2 new tasks; API §3 onward unchanged after excluding table alignment; 29 local document anchors checked with no errors; only Markdown edited |
| Application/unit/integration/browser/deployment/provider checks | No implementation changes | Not Run — outside documentation scope; no runtime acceptance claimed |

## Acceptance and remaining work

Independent review covers document consistency and verification evidence. Existing accepted task statuses and milestone records are retained; this revision does not self-approve them. Operational inputs remain tracked in their existing readiness register, with no fabricated credentials, resource selections, numerical recovery guarantees or provider activation.

## Owner acceptance

Date: 20 October 2026. Reviewer/approver: project owner. Executor: Codex.
The owner authorized checking and closing the remaining In Review tasks. The closure review reconciled
Architecture §§4–6,14, Implementation Plan §3.6, Operations §§5.2/5.5, Testing §15, README and the task
register. Current owning documents specify the simplified single-job CI and implemented P01-017 tooling;
the original unimplemented-task and multi-job statements above describe their historical revision.
Technology choices, MongoDB/Mongoose persistence, product/security invariants and external launch gates
remain unchanged. Decision: accept P01-015; In Review → Done. P01-016 remote verification is still required;
no implementation, milestone, merchant or deployment gate is accepted through this documentation decision.

Verification for closure: repository Markdown/link checks, cross-document reference review and whitespace
review only. Application/runtime suites are Not Run for this documentation-only acceptance update.
