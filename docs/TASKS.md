# SportZone — Development tasks

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 17 October 2026

**Product reference:** [PRD](./PRD.md)\
**Technical reference:** [Architecture](./ARCHITECTURE.md)\
**Design reference:** [Design](./DESIGN.md)\
**Execution plan:** [Implementation Plan](./IMPLEMENTATION_PLAN.md)\
**Scope:** Single-store sports e-commerce platform for Bangladesh\
**Audience:** Software engineers and development agents

This document decomposes the approved implementation plan into independently verifiable execution tasks with stable IDs, prerequisites, expected outcomes, acceptance checks and evidence requirements. The PRD governs product scope and business rules; `ARCHITECTURE.md` governs technical boundaries; `DESIGN.md` governs interface behavior; `IMPLEMENTATION_PLAN.md` governs work-package sequencing and milestone acceptance. No task entry here overrides those sources or represents work already completed.

---

**Contents**

- [1. Overview & execution rules](#1-overview--execution-rules)
- [2. Task management conventions](#2-task-management-conventions)
- [3. Project progress dashboard](#3-project-progress-dashboard)
- [4. Milestone tracker](#4-milestone-tracker)
- [5. Phase-by-phase task register](#5-phase-by-phase-task-register)
  - [Phase 01 — Requirements finalization and planning](#phase-01--requirements-finalization-and-planning)
  - [Phase 02 — UI/UX design](#phase-02--uiux-design)
  - [Phase 03 — Authentication and core backend](#phase-03--authentication-and-core-backend)
  - [Phase 04 — Product catalog and inventory](#phase-04--product-catalog-and-inventory)
  - [Phase 05 — Cart, wishlist, coupons, and reviews](#phase-05--cart-wishlist-coupons-and-reviews)
  - [Phase 06 — Checkout, orders, and delivery rules](#phase-06--checkout-orders-and-delivery-rules)
  - [Phase 07 — Payment integration and verification](#phase-07--payment-integration-and-verification)
  - [Phase 08 — Returns and refunds](#phase-08--returns-and-refunds)
  - [Phase 09 — Admin management and reports](#phase-09--admin-management-and-reports)
  - [Phase 10 — Testing, security review, and bug fixing](#phase-10--testing-security-review-and-bug-fixing)
  - [Phase 11 — Deployment and production verification](#phase-11--deployment-and-production-verification)
  - [Phase 12 — Documentation and handover](#phase-12--documentation-and-handover)
- [6. Dependencies & blockers](#6-dependencies--blockers)
- [7. Requirements coverage matrix](#7-requirements-coverage-matrix)
- [8. Verification & completion rules](#8-verification--completion-rules)
- [9. Change & execution log](#9-change--execution-log)

---

## 1. Overview & execution rules

- Work from the approved source documents; check current requirements and affected business rules before starting a task.
- Before each feature slice, update its `DATABASE.md` and `API.md` contracts and applicable `TESTING.md`/`OPERATIONS.md` sections; do not postpone first creation to Phase 12.
- Implement complete vertical slices with real API integration; mocks are test doubles, never proof of external-service acceptance.
- Follow declared dependencies rather than task ID alone. Parallel work is allowed once shared contracts exist.
- Keep financial decisions in the Express backend; use integer poisha, immutable order snapshots, guarded state transitions, transactions and replay-safe operations as specified.
- Do not invent merchant activation, legal compliance, customer data, policy approvals, provider refunds or production readiness.
- PRD §3.3 requires bKash, Nagad, and Rocket plus COD for launch. Hide inactive methods, but keep launch blocked until all required channels are verified or an explicit PRD scope change revises acceptance.
- Record tests and review evidence before completion. The release gates in the Implementation Plan still apply even when every engineering checkbox appears checked.
- Scope changes require source-document approval before changing this register; preserve existing IDs when adding tasks.

## 2. Task management conventions

| Field | Rule |
| --- | --- |
| Task ID | `PXX-NNN` with stable phase number and monotonically allocated ID; never renumber an existing task |
| Checkbox | `[ ]` while not accepted; `[x]` only when status is `Done` and all applicable acceptance checks pass |
| Status | `Not Started`, `Ready`, `In Progress`, `Blocked`, `In Review`, `Done`, or `Deferred` |
| Owner | Assign during execution; no owner is fabricated in this planning baseline |
| Sources | Task-level FR/section pointers plus inherited references to its phase in Implementation Plan §6 |
| Depends on | Concrete task IDs that must be accepted before this task is considered ready; some external prerequisites also apply |
| Deliverable | The specific product/code/process outcome expected from the task |
| Acceptance | Observable pass conditions, supplemented by all applicable PRD and Design requirements |
| Evidence | Test report, committed artifact, screenshot/record, provider validation or approver sign-off; add actual link after execution |
| Blocked | Capture missing prerequisite, owner, impact, permitted parallel work and next verification step |
| Deferred | Requires explicit scope/launch disposition; a mandatory safety or release criterion cannot be waived by status alone |

**Status changes:** Start each task as `Not Started`. Move to `Ready` only after dependencies and required external prerequisites are satisfied; `In Progress` indicates active work; `In Review` indicates submitted evidence awaiting verification. Mark `Done` and check the box only after independent acceptance. A blocked external provider or policy gate cannot be cleared by a mock. Task metadata may be updated as execution proceeds, while source-approved requirements stay unchanged.

| Status | Required record / exit condition |
| --- | --- |
| `Not Started` | No accepted implementation or task evidence is implied; keep the checkbox unchecked |
| `Ready` | Declared task prerequisites are Done and required external inputs for this work are available |
| `In Progress` | Actual work has started; record the executor, scope and applicable verification needs |
| `Blocked` | Record the failed prerequisite, accountable function, affected acceptance, evidence and next action; resume affected work only after its prerequisite is resolved |
| `In Review` | Deliverable and applicable observed verification results are attached; independent acceptance is pending |
| `Done` | Applicable Definition of Done is met; record actual independent reviewer, date, decision and evidence; check the box |
| `Deferred` | Record authorized scope/release disposition, rationale and impact; mandatory safety/launch gates cannot be waived by this status |

**Evidence record:** Link the exact task/deliverable revision or commit, source references, verification command/procedure,
environment and fixture, observed result, artifact, executor and actual reviewer decision. Use
[Testing §17.2](./TESTING.md#172-test-evidence-record) for test-run fields. Distinguish planned cases from executed tests,
and local doubles from real database/provider evidence. Record unavailable checks as Not Run or Blocked with their cause;
never infer acceptance from a generated file, a green unrelated check or an unavailable infrastructure dependency.

**Transition record:** For a material status change, update the task, phase/total counts and execution log together. Record
the prior/resulting state, reason, evidence, executor/reviewer and next action. Preserve accepted history; if acceptance
is invalidated by a defect or contract change, reopen the affected work with linked correction/retest evidence and review.
Preserve stable IDs and dependency references. Task acceptance never automatically accepts a milestone; milestone records
retain their own approver, environment, artifacts, blockers and explicit decision under Implementation Plan §11.

**Task granularity:** One task targets one reviewable engineering outcome. Do not create redundant folder-only microtasks or combine whole subsystems under one checkbox. An item may be split if its verification grows independently; retain the original identifier as a parent or approved replacement record with traceability.

## 3. Project progress dashboard

The register contains 171 tasks across twelve phases. Update phase totals when tasks are added or statuses change.

| Phase | Total | Not Started | Ready | In Progress | Blocked | In Review | Done | Deferred |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 01 — Requirements Finalization and Planning | 14 | 0 | 0 | 0 | 0 | 0 | 14 | 0 |
| 02 — UI/UX Design | 11 | 9 | 0 | 0 | 0 | 0 | 2 | 0 |
| 03 — Authentication and Core Backend | 18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| 04 — Product Catalog and Inventory | 15 | 15 | 0 | 0 | 0 | 0 | 0 | 0 |
| 05 — Cart, Wishlist, Coupons, and Reviews | 13 | 13 | 0 | 0 | 0 | 0 | 0 | 0 |
| 06 — Checkout, Orders, and Delivery Rules | 20 | 20 | 0 | 0 | 0 | 0 | 0 | 0 |
| 07 — Payment Integration and Verification | 17 | 17 | 0 | 0 | 0 | 0 | 0 | 0 |
| 08 — Returns and Refunds | 18 | 18 | 0 | 0 | 0 | 0 | 0 | 0 |
| 09 — Admin Management and Reports | 12 | 12 | 0 | 0 | 0 | 0 | 0 | 0 |
| 10 — Testing, Security Review, and Bug Fixing | 13 | 13 | 0 | 0 | 0 | 0 | 0 | 0 |
| 11 — Deployment and Production Verification | 11 | 11 | 0 | 0 | 0 | 0 | 0 | 0 |
| 12 — Documentation and Handover | 9 | 9 | 0 | 0 | 0 | 0 | 0 | 0 |
| **Total** | **171** | **155** | **0** | **0** | **0** | **0** | **16** | **0** |

## 4. Milestone tracker

| Gate | Required task evidence | Initial status |
| --- | --- | --- |
| M1 — Foundation Ready | P01–P03 setup/auth/API/session/CI/theme checks; Implementation Plan §11 | Not Accepted |
| M2 — Catalog Ready | P04 admin catalog, public browsing, variant and atomic stock evidence | Not Accepted |
| M3 — COD Commerce Ready | P05–P06 cart/pricing, COD, checkout idempotency, order/guest/delivery tests | Not Accepted |
| M4 — Payment Ready | P07 sandbox provider validation, callbacks, retries, late payment, risk, overpayment | Not Accepted |
| M5 — After-Sales Ready | P08 claim/inspection, refund caps, confirmed payout and review qualification | Not Accepted |
| M6 — Feature Complete / Release Candidate | P09 admin/staging integration plus P10 PRD/NFR/security/UX regression | Not Accepted |
| M7 — Production Ready | P11 operational, policy, merchant, deployment, live-safe validation and launch approval | Not Accepted |
| M8 — Handover Accepted | P12 documented ownership, runbooks, evidence reconciliation and sign-off | Not Accepted |

Milestone acceptance follows the prerequisites in Implementation Plan §11. Gate tasks explicitly depend on prior verification tasks; the milestone tracker separately records human acceptance. Independent engineering work may proceed when its own contracts and dependencies are ready.

Passing a task checklist never automatically accepts a milestone. Record approver, environment, test artifact, open blockers and decision separately when each gate is reviewed.

## 5. Phase-by-phase task register

Each task records its source, dependencies, deliverable, acceptance criteria and evidence. Apply the full Definition of Done in Implementation Plan §3.3.

### Phase 01 — Requirements finalization and planning

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 01. **Associated gate:** M1. **Tasks:** 14.

- [x] **P01-001 — Verify approved document baseline and paths**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §1; Architecture §4; Design §1\
  **Depends on:** Approved documents and execution kickoff (no task prerequisite)\
  **Deliverable:** Confirm PRD, ARCHITECTURE, DESIGN and IMPLEMENTATION_PLAN versions and paths within docs/.\
  **Acceptance:** The files resolve and their authority/order is documented; do not rewrite approved specifications.\
  **Evidence:** [Verified baseline checklist, paths, authority and source hashes](./evidence/P01-001-baseline.md).\
  **Accepted:** Project owner, 17 October 2026 — “Checklist গ্রহণ করছি”.

- [x] **P01-002 — Confirm initial-release boundaries and open decisions**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §3; §19\
  **Depends on:** `P01-001`\
  **Deliverable:** Record one store, BDT, single admin role, included and excluded scope.\
  **Acceptance:** Excluded features are not accidentally made prerequisites; unresolved policy/provider issues are explicit decisions.\
  **Evidence:** [Scope inventory, exclusions, external decisions and verification](./evidence/P01-002-scope.md).\
  **Accepted:** Project owner, 17 October 2026 — “Scope checklist গ্রহণ করছি”.

- [x] **P01-003 — Establish complete FR and acceptance mapping**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §5; §14; Implementation Plan §8\
  **Depends on:** `P01-001`\
  **Deliverable:** Trace FR-01 through FR-34, their individual subrequirements/business rules, and PRD §14 acceptance checks to owning phases/tasks, UI/API surfaces and verification tests; link applicable NFRs from P01-004.\
  **Acceptance:** Every applicable subrequirement and PRD §14 check has an owner and planned pass/fail evidence slot; gaps, shared ownership and release blockers are explicit without asserting completion.\
  **Evidence:** [Complete clause, acceptance, surface, task and verification mapping](./evidence/P01-003-traceability.md).\
  **Accepted:** Project owner, 17 October 2026 — “Traceability register গ্রহণ করছি”.

- [x] **P01-004 — Map NFRs and release acceptance**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §12; §14; §18\
  **Depends on:** `P01-003`\
  **Deliverable:** Track privacy, performance, accessibility, browser, reliability, availability and release controls.\
  **Acceptance:** No mandatory NFR or release gate is omitted from the planned verification register.\
  **Evidence:** [Complete NFR, release, acceptance and milestone coverage register](./evidence/P01-004-nfr-release.md).\
  **Accepted:** Project owner, 17 October 2026 — “NFR/release register গ্রহণ করছি”.

- [x] **P01-005 — Open operator and external-service readiness register**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §19; Implementation Plan §4.4\
  **Depends on:** `P01-002`\
  **Deliverable:** Record owners and evidence needs for merchant, MongoDB, email, Cloudinary, media, hosting, policies and catalog content.\
  **Acceptance:** Unknown activation/approval is marked pending rather than assumed complete.\
  **Evidence:** [Opened readiness register, accountable functions, evidence requirements and next actions](./evidence/P01-005-readiness.md).\
  **Accepted:** Project owner, 17 October 2026 — “Readiness register গ্রহণ করছি”.

- [x] **P01-006 — Verify planned gateway and refund feasibility**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** FR-12; FR-18; PRD §19\
  **Depends on:** `P01-005`\
  **Deliverable:** Identify sandbox credentials, supported channels, limits, server validation and refund/status capabilities to verify.\
  **Acceptance:** Merchant activation and live refund capability remain external gates until evidenced.\
  **Evidence:** [Official-source assessment, protected inputs, capability checklist and external gates](./evidence/P01-006-gateway-feasibility.md).\
  **Accepted:** Project owner, 17 October 2026 — “Gateway/refund assessment গ্রহণ করছি”.

- [x] **P01-007 — Identify policy and customer-rights validation gates**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** FR-16; FR-17; FR-18; FR-34\
  **Depends on:** `P01-005`\
  **Deliverable:** Record approvals required for delivery, complaints, cancellation, return, refund and privacy content.\
  **Acceptance:** Store policy drafts are not represented as legally certified; launch verification owner is assigned.\
  **Evidence:** [Policy approval gates, accountable launch role, official review sources and verification checklist](./evidence/P01-007-policy-gates.md).\
  **Accepted:** Project owner, 17 October 2026 — “Policy-gate record গ্রহণ করছি”.

- [x] **P01-008 — Define safety-critical scenarios and dependency path**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** PRD §11; Architecture §§7,10; Implementation Plan §7\
  **Depends on:** `P01-003`\
  **Deliverable:** Map overselling, coupon races, duplicate checkout, late/duplicate payment, refunds, sessions and guest proof to tests.\
  **Acceptance:** Every high-risk scenario has a later verification owner and cannot be waived by a mock.\
  **Evidence:** [Safety-critical scenarios, verification owners and dependency path](./evidence/P01-008-critical-scenarios.md).\
  **Accepted:** Project owner, 17 October 2026 — “Critical-scenario map গ্রহণ করছি”.

- [x] **P01-009 — Initialize minimal npm-workspaces repository**\
  **Status:** `Done` · **Area:** Tooling · **Owner:** Codex\
  **Sources:** Architecture §4; Implementation Plan §4.2\
  **Depends on:** `P01-001`\
  **Deliverable:** Create root workspace configuration, .gitignore, sanitized .env.example and lockfile; preserve the documentation layout and extend README with verified setup commands.\
  **Acceptance:** Workspace discovery works; no secret is committed; no unapproved feature scaffolding.\
  **Evidence:** [Repository foundation, clean installs, workspace discovery and configuration checks](./evidence/P01-009-workspace.md).\
  **Accepted:** Project owner, 17 October 2026 — “Workspace foundation গ্রহণ করছি”.

- [x] **P01-010 — Establish baseline CI and quality workflow**\
  **Status:** `Done` · **Area:** Tooling · **Owner:** Codex\
  **Sources:** Architecture §13; Implementation Plan §§4.2,12.2\
  **Depends on:** `P01-009`\
  **Deliverable:** Configure CI for available workspace lint, type checks, tests and builds, extending checks as apps are scaffolded.\
  **Acceptance:** CI fails when configured checks fail; missing app setup is tracked rather than silently reported as passing.\
  **Evidence:** [CI workflow, local pipeline and deliberately failing checks](./evidence/P01-010-ci.md); hosted run [39039353486](https://github.com/mdnuruzzamannirob/sportzone/actions/runs/39039353486) Passed.\
  **Accepted:** Project owner, 17 October 2026 — “accha yabar ay task ta done koro”.

- [x] **P01-011 — Reconcile and verify AGENTS.md execution rules**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** Architecture §4; Implementation Plan §§1.3,4.2\
  **Depends on:** `P01-001`, `P01-009`\
  **Deliverable:** Document source precedence, scope constraints, task evidence, change control and safety checks.\
  **Acceptance:** Instructions do not contradict PRD, Architecture, Design or Implementation Plan.\
  **Evidence:** [Reviewed agent instructions, authority consistency and safety/evidence controls](./evidence/P01-011-agent-rules.md).\
  **Accepted:** Project owner, 17 October 2026 — “Agent-rule review গ্রহণ করছি”.

- [x] **P01-012 — Establish task statuses and evidence protocol**\
  **Status:** `Done` · **Area:** Planning · **Owner:** Codex\
  **Sources:** Implementation Plan §§3.4,11,14\
  **Depends on:** `P01-003`, `P01-008`\
  **Deliverable:** Keep stable task IDs, dependencies, milestone gates, blocker dispositions and completion-evidence rules.\
  **Acceptance:** Every task is initially unverified; status changes require acceptance evidence.\
  **Evidence:** [Task/status/evidence protocol review and register reconciliation](./evidence/P01-012-task-protocol.md).\
  **Accepted:** Project owner, 17 October 2026 — “Task protocol গ্রহণ করছি”.

- [x] **P01-013 — Establish `TESTING.md` baseline**\
  **Status:** `Done` · **Area:** Documentation/quality · **Owner:** Codex\
  **Sources:** PRD §§12,14; Architecture §12; Implementation Plan §4.3\
  **Depends on:** `P01-004`, `P01-008`, `P01-009`\
  **Deliverable:** Review and reconcile the TESTING.md baseline with test layers, requirement/scenario mapping, fixtures, environment prerequisites, commands as tooling becomes available, and evidence conventions.\
  **Acceptance:** Critical risks and FR/NFR checks have verification owners; foundation tasks establish the documented command interface. Extend procedures before each feature's acceptance.\
  **Evidence:** [Reviewed testing baseline, requirement owners and current verification interface](./evidence/P01-013-testing-baseline.md).\
  **Accepted:** Project owner, 17 October 2026 — “Testing baseline গ্রহণ করছি”.

- [x] **P01-014 — Establish `OPERATIONS.md` baseline**\
  **Status:** `Done` · **Area:** Documentation/operations · **Owner:** Codex\
  **Sources:** PRD §18; Architecture §13; Implementation Plan §4.3\
  **Depends on:** `P01-005`, `P01-009`\
  **Deliverable:** Review and reconcile the OPERATIONS.md baseline with environments, configuration names, provider/account ownership, deployment/recovery prerequisites, monitoring, backup/restore, incident and operator sections.\
  **Acceptance:** Unknown hosting values remain tracked decisions; later deployments require executable updated runbooks, with no secrets or invented provider readiness.\
  **Evidence:** [Operations baseline, configuration reconciliation, runbook owners and decision gates](./evidence/P01-014-operations-baseline.md).\
  **Accepted:** Project owner, 17 October 2026 — “Operations baseline গ্রহণ করছি”.

### Phase 02 — UI/UX design

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 02. **Associated gate:** M1. **Tasks:** 11.

- [x] **P02-001 — Scaffold Next.js storefront workspace**\
  **Status:** `Done` · **Area:** Frontend/storefront · **Owner:** Codex\
  **Sources:** Architecture §§2,4,5\
  **Depends on:** `P01-009`\
  **Deliverable:** Initialize Next.js App Router with React, TypeScript and Tailwind and functional build scripts.\
  **Acceptance:** Builds independently; public and private routes have appropriate layout boundaries.\
  **Evidence:** [Storefront build, route/cache boundaries, component and production smoke verification](./evidence/P02-001-storefront.md). Accepted by project owner on 17 October 2026: “Storefront scaffold গ্রহণ করছি”.

- [x] **P02-002 — Scaffold React + Vite admin workspace**\
  **Status:** `Done` · **Area:** Frontend/admin · **Owner:** Codex\
  **Sources:** Architecture §§2,4,5\
  **Depends on:** `P01-009`\
  **Deliverable:** Initialize React, Vite, TypeScript, Tailwind and SPA routing.\
  **Acceptance:** Builds independently and supports secured app shell routing without assuming authorization.\
  **Evidence:** [Admin build, DOM navigation and built-asset smoke verification](./evidence/P02-002-admin.md). Accepted by project owner on 17 October 2026: “Admin scaffold গ্রহণ করছি”.

- [ ] **P02-003 — Implement monochrome design tokens across both apps**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §2.2\
  **Depends on:** `P02-001`, `P02-002`\
  **Deliverable:** Create semantic CSS token mappings for light/dark themes.\
  **Acceptance:** Brand #2563EB and on-brand white remain identical in both modes; neutrals are grayscale.\
  **Evidence to attach:** Token assertions and visual comparison.

- [ ] **P02-004 — Configure typography, spacing and currency utilities**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §§2.3-2.5\
  **Depends on:** `P02-003`\
  **Deliverable:** Configure Inter, Plus Jakarta Sans, Bengali fallback, spacing/radii and BDT/tabular formatting.\
  **Acceptance:** Fonts have fallbacks; layouts are stable and amounts display consistently.\
  **Evidence to attach:** Typography and money-format tests.

- [ ] **P02-005 — Implement Light/Dark/System preference and bootstrap**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §2.2\
  **Depends on:** `P02-003`\
  **Deliverable:** Apply persisted appearance before paint and support system preference and reduced motion.\
  **Acceptance:** Theme changes do not reset forms or navigation; first paint avoids theme flash.\
  **Evidence to attach:** Both-theme interactive tests.

- [ ] **P02-006 — Implement responsive storefront navigation shell**\
  **Status:** `Not Started` · **Area:** Frontend/storefront\
  **Sources:** Design §§3-5\
  **Depends on:** `P02-001`, `P02-005`\
  **Deliverable:** Build header, footer, mobile navigation, policy/support entry points, loading/error and not-found shell states.\
  **Acceptance:** Keyboard and mobile navigation works; placeholders do not imply feature completion.\
  **Evidence to attach:** Responsive/keyboard shell check.

- [ ] **P02-007 — Implement admin navigation and protected-layout presentation**\
  **Status:** `Not Started` · **Area:** Frontend/admin\
  **Sources:** Design §§3-5\
  **Depends on:** `P02-002`, `P02-005`\
  **Deliverable:** Build admin sidebar/drawer, title/action shell and signed-out presentation.\
  **Acceptance:** Narrow layouts retain navigation; client route guards do not replace backend authorization.\
  **Evidence to attach:** Route/accessibility preview.

- [ ] **P02-008 — Implement accessible form and feedback primitives**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §§6,9-10\
  **Depends on:** `P02-003`, `P02-004`\
  **Deliverable:** Build inputs, selection controls, validation feedback, alerts, buttons, dialogs, drawers, focus handling and loading states.\
  **Acceptance:** Error text associates with fields; dialogs restore focus and preserve entered data.\
  **Evidence to attach:** Component tests and manual keyboard evidence.

- [ ] **P02-009 — Implement reusable commerce visual primitives**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §§6-7\
  **Depends on:** `P02-008`\
  **Deliverable:** Build price, product card, variant selector, cart line, status badge, order summary and skeleton primitives.\
  **Acceptance:** States show text not color alone; no browser calculation treated as final checkout truth.\
  **Evidence to attach:** Component state tests in both themes.

- [ ] **P02-010 — Implement reusable admin visual primitives**\
  **Status:** `Not Started` · **Area:** Design/UI\
  **Sources:** Design §§6,8\
  **Depends on:** `P02-008`, `P02-007`\
  **Deliverable:** Build table/filter/pagination, file upload and guarded action/confirmation patterns.\
  **Acceptance:** Keyboard operation, action feedback and small-screen overflow are usable.\
  **Evidence to attach:** Admin component tests.

- [ ] **P02-011 — Verify foundation responsiveness and WCAG-targeted behavior**\
  **Status:** `Not Started` · **Area:** Quality/UI\
  **Sources:** Design §§3,12,14\
  **Depends on:** `P02-006`, `P02-007`, `P02-008`, `P02-009`, `P02-010`\
  **Deliverable:** Audit foundations in both themes at representative viewports and with keyboard and reduced motion.\
  **Acceptance:** Focus, contrast, reflow and theme persistence findings resolved or documented as blockers.\
  **Evidence to attach:** Visual/a11y audit report.

### Phase 03 — Authentication and core backend

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 03. **Associated gate:** M1. **Tasks:** 18.

- [ ] **P03-001 — Bootstrap modular Express API and shared middleware**\
  **Status:** `Not Started` · **Area:** Backend/core\
  **Sources:** Architecture §§4,6,8\
  **Depends on:** `P01-009`\
  **Deliverable:** Initialize TypeScript Express backend, /api/v1 envelopes, error handling, validation, pagination and test bootstrap.\
  **Acceptance:** Independently builds; validated errors do not leak internals; controllers delegate to services.\
  **Evidence to attach:** API lint/type/build and request tests.

- [ ] **P03-002 — Configure MongoDB/Mongoose and transactional test environment**\
  **Status:** `Not Started` · **Area:** Backend/data\
  **Sources:** Architecture §§7,13\
  **Depends on:** `P03-001`, `P01-005`\
  **Deliverable:** Configure connection lifecycle, schema conventions, indexes, replica-set-capable local/test DB and safe fixtures.\
  **Acceptance:** Required transactions run on supported deployment; unique indexes are verifiable.\
  **Evidence to attach:** DB integration and index test evidence.

- [ ] **P03-003 — Add environment validation, health checks and observability base**\
  **Status:** `Not Started` · **Area:** Backend/core\
  **Sources:** Architecture §§11-13\
  **Depends on:** `P03-001`, `P03-002`\
  **Deliverable:** Add startup variable validation, health/readiness probes, request IDs and secret-safe structured logs.\
  **Acceptance:** Missing secrets fail safely; responses/logs disclose no sensitive values.\
  **Evidence to attach:** Configuration and health test results.

- [ ] **P03-004 — Implement customer/session/address and verification schemas**\
  **Status:** `Not Started` · **Area:** Backend/identity\
  **Sources:** FR-01; FR-02; FR-21\
  **Depends on:** `P03-002`, `P03-017`, `P03-018`\
  **Deliverable:** Define normalized identities, unique email indexes, session token hashes, revocation and expiring recovery artifacts.\
  **Acceptance:** Expired/single-use tokens cannot be reused and duplicate identity is rejected.\
  **Evidence to attach:** Model/index tests.

- [ ] **P03-005 — Implement opaque customer/admin sessions and cookie controls**\
  **Status:** `Not Started` · **Area:** Backend/security\
  **Sources:** FR-01; FR-21; Architecture §9\
  **Depends on:** `P03-004`, `P03-003`\
  **Deliverable:** Issue separate host-only secure HttpOnly cookies and implement rotation, expiration, logout and revocation.\
  **Acceptance:** Customer/admin session types are isolated and cannot cross-authorize.\
  **Evidence to attach:** Session lifecycle security tests.

- [ ] **P03-006 — Implement origin, CORS and CSRF protection**\
  **Status:** `Not Started` · **Area:** Backend/security\
  **Sources:** Architecture §§9,11\
  **Depends on:** `P03-005`\
  **Deliverable:** Bootstrap short-lived browser-context CSRF before authentication, then rotate into separate customer/admin/order-scoped contexts. Require custom token header and approved Origin for login, registration, recovery, guest checkout, proof exchange, and authenticated mutations.\
  **Acceptance:** Rotated/expired session invalidates prior CSRF token; provider IPNs use independent checks.\
  **Evidence to attach:** CSRF/CORS integration tests.

- [ ] **P03-007 — Implement customer registration, login and logout**\
  **Status:** `Not Started` · **Area:** Backend/identity\
  **Sources:** FR-01\
  **Depends on:** `P03-005`, `P03-006`\
  **Deliverable:** Add normalized-email registration, adaptive password hashing, credential verification, safe errors, logout and durable registration notification intent for later email delivery.\
  **Acceptance:** Public registration grants customer only; suspended accounts cannot authenticate; successful registration persists a single retryable notification intent without making email delivery a prerequisite for account creation.\
  **Evidence to attach:** Auth API tests.

- [ ] **P03-008 — Implement customer profile and address ownership**\
  **Status:** `Not Started` · **Area:** Backend/identity\
  **Sources:** FR-02; PRD §10.2; Architecture §7.5\
  **Depends on:** `P03-007`\
  **Deliverable:** Add profile/phone edits, saved/default addresses, verified account-deletion request intake/status and the immutable historical-order/retention boundary.\
  **Acceptance:** Ownership enforced for nested addresses and account-deletion requests; requests cannot erase legally retained order/payment records, and account changes do not mutate historical snapshots; no unapproved self-service deletion UI is assumed.\
  **Evidence to attach:** Profile/address ownership tests.

- [ ] **P03-009 — Create transactional notification foundation**\
  **Status:** `Not Started` · **Area:** Backend/notifications\
  **Sources:** FR-20; Architecture §§6,10\
  **Depends on:** `P03-002`, `P03-003`, `P03-007`\
  **Deliverable:** Implement server-only email adapter, durable notification intents, bounded retries, status and deduplication keys; connect registration intent to the delivery/retry pipeline.\
  **Acceptance:** Delivery failure does not undo committed account changes; registration event intent can be delivered/retried independently; one logical event intent is guaranteed, with verified provider idempotency or explicit delivery uncertainty rather than an unsupported exactly-once-send claim.\
  **Evidence to attach:** Adapter and retry tests with test provider.

- [ ] **P03-010 — Implement customer password recovery and change**\
  **Status:** `Not Started` · **Area:** Backend/identity\
  **Sources:** FR-01; FR-02; FR-20\
  **Depends on:** `P03-007`, `P03-009`\
  **Deliverable:** Implement time-limited single-use reset by email and authenticated password changes.\
  **Acceptance:** Token replay and user enumeration blocked; reset notifications are durable/retryable.\
  **Evidence to attach:** Recovery and abuse test cases.

- [ ] **P03-011 — Implement verified customer email change**\
  **Status:** `Not Started` · **Area:** Backend/identity\
  **Sources:** FR-02\
  **Depends on:** `P03-008`, `P03-009`\
  **Deliverable:** Verify control of new email before switching account identity and enforce uniqueness.\
  **Acceptance:** Unverified addresses do not replace current email; concurrent duplicates are rejected.\
  **Evidence to attach:** Email-change tests.

- [ ] **P03-012 — Implement private admin provisioning, login and recovery**\
  **Status:** `Not Started` · **Area:** Backend/security\
  **Sources:** FR-21\
  **Depends on:** `P03-005`, `P03-006`, `P03-009`\
  **Deliverable:** Provision initial administrator privately with independent login/recovery and logout.\
  **Acceptance:** No public admin signup; admin access requires active admin session.\
  **Evidence to attach:** Provisioning and admin-auth tests.

- [ ] **P03-013 — Enforce ownership and role guards**\
  **Status:** `Not Started` · **Area:** Backend/security\
  **Sources:** FR-01; FR-02; FR-21; Architecture §9\
  **Depends on:** `P03-005`, `P03-012`\
  **Deliverable:** Enforce server-side ownership on nested resources and admin-only mutations; log sensitive actions.\
  **Acceptance:** User-supplied IDs and client route guards cannot escalate privileges.\
  **Evidence to attach:** Cross-account and admin denial tests.

- [ ] **P03-014 — Add auth/recovery throttles and audit safety**\
  **Status:** `Not Started` · **Area:** Backend/security\
  **Sources:** FR-01; FR-21; PRD §12\
  **Depends on:** `P03-007`, `P03-012`\
  **Deliverable:** Rate-limit sensitive endpoints and record safe security-relevant audit events.\
  **Acceptance:** Brute-force/recovery abuse blocked without exposing account existence or secrets.\
  **Evidence to attach:** Rate-limit and audit tests.

- [ ] **P03-015 — Connect customer and admin authentication/account interfaces**\
  **Status:** `Not Started` · **Area:** Storefront/admin\
  **Sources:** FR-01; FR-02; FR-21; Design §§7-8\
  **Depends on:** `P02-008`, `P02-006`, `P02-007`, `P03-013`, `P03-010`, `P03-008`, `P03-011`\
  **Deliverable:** Connect registration/login/recovery, profile, addresses and admin login to real API.\
  **Acceptance:** Loading, denied, suspended and expired states work; no sensitive information appears in shared caches.\
  **Evidence to attach:** Browser integration flows.

- [ ] **P03-016 — Verify identity/security milestone**\
  **Status:** `Not Started` · **Area:** Quality/security\
  **Sources:** FR-01; FR-02; FR-21\
  **Depends on:** `P03-015`, `P03-014`, `P01-004`, `P01-010`, `P01-011`, `P01-012`, `P02-011`, `P01-013`, `P01-014`\
  **Deliverable:** Execute session separation, password reset replay, CSRF, Origin, ownership, suspension and account changes.\
  **Acceptance:** M1 foundation evidence includes CI, agent instructions, FR/NFR coverage protocol, responsive/accessibility foundation and identity/security checks before dependent milestone acceptance.\
  **Evidence to attach:** M1 auth/API security report.

- [ ] **P03-017 — Establish `DATABASE.md` identity and persistence contracts**\
  **Status:** `Not Started` · **Area:** Documentation/data\
  **Sources:** PRD §10; Architecture §7; Implementation Plan §4.3\
  **Depends on:** `P03-002`, `P01-003`\
  **Deliverable:** Apply docs/DATABASE.md to the identity/session/context/verification models, exact schemas/indexes, timestamp and money conventions, retention boundaries and migration procedure; reconcile executable models with the specification.\
  **Acceptance:** Current contracts are implementable; future commerce schemas remain planned until designed. Model choices preserve PRD/Architecture invariants and support source-collection refund accounting.\
  **Evidence to attach:** Reviewed `DATABASE.md` baseline.

- [ ] **P03-018 — Establish `API.md` identity and browser security contracts**\
  **Status:** `Not Started` · **Area:** Documentation/API\
  **Sources:** PRD FR-01, FR-02, FR-19, FR-21; Architecture §§8–9\
  **Depends on:** `P03-001`, `P03-017`\
  **Deliverable:** Apply docs/API.md to identity endpoints, browser-context/CSRF bootstrap, customer/admin sessions and recovery; implement validators and contract tests for request/response/error and replay behavior.\
  **Acceptance:** Pre-authentication and authenticated mutations have explicit protection; future guest/order-scoped contracts are tracked and completed before those feature tasks.\
  **Evidence to attach:** Reviewed `API.md` baseline.

### Phase 04 — Product catalog and inventory

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 04. **Associated gate:** M2. **Tasks:** 15.

- [ ] **P04-001 — Model categories and hierarchy with activity rules**\
  **Status:** `Not Started` · **Area:** Backend/catalog\
  **Sources:** FR-04; FR-24\
  **Depends on:** `P03-002`\
  **Deliverable:** Add hierarchical category schema, slug/index, active state and guarded deletion/reassignment semantics.\
  **Acceptance:** Products cannot be stranded by category deletion; inactive categories are excluded publicly.\
  **Evidence to attach:** Schema and hierarchy tests.

- [ ] **P04-002 — Model products and default/option variants**\
  **Status:** `Not Started` · **Area:** Backend/catalog\
  **Sources:** FR-05; FR-06; FR-23\
  **Depends on:** `P04-001`\
  **Deliverable:** Define products, images, prices/sale prices, searchable fields, variant SKUs and uniqueness indexes.\
  **Acceptance:** Product has at least one purchasable SKU; duplicate SKUs/slugs rejected.\
  **Evidence to attach:** Model/index tests.

- [ ] **P04-003 — Implement controlled Cloudinary media adapter**\
  **Status:** `Not Started` · **Area:** Backend/media\
  **Sources:** FR-05; FR-23; Architecture §11\
  **Depends on:** `P03-003`, `P01-005`\
  **Deliverable:** Implement the mediaAssets ownership/upload-intent ledger, validation/quarantine, transactionally attached references, private evidence authorization and CAS-protected orphan cleanup; upload/delete provider calls stay outside DB transactions (Database §6.7).\
  **Acceptance:** Only authorized admin uploads; credentials never reach browser bundles.\
  **Evidence to attach:** Media adapter/upload security tests.

- [ ] **P04-004 — Implement admin category management**\
  **Status:** `Not Started` · **Area:** Admin/catalog\
  **Sources:** FR-24\
  **Depends on:** `P04-001`, `P03-013`, `P02-010`\
  **Deliverable:** Create/edit/deactivate categories and image controls through protected API and admin UI; explicit null removes a parent/image after hierarchy/reference checks, omission preserves it.\
  **Acceptance:** Dependent-product deletion is guarded; status changes propagate safely.\
  **Evidence to attach:** Admin category CRUD integration.

- [ ] **P04-005 — Implement admin product/variant management**\
  **Status:** `Not Started` · **Area:** Admin/catalog\
  **Sources:** FR-23; FR-06\
  **Depends on:** `P04-002`, `P04-003`, `P03-013`, `P02-010`\
  **Deliverable:** Build create/edit/deactivate, prices, featured settings, variants/SKUs and image management, including explicit null→unset for sale price/threshold; omitted fields remain unchanged.\
  **Acceptance:** Form errors reflect uniqueness/invalid variants and saved data appears through API.\
  **Evidence to attach:** Admin product CRUD/E2E.

- [ ] **P04-006 — Establish physical/reserved/committed counters**\
  **Status:** `Not Started` · **Area:** Backend/inventory\
  **Sources:** FR-13; FR-25\
  **Depends on:** `P04-002`\
  **Deliverable:** Implement nonnegative counters and Available = Physical - Reserved - Committed using atomic guards.\
  **Acceptance:** Concurrent adjustments cannot produce negative availability or duplicate movement effects.\
  **Evidence to attach:** Stock arithmetic/concurrency tests.

- [ ] **P04-007 — Implement inventory adjustments and audit views**\
  **Status:** `Not Started` · **Area:** Admin/inventory\
  **Sources:** FR-25\
  **Depends on:** `P04-006`, `P03-013`, `P02-010`\
  **Deliverable:** Build authorized adjustments, low-stock thresholds, counters and movement history displays.\
  **Acceptance:** Each adjustment has actor/reason/movement; reserved and committed values are distinct.\
  **Evidence to attach:** Admin stock audit test.

- [ ] **P04-008 — Define reusable reservation/commit/ship/release service interface**\
  **Status:** `Not Started` · **Area:** Backend/inventory\
  **Sources:** FR-13; Architecture §§7,10\
  **Depends on:** `P04-006`\
  **Deliverable:** Implement transaction-friendly allocation primitives for later checkout and fulfillment.\
  **Acceptance:** Operations are guarded and idempotent; no direct inventory manipulation outside service boundaries.\
  **Evidence to attach:** Unit and concurrency tests.

- [ ] **P04-009 — Implement public catalog listing and search**\
  **Status:** `Not Started` · **Area:** Backend/catalog\
  **Sources:** FR-04\
  **Depends on:** `P04-002`, `P04-001`, `P04-006`\
  **Deliverable:** Support active-only search/filters/sorts/pagination and bounded indexing.\
  **Acceptance:** Inactive products/categories not disclosed; price/availability data is safe for display.\
  **Evidence to attach:** API filter/index tests.

- [ ] **P04-010 — Implement product details/variant availability API**\
  **Status:** `Not Started` · **Area:** Backend/catalog\
  **Sources:** FR-05; FR-06\
  **Depends on:** `P04-009`\
  **Deliverable:** Expose images, descriptions, valid variant combinations, stock cue and related products.\
  **Acceptance:** Unavailable combinations cannot be selected as purchasable and disabled SKUs are guarded.\
  **Evidence to attach:** Product details API tests.

- [ ] **P04-011 — Establish catalog caching, invalidation and SEO contracts**\
  **Status:** `Not Started` · **Area:** Storefront/catalog\
  **Sources:** FR-04; FR-05; Architecture §5\
  **Depends on:** `P04-009`, `P02-001`\
  **Deliverable:** Implement public revalidation, descriptive URLs, canonical/metadata and stale-stock disclaimers.\
  **Acceptance:** Admin updates revalidate public content; private account/order data never enters shared caches.\
  **Evidence to attach:** Rendering/caching tests.

- [ ] **P04-012 — Implement full homepage content and shell integrations**\
  **Status:** `Not Started` · **Area:** Storefront/catalog\
  **Sources:** FR-03\
  **Depends on:** `P04-009`, `P04-011`, `P02-006`\
  **Deliverable:** Implement approved storeSettings.homepageBanner and its public-media reference/input/projection (API §10.1), categories, featured/new/discounted products, search, account/cart/wishlist cues and policy/support contact links; logo and banner are separate.\
  **Acceptance:** Empty/unconfigured sections are honest; navigation and responsive states work.\
  **Evidence to attach:** Home content and link audit.

- [ ] **P04-013 — Implement responsive products/category pages**\
  **Status:** `Not Started` · **Area:** Storefront/catalog\
  **Sources:** FR-04\
  **Depends on:** `P04-009`, `P04-011`, `P02-009`\
  **Deliverable:** Build search, filters, sort, pagination, empty/loading/error and preserved URL state.\
  **Acceptance:** Mobile filter drawer usable; returning from details retains filter context.\
  **Evidence to attach:** Catalog UI E2E and accessibility checks.

- [ ] **P04-014 — Implement product details and variant selector**\
  **Status:** `Not Started` · **Area:** Storefront/catalog\
  **Sources:** FR-05; FR-06\
  **Depends on:** `P04-010`, `P04-013`, `P02-009`\
  **Deliverable:** Build gallery, pricing, SKU/availability, quantity, related products, reviews placeholder and cart/wishlist actions.\
  **Acceptance:** Out-of-stock/inactive variants cannot be purchased; selection feedback is accessible.\
  **Evidence to attach:** Product detail UI/API tests.

- [ ] **P04-015 — Verify catalog and inventory milestone**\
  **Status:** `Not Started` · **Area:** Quality/catalog\
  **Sources:** FR-03; FR-04; FR-05; FR-06; FR-13; FR-23; FR-24; FR-25\
  **Depends on:** `P04-005`, `P04-004`, `P04-007`, `P04-008`, `P04-012`, `P04-013`, `P04-014`, `P03-016`\
  **Deliverable:** Execute admin-to-storefront publishing, unique identities, concurrent stock and public visibility tests.\
  **Acceptance:** No static mock implies purchase readiness; M2 evidence demonstrates real API-backed catalog.\
  **Evidence to attach:** M2 catalog acceptance suite.

### Phase 05 — Cart, wishlist, coupons, and reviews

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 05. **Associated gate:** M3. **Tasks:** 13.

- [ ] **P05-001 — Implement guest cart persistence and item validation**\
  **Status:** `Not Started` · **Area:** Storefront/shopping\
  **Sources:** FR-07\
  **Depends on:** `P04-010`, `P02-009`\
  **Deliverable:** Keep guest selections and quantities locally with stable SKU identity.\
  **Acceptance:** Cart never reserves stock; unavailable variants show recoverable errors.\
  **Evidence to attach:** Guest cart persistence test.

- [ ] **P05-002 — Implement authenticated persistent cart**\
  **Status:** `Not Started` · **Area:** Backend/shopping\
  **Sources:** FR-07\
  **Depends on:** `P03-013`, `P04-002`\
  **Deliverable:** Add per-customer cart CRUD and quantity rules with ownership.\
  **Acceptance:** Carts persist across sessions and prevent duplicate variant lines.\
  **Evidence to attach:** Cart API ownership tests.

- [ ] **P05-003 — Implement login cart merge and current-value refresh**\
  **Status:** `Not Started` · **Area:** Shopping\
  **Sources:** FR-07\
  **Depends on:** `P05-001`, `P05-002`\
  **Deliverable:** Deduplicate SKU/variant lines, resolve quantities and refresh current prices/availability.\
  **Acceptance:** Login merge does not oversell/reserve stock; changed products are flagged.\
  **Evidence to attach:** Cart merge integration tests.

- [ ] **P05-004 — Implement persistent authenticated wishlist**\
  **Status:** `Not Started` · **Area:** Backend/shopping\
  **Sources:** FR-08\
  **Depends on:** `P03-013`, `P04-002`\
  **Deliverable:** Add unique per-customer wishlist entries and inactive product handling.\
  **Acceptance:** Guests cannot mutate wishlist and repeated adds do not duplicate entries.\
  **Evidence to attach:** Wishlist API tests.

- [ ] **P05-005 — Integrate catalog pricing with coupon discount allocation**\
  **Status:** `Not Started` · **Area:** Backend/catalog + promotions\
  **Sources:** FR-09; Architecture §7\
  **Depends on:** `P04-002`\
  **Deliverable:** Consume catalog-owned base/sale prices through catalog service interfaces; promotions owns coupon calculation and deterministic item-level discount allocation/rounding.\
  **Acceptance:** No floats determine payable values; line discount sum matches order-level totals.\
  **Evidence to attach:** Pricing/rounding unit tests.

- [ ] **P05-006 — Implement coupon eligibility and limit rules**\
  **Status:** `Not Started` · **Area:** Backend/promotions\
  **Sources:** FR-09\
  **Depends on:** `P05-005`, `P03-002`\
  **Deliverable:** Validate fixed/percentage, dates, min subtotal, one-code rule, activation and overall/per-customer limits. Per-customer-limited coupons require a registered account; guest email is not a quota identity. Preserve quoted live-hold terms until expiry and revalidate current terms after expiry.\
  **Acceptance:** Delivery excluded; discounts nonnegative; errors are stable and safe.\
  **Evidence to attach:** Coupon business-rule tests.

- [ ] **P05-007 — Implement durable coupon hold/redemption primitives**\
  **Status:** `Not Started` · **Area:** Backend/promotions\
  **Sources:** FR-09\
  **Depends on:** `P05-006`, `P03-002`\
  **Deliverable:** Support atomic capacity reservation, confirm and exactly-once release for checkout coordination.\
  **Acceptance:** Simultaneous final redemption cannot exceed limit; cart actions never hold capacity.\
  **Evidence to attach:** Coupon race and release tests.

- [ ] **P05-008 — Implement admin coupon configuration and history**\
  **Status:** `Not Started` · **Area:** Admin/promotions\
  **Sources:** FR-30\
  **Depends on:** `P05-006`, `P05-007`, `P02-010`, `P03-013`\
  **Deliverable:** Build coupon create/edit/deactivate, validity, limits and redemption reporting.\
  **Acceptance:** Invalid policy is rejected; history distinguishes held and committed usage.\
  **Evidence to attach:** Admin coupon CRUD/E2E.

- [ ] **P05-009 — Implement reviews, uniqueness and eligibility guard**\
  **Status:** `Not Started` · **Area:** Backend/reviews\
  **Sources:** FR-10; FR-31\
  **Depends on:** `P03-013`, `P04-002`\
  **Deliverable:** Create owned reviews, one active review per customer/product, moderation and a closed-by-default delivered-purchase check.\
  **Acceptance:** No new verified review can be submitted before proven order eligibility exists.\
  **Evidence to attach:** Review model and denial tests.

- [ ] **P05-010 — Implement approved review display and moderation shell**\
  **Status:** `Not Started` · **Area:** Storefront/admin\
  **Sources:** FR-10; FR-31\
  **Depends on:** `P05-009`, `P04-014`, `P02-010`\
  **Deliverable:** Show only approved reviews and prepare moderation controls with reason and audit record.\
  **Acceptance:** Admin never rewrites a customer's rating as customer-originated; ineligible submission remains disabled.\
  **Evidence to attach:** Moderation/view integration.

- [ ] **P05-011 — Connect Cart page and dynamic price warnings**\
  **Status:** `Not Started` · **Area:** Storefront/shopping\
  **Sources:** FR-07; FR-09\
  **Depends on:** `P05-003`, `P05-005`, `P05-006`, `P02-009`\
  **Deliverable:** Build cart lines, quantity editing, subtotal and revalidation errors plus coupon preview.\
  **Acceptance:** Totals labeled estimated until backend checkout quote; input remains after errors.\
  **Evidence to attach:** Cart and coupon UI E2E.

- [ ] **P05-012 — Connect wishlist and My Reviews surfaces**\
  **Status:** `Not Started` · **Area:** Storefront/shopping\
  **Sources:** FR-08; FR-10\
  **Depends on:** `P05-004`, `P05-010`, `P02-006`\
  **Deliverable:** Show saved products, wishlist-to-cart actions, owned reviews and moderation states.\
  **Acceptance:** Nonmembers cannot mutate data; unavailable products remain clearly identified.\
  **Evidence to attach:** Wishlist/review route tests.

- [ ] **P05-013 — Verify shopping/promotion readiness**\
  **Status:** `Not Started` · **Area:** Quality/shopping\
  **Sources:** FR-07; FR-08; FR-09; FR-10; FR-30; FR-31\
  **Depends on:** `P05-008`, `P05-007`, `P05-011`, `P05-012`\
  **Deliverable:** Verify guest/auth cart, merge, coupons under contention and review moderation guards.\
  **Acceptance:** All checkout prerequisites pass while delivered-review submissions remain correctly gated.\
  **Evidence to attach:** P05 suite and prerequisite record.

### Phase 06 — Checkout, orders, and delivery rules

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 06. **Associated gate:** M3. **Tasks:** 20.

- [ ] **P06-001 — Implement delivery zones and future-only charge settings**\
  **Status:** `Not Started` · **Area:** Backend/delivery\
  **Sources:** FR-16; FR-28\
  **Depends on:** `P03-002`, `P03-013`, `P01-007`\
  **Deliverable:** Bootstrap the primary settings singleton before delivery writes (Database §10.4); create district/area zone/charge schema and admin CRUD; acquire shared storeSettings.deliveryCoverageRevision before every charge/zone-status transaction, including cross-zone scheduling, supersession and activation.\
  **Acceptance:** Prices never negative; past orders unchanged; concurrent different-zone writers cannot approve overlapping windows for the same coverageKey. No zone-local guard substitutes for the global guard.\
  **Evidence to attach:** Delivery setting and snapshot tests.

- [ ] **P06-002 — Implement admin Delivery Settings and customer location selection**\
  **Status:** `Not Started` · **Area:** Admin/storefront\
  **Sources:** FR-16; FR-28\
  **Depends on:** `P06-001`, `P02-008`, `P02-010`\
  **Deliverable:** Build zone/charge management, available district/area selection and clear unavailable-location messages.\
  **Acceptance:** Only active zones are selectable; controls are accessible.\
  **Evidence to attach:** Delivery UI integration.

- [ ] **P06-003 — Implement delivery estimates, deadlines and exceptions policy boundary**\
  **Status:** `Not Started` · **Area:** Backend/orders\
  **Sources:** FR-16; FR-26\
  **Depends on:** `P06-001`, `P01-007`\
  **Deliverable:** Display the applicable deadline rule/status and estimated date from approved configuration/verified law. Preserve the checkout rule basis; calculate a confirmation-based absolute deadline only after actual confirmation (Database §7.2; API §11.3).\
  **Acceptance:** 14-day planning target cannot override shorter applicable requirements; uncertain policy blocks final publication.\
  **Evidence to attach:** Deadline examples and compliance sign-off reference.

- [ ] **P06-004 — Implement authoritative checkout quote and validation**\
  **Status:** `Not Started` · **Area:** Backend/checkout\
  **Sources:** FR-11; FR-09\
  **Depends on:** `P05-005`, `P05-006`, `P04-008`, `P06-001`\
  **Deliverable:** Revalidate identity/contact, email, Bangladesh phone, terms, SKU stock, coupon and delivery with integer-poisha totals.\
  **Acceptance:** Invalid price/stock/area/coupon/terms rejected; quote is authoritative at calculation time; submission revalidates changes and obtains renewed confirmation rather than guaranteeing a stale price.\
  **Evidence to attach:** Checkout quote unit/integration suite.

- [ ] **P06-005 — Implement orders, item snapshots and independent lifecycles**\
  **Status:** `Not Started` · **Area:** Backend/orders\
  **Sources:** FR-11; FR-14\
  **Depends on:** `P06-004`, `P03-002`\
  **Deliverable:** Store unique order number, immutable item/variant/unit/discount/delivery/address/deadline-rule values with separate event-derived delivery commitments and payment/fulfillment states.\
  **Acceptance:** Historical changes do not rewrite snapshots; invalid transitions rejected.\
  **Evidence to attach:** Order model/index tests.

- [ ] **P06-006 — Implement persistent checkout intent and idempotency keys**\
  **Status:** `Not Started` · **Area:** Backend/checkout\
  **Sources:** FR-11; Architecture §§8,10\
  **Depends on:** `P06-005`\
  **Deliverable:** Deduplicate repeated user/guest submissions and persist operation outcome.\
  **Acceptance:** Concurrent identical intent creates one order and returns/safely resumes existing outcome.\
  **Evidence to attach:** Duplicate-intent concurrency tests.

- [ ] **P06-007 — Coordinate stock and coupon changes transactionally**\
  **Status:** `Not Started` · **Area:** Backend/checkout\
  **Sources:** FR-09; FR-13\
  **Depends on:** `P06-006`, `P04-008`, `P05-007`\
  **Deliverable:** Atomically create/commit/release inventory and coupon allocations and movements with guarded transitions.\
  **Acceptance:** No negative available stock or breached coupon capacity under concurrent checkouts.\
  **Evidence to attach:** Transaction/last-unit/final-coupon tests.

- [ ] **P06-008 — Implement COD placement and stock/coupon commitment**\
  **Status:** `Not Started` · **Area:** Backend/orders\
  **Sources:** FR-11; FR-12; FR-13\
  **Depends on:** `P06-007`, `P06-001`\
  **Deliverable:** Accept COD order once as Pending, commit allocations, create a pending payment aggregate (no unverified paymentCollections receipt), and order_received notification. Administrator confirmation separately moves eligible fulfillment to Confirmed.\
  **Acceptance:** COD Paid status requires later collection evidence; no provider payment falsely created.\
  **Evidence to attach:** COD checkout integration.

- [ ] **P06-009 — Implement online order and 15-minute hold foundation**\
  **Status:** `Not Started` · **Area:** Backend/checkout\
  **Sources:** FR-11; FR-13; FR-09\
  **Depends on:** `P06-007`, `P06-006`\
  **Deliverable:** Create order and temporary stock/coupon reservations for a future online payment attempt.\
  **Acceptance:** Each held generation expires 15 minutes after its own server heldAt; all stock/coupon clocks agree, replay never extends them. Provider calls remain disabled until Phase 07 integration.\
  **Evidence to attach:** Hold lifecycle tests.

- [ ] **P06-010 — Implement reservation expiry, durable lease and release**\
  **Status:** `Not Started` · **Area:** Backend/jobs\
  **Sources:** FR-13; FR-09\
  **Depends on:** `P06-009`, `P03-003`\
  **Deliverable:** Expire only eligible unpaid holds using idempotent scheduled service and durable claims when needed.\
  **Acceptance:** TTL document deletion does not release business capacity; attempts preserve audit history.\
  **Evidence to attach:** Expiry/restart/retry tests.

- [ ] **P06-011 — Implement order transitions, shipping and movement logic**\
  **Status:** `Not Started` · **Area:** Backend/orders\
  **Sources:** FR-14; FR-16; FR-26\
  **Depends on:** `P06-008`, `P04-008`, `P06-003`\
  **Deliverable:** Enforce Pending/Confirmed/Processing/Shipped/Delivered/Cancelled transitions and shipment decrement of physical+committed.\
  **Acceptance:** Admin cannot skip forbidden transitions; shipping/failed delivery retains event history.\
  **Evidence to attach:** State-machine and shipment tests.

- [ ] **P06-012 — Implement authorized COD collection confirmation**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-26; FR-29\
  **Depends on:** `P06-011`, `P03-013`\
  **Deliverable:** Record collected COD only on authorized confirmation with ledger and audit reference.\
  **Acceptance:** Delivery alone never marks COD Paid; duplicate confirmation has single effect.\
  **Evidence to attach:** COD collection audit test.

- [ ] **P06-013 — Implement pre-shipment cancellation and exactly-once release**\
  **Status:** `Not Started` · **Area:** Backend/orders\
  **Sources:** FR-15; FR-26\
  **Depends on:** `P06-011`, `P06-007`\
  **Deliverable:** Require administrator approval/rejection of every customer cancellation request; atomically recheck eligibility and dispatch status, retain reasons, release eligible allocation once, and create collected-payment refund obligations. Unpaid online cancellations keep provider reconciliation active for any later collection.\
  **Acceptance:** Shipped orders cannot use ordinary cancellation; uncollected COD has no monetary refund.\
  **Evidence to attach:** Cancellation race/state tests.

- [ ] **P06-014 — Implement authenticated customer order history/detail API**\
  **Status:** `Not Started` · **Area:** Backend/storefront\
  **Sources:** FR-14\
  **Depends on:** `P06-011`, `P03-013`\
  **Deliverable:** Expose own orders and independent fulfillment/payment history with pending/returned states where available.\
  **Acceptance:** Cross-account access denied; order totals use historical snapshots.\
  **Evidence to attach:** Order ownership tests.

- [ ] **P06-015 — Implement secure guest order lookup and scoped proof**\
  **Status:** `Not Started` · **Area:** Backend/guest-access\
  **Sources:** FR-19\
  **Depends on:** `P06-005`, `P03-009`\
  **Deliverable:** Require order number+email followed by expiring single-use email verification proof.\
  **Acceptance:** Non-enumerating rate-limited lookup and order-scoped eligible actions; no access by lookup text alone.\
  **Evidence to attach:** Guest proof replay/ownership tests.

- [ ] **P06-016 — Implement order, cancellation, shipment and delivery email intents**\
  **Status:** `Not Started` · **Area:** Backend/notifications\
  **Sources:** FR-20\
  **Depends on:** `P06-011`, `P06-013`, `P03-009`\
  **Deliverable:** Persist accurate order reference/status events with reliable independent delivery and retry.\
  **Acceptance:** Repeated transitions do not email duplicate customer updates; mail failure cannot reverse orders.\
  **Evidence to attach:** Notification event/dedup suite.

- [ ] **P06-017 — Implement failed delivery, delay and complaints foundations**\
  **Status:** `Not Started` · **Area:** Backend/admin\
  **Sources:** FR-16; FR-26; FR-34\
  **Depends on:** `P06-011`, `P06-003`, `P03-013`\
  **Deliverable:** Track failed attempts and retry while Shipped; final non-delivery closure requires authorized custody/disposition for all shipped quantities. Close exceptionally as Cancelled, resolve eligible collected refunds, and restock only physically recovered inspected resellable units without re-running pre-shipment release. Track contacts, complaints, and resolution with scoped access.\
  **Acceptance:** Failure leads to documented retry/resolution; deadlines and customer updates remain accurate.\
  **Evidence to attach:** Delivery-exception and complaint test.

- [ ] **P06-018 — Implement accessible checkout and order confirmation UI**\
  **Status:** `Not Started` · **Area:** Storefront/checkout\
  **Sources:** FR-11; FR-16\
  **Depends on:** `P06-004`, `P06-008`, `P06-002`, `P02-008`\
  **Deliverable:** Build guest/account checkout, address, terms, coupon, order summary, COD and online-pending presentation.\
  **Acceptance:** Final server charges and applicable deadline rule/status visible before submission; pending online not represented as paid.\
  **Evidence to attach:** Mobile/desktop checkout E2E.

- [ ] **P06-019 — Implement order tracking, guest lookup and admin fulfillment UI**\
  **Status:** `Not Started` · **Area:** Storefront/admin\
  **Sources:** FR-14; FR-15; FR-19; FR-26\
  **Depends on:** `P06-014`, `P06-015`, `P06-013`, `P06-012`, `P06-017`, `P02-010`\
  **Deliverable:** Build My Orders/Details, guest proof, cancellation, admin order/exception and COD actions.\
  **Acceptance:** Only currently eligible actions appear; cancellation requests show pending administrator review without changing fulfillment. Unpaid online cancellation and later verified collection show separate cancelled/correction states; the server remains authoritative.\
  **Evidence to attach:** Guest/customer/admin lifecycle E2E.

- [ ] **P06-020 — Verify full COD commerce milestone**\
  **Status:** `Not Started` · **Area:** Quality/checkout\
  **Sources:** FR-09; FR-11; FR-13; FR-14; FR-15; FR-16; FR-19; FR-20; FR-26; FR-28; FR-29\
  **Depends on:** `P06-018`, `P06-019`, `P06-010`, `P06-016`, `P04-015`, `P05-013`\
  **Deliverable:** Verify guest+registered COD, concurrency, coupon limits, totals, idempotency, collection and cancellation.\
  **Acceptance:** M3 acceptance proves COD and online-hold foundation, not live payment.\
  **Evidence to attach:** COD E2E, concurrency and M3 gate report.

### Phase 07 — Payment integration and verification

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 07. **Associated gate:** M4. **Tasks:** 17.

- [ ] **P07-001 — Implement server-only SSLCOMMERZ adapter**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; Architecture §10\
  **Depends on:** `P06-009`, `P01-006`, `P03-003`\
  **Deliverable:** Define sandbox configuration, init/validate/status integration and provider-specific safe error translation.\
  **Acceptance:** Merchant credentials remain server-only; unknown provider outcome is preserved as uncertain.\
  **Evidence to attach:** Provider contract test with sandbox/mocks.

- [ ] **P07-002 — Persist payment aggregate and attempts with unique IDs**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-29\
  **Depends on:** `P06-005`, `P03-002`\
  **Deliverable:** Track provider scoped tran_id, attempts, merchant refs, amount, BDT, expiry, risk and paid collections.\
  **Acceptance:** Distinct retries never reuse reference; all attempts remain auditable.\
  **Evidence to attach:** Unique-index/payment-model tests.

- [ ] **P07-003 — Expose only enabled merchant channels**\
  **Status:** `Not Started` · **Area:** Backend/storefront\
  **Sources:** FR-12\
  **Depends on:** `P07-001`, `P01-006`\
  **Deliverable:** Return available online channels from verified merchant configuration and COD from store config.\
  **Acceptance:** Disabled/unknown bKash, Nagad or Rocket channels are never offered as activated.\
  **Evidence to attach:** Method-availability tests.

- [ ] **P07-004 — Implement hosted checkout initiation for existing order**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-11; FR-12\
  **Depends on:** `P07-002`, `P07-003`, `P06-009`\
  **Deliverable:** Persist new unique attempt then request hosted URL for same order; ensure financial intent exists before provider calls.\
  **Acceptance:** Retry cannot silently create another order; expired holds require safe reallocation.\
  **Evidence to attach:** Payment-init integration.

- [ ] **P07-005 — Separate browser return and provider IPN endpoints**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12\
  **Depends on:** `P07-004`, `P03-001`\
  **Deliverable:** Accept return as UI signal and IPN as untrusted provider input pending independent validation.\
  **Acceptance:** Browser success never marks Paid; CSRF exemption applies only to the documented provider IPN/return endpoints; they grant no customer/admin access, and any financial transition requires independent provider verification. Normal browser initiation/retry APIs remain CSRF-protected.\
  **Evidence to attach:** Return/IPN endpoint tests.

- [ ] **P07-006 — Implement independent provider payment validation**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12\
  **Depends on:** `P07-005`, `P07-001`, `P07-002`\
  **Deliverable:** Validate merchant, order, transaction, amount, BDT, accepted status and risk using provider status/validation APIs.\
  **Acceptance:** Mismatched or forged results cannot mark Paid; only verified provider collection changes status.\
  **Evidence to attach:** Provider mismatch/fraud tests.

- [ ] **P07-007 — Deduplicate repeated and out-of-order payment results**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12\
  **Depends on:** `P07-006`, `P03-002`\
  **Deliverable:** Enforce provider-scoped unique references and guarded paid/failure transitions on all attempts.\
  **Acceptance:** Multiple callbacks have single business effect and history remains intact.\
  **Evidence to attach:** Concurrent/IPN idempotency tests.

- [ ] **P07-008 — Convert verified payment holds into committed stock/coupon**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-13; FR-09\
  **Depends on:** `P07-007`, `P06-007`\
  **Deliverable:** After verified collection atomically transition eligible live holds to committed allocation.\
  **Acceptance:** One order only fulfilled once; failed attempt cannot release another active/paid allocation.\
  **Evidence to attach:** Payment/allocation concurrency tests.

- [ ] **P07-009 — Reacquire expired stock and coupon on late verified payment**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-13; FR-09\
  **Depends on:** `P07-008`, `P06-010`\
  **Deliverable:** Check fulfillment eligibility first. For Cancelled orders, preserve collection, keep Cancelled, and create a payment-correction obligation without reallocation. For eligible orders, recheck both capacities atomically; otherwise preserve Paid and hold fulfillment for resolution.\
  **Acceptance:** Cancelled fulfillment never reopens or reallocates after collection; eligible orders confirm only with inventory/coupon allocation and cleared risk review. No false payment failure or forced allocation with insufficient capacity.\
  **Evidence to attach:** Expired-hold late-payment tests.

- [ ] **P07-010 — Hold high-risk verified collections for authorized review**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-29\
  **Depends on:** `P07-006`, `P07-008`\
  **Deliverable:** Model risk_level=1/other provider flags independently of allocation outcome and add authorized resolution.\
  **Acceptance:** Risk review cannot automatically release payment or fulfill without valid allocation.\
  **Evidence to attach:** Risk decision/audit tests.

- [ ] **P07-011 — Handle multiple paid attempts for one order**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12; FR-18\
  **Depends on:** `P07-007`, `P07-008`\
  **Deliverable:** Record each independently collected attempt; flag excess collection for authorized financial resolution. Keep per-collection balances and separate payment-correction refunds from merchandise refund summaries.\
  **Acceptance:** Exactly one fulfillment/allocation despite multiple paid attempts.\
  **Evidence to attach:** Dual-paid-attempt test.

- [ ] **P07-012 — Implement durable uncertain-payment reconciliation jobs**\
  **Status:** `Not Started` · **Area:** Backend/jobs\
  **Sources:** FR-12; FR-29\
  **Depends on:** `P07-007`, `P03-003`\
  **Deliverable:** Query status for missing/delayed IPNs with leases, retries, safe timeouts and admin escalation.\
  **Acceptance:** Timeouts never prove Failed; restart and duplicate job runs do not double-apply collection.\
  **Evidence to attach:** Reconciliation/restart tests.

- [ ] **P07-013 — Implement safe payment retries and attempt ownership checks**\
  **Status:** `Not Started` · **Area:** Backend/payments\
  **Sources:** FR-12\
  **Depends on:** `P07-012`, `P07-009`\
  **Deliverable:** Reconcile prior outcome and atomically reacquire expired stock/coupon capacity with a new shared heldAt/expiry before issuing fresh tran_id for the same order; preserve immutable order pricing or return a reviewed conflict if current coupon terms cannot honor it.\
  **Acceptance:** No double paid order, stale hold reuse or premature release across overlapping attempts.\
  **Evidence to attach:** Retry/race tests.

- [ ] **P07-014 — Implement payment method, redirect, pending/result/retry UI**\
  **Status:** `Not Started` · **Area:** Storefront/payments\
  **Sources:** FR-12\
  **Depends on:** `P07-003`, `P07-004`, `P07-013`, `P02-008`\
  **Deliverable:** Expose provider hosted redirect and poll/refetch backend-authoritative status.\
  **Acceptance:** Paid/unresolved/failed/cancelled and paid-but-hold-fulfillment states are distinguishable.\
  **Evidence to attach:** Sandbox storefront payment E2E.

- [ ] **P07-015 — Implement admin payment monitoring and risk exceptions**\
  **Status:** `Not Started` · **Area:** Admin/payments\
  **Sources:** FR-29; FR-12\
  **Depends on:** `P07-010`, `P07-011`, `P07-012`, `P02-010`\
  **Deliverable:** Show attempts, references, COD/online status, verification/risk holds and resolution actions.\
  **Acceptance:** Sensitive actions are authorized, confirmed and audited; no optimistic financial completion.\
  **Evidence to attach:** Admin payment exception E2E.

- [ ] **P07-016 — Implement provider-verified payment notification events**\
  **Status:** `Not Started` · **Area:** Backend/notifications\
  **Sources:** FR-20\
  **Depends on:** `P07-006`, `P07-007`, `P03-009`\
  **Deliverable:** Send verified success/failure/pending changes with accurate references, retry and deduplication.\
  **Acceptance:** Repeated callbacks cannot produce duplicate event emails.\
  **Evidence to attach:** Payment notification tests.

- [ ] **P07-017 — Verify sandbox payments and financial safety milestone**\
  **Status:** `Not Started` · **Area:** Quality/payments\
  **Sources:** FR-12; FR-13; FR-29\
  **Depends on:** `P07-014`, `P07-015`, `P07-016`, `P07-011`, `P07-009`, `P07-010`, `P07-012`, `P06-020`\
  **Deliverable:** Run success/fail/cancel/uncertain, forged/mismatched/duplicate IPN, double collection, risk and late holds.\
  **Acceptance:** M4 requires provider-backed sandbox evidence; unsupported live channels remain disabled.\
  **Evidence to attach:** M4 sandbox and fault-injection report.

### Phase 08 — Returns and refunds

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 08. **Associated gate:** M5. **Tasks:** 18.

- [ ] **P08-001 — Model item-level return claims and unclaimed quantities**\
  **Status:** `Not Started` · **Area:** Backend/returns\
  **Sources:** FR-17; FR-32\
  **Depends on:** `P06-005`, `P03-002`\
  **Deliverable:** Track order items, quantities, reasons, access-controlled evidence metadata/references and independent claim history.\
  **Acceptance:** Parallel physical-return and shortage claims together cannot exceed eligible unclaimed item quantity, including previously resolved/refunded merchandise.\
  **Evidence to attach:** Return-quantity race tests.

- [ ] **P08-002 — Validate delivered-order return eligibility and policy windows**\
  **Status:** `Not Started` · **Area:** Backend/returns\
  **Sources:** FR-17\
  **Depends on:** `P08-001`, `P06-011`, `P01-007`\
  **Deliverable:** Enforce delivered status, development-baseline seven-day window and legally protected exceptions via approved policy.\
  **Acceptance:** Unsupported blanket rejection cannot override applicable rights; ineligible claims have clear reasons.\
  **Evidence to attach:** Eligibility boundary tests.

- [ ] **P08-003 — Implement separate return lifecycle with admin review**\
  **Status:** `Not Started` · **Area:** Backend/returns\
  **Sources:** FR-17; FR-32\
  **Depends on:** `P08-002`, `P03-013`, `P04-003`, `P06-015`\
  **Deliverable:** Implement Requested/Under Review/Approved/Awaiting Return/Received/Inspected/Completed, rejection history and customer-scoped supporting-image upload using a separately authorized media path.\
  **Acceptance:** Invalid transitions and unauthorized approval are blocked; physical returns cannot skip receipt/inspection; approved missing-item/shortage claims have a non-physical path without receipt/inspection/restock; optional evidence enforces type/size checks, verified customer or scoped guest authorization, private retrieval and safe orphan/retention cleanup.\
  **Evidence to attach:** Return state/authorization and evidence-upload/access/cleanup tests.

- [ ] **P08-004 — Record receipt/inspection and resellable stock restoration**\
  **Status:** `Not Started` · **Area:** Backend/inventory\
  **Sources:** FR-17; FR-13; FR-32\
  **Depends on:** `P08-003`, `P04-008`\
  **Deliverable:** Require inspection to mark resellable quantities and atomically add physical stock.\
  **Acceptance:** Request/approval alone never restocks; duplicate receipt cannot double-add stock.\
  **Evidence to attach:** Inspection/restock test.

- [ ] **P08-005 — Model refund obligations, attempts and commitments**\
  **Status:** `Not Started` · **Area:** Backend/refunds\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P07-002`, `P06-013`, `P08-003`\
  **Deliverable:** Separate refunds from returns and store approval/payout attempts, status and source collection.\
  **Acceptance:** Original order fulfillment history remains immutable; pending vs completed are distinct.\
  **Evidence to attach:** Refund model/state tests.

- [ ] **P08-006 — Calculate item-level partial/full refundable balance**\
  **Status:** `Not Started` · **Area:** Backend/refunds\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P08-005`, `P05-005`, `P06-005`\
  **Deliverable:** Use purchase-time item/allocated coupon amounts, physical-return/shortage quantity limits, delivery-charge policy and prior commitments. Payment corrections consume source-collection financial capacity independently of merchandise-return quantities.\
  **Acceptance:** No current-catalog price used; deterministic rounding; no refund for uncollected COD.\
  **Evidence to attach:** Refund amount/rounding unit tests.

- [ ] **P08-007 — Atomically reserve eligible collected refund balance**\
  **Status:** `Not Started` · **Area:** Backend/refunds\
  **Sources:** FR-18\
  **Depends on:** `P08-006`, `P03-002`\
  **Deliverable:** Reserve refundable capacity before payout and guard against concurrent attempts.\
  **Acceptance:** Pending+completed commitments never exceed independently verified collections at either source-collection or order level; duplicate-collection refunds do not consume merchandise quantity entitlement.\
  **Evidence to attach:** Parallel partial-refund tests.

- [ ] **P08-008 — Implement supported gateway payout requests and references**\
  **Status:** `Not Started` · **Area:** Backend/refunds\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P08-007`, `P07-001`, `P01-006`\
  **Deliverable:** Use original bank_tran_id and supported provider API; record refund identifiers and attempt states.\
  **Acceptance:** Provider acceptance leaves refund Processing until independently verified payout.\
  **Evidence to attach:** Sandbox refund-init contract tests.

- [ ] **P08-009 — Implement refund-status verification/retry/investigation**\
  **Status:** `Not Started` · **Area:** Backend/jobs\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P08-008`, `P03-003`\
  **Deliverable:** Query supported status, reconcile uncertainty and guard authorized retry without duplicate payout.\
  **Acceptance:** Unknown result never marked Completed; duplicate callbacks and job restarts are safe.\
  **Evidence to attach:** Refund reconciliation tests.

- [ ] **P08-010 — Implement controlled COD/manual payout evidence**\
  **Status:** `Not Started` · **Area:** Backend/refunds\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P08-007`, `P06-012`, `P03-013`\
  **Deliverable:** Record consent where required, verified transfer and admin confirmation for COD/bank/mobile wallet.\
  **Acceptance:** Uncollected COD cannot be refunded; no Completed state without payout evidence.\
  **Evidence to attach:** Manual transfer security/audit test.

- [ ] **P08-011 — Persist return and refund decisions and notifications**\
  **Status:** `Not Started` · **Area:** Backend/notifications\
  **Sources:** FR-20; FR-17; FR-18\
  **Depends on:** `P08-003`, `P08-009`, `P08-010`, `P03-009`\
  **Deliverable:** Record approvals, rejection reasons, retry/failure and accurate customer status email.\
  **Acceptance:** Return completion never sends unverified refund-completed claim; notifications deduplicate.\
  **Evidence to attach:** Return/refund event tests.

- [ ] **P08-012 — Implement request/history and evidence UX**\
  **Status:** `Not Started` · **Area:** Storefront/returns\
  **Sources:** FR-17\
  **Depends on:** `P08-003`, `P08-002`, `P02-008`\
  **Deliverable:** Build eligible item/quantity selection, reason, optional image, deadlines, My Returns and status feedback.\
  **Acceptance:** Duplicate/invalid claims and unauthorized image uploads prevented server-side; upload progress, validation/failure and retry states preserve other form input.\
  **Evidence to attach:** Return customer E2E/a11y test.

- [ ] **P08-013 — Implement customer refund details and pending-investigation states**\
  **Status:** `Not Started` · **Area:** Storefront/refunds\
  **Sources:** FR-18\
  **Depends on:** `P08-005`, `P08-011`, `P02-009`\
  **Deliverable:** Consume canonical Refund.approvedAt, safe items/timeline and persisted timing snapshot; show original collection, amount/method, approved calendar/shorter-rule target, status and failure/support path. Missing approved timing basis is under_review with no guessed target date.\
  **Acceptance:** Processing is not shown as completed; deadline labels distinguish business/calendar days.\
  **Evidence to attach:** Refund details UI tests.

- [ ] **P08-014 — Implement admin return receipt, inspection and decision UI**\
  **Status:** `Not Started` · **Area:** Admin/returns\
  **Sources:** FR-32\
  **Depends on:** `P08-004`, `P08-003`, `P02-010`\
  **Deliverable:** Review claims/evidence, approve/reject, record receipt, inspection and resellability.\
  **Acceptance:** Confirmed action preserves history and does not bypass backend eligibility.\
  **Evidence to attach:** Admin return E2E.

- [ ] **P08-015 — Implement admin refund approval, attempts and payout UI**\
  **Status:** `Not Started` · **Area:** Admin/refunds\
  **Sources:** FR-33\
  **Depends on:** `P08-009`, `P08-010`, `P02-010`\
  **Deliverable:** Show eligible collected balance, partial quantities, pending commitments, provider/manual methods, attempts and retry actions.\
  **Acceptance:** No optimistic Completed and every financial action needs authorization/confirmation/audit.\
  **Evidence to attach:** Admin refund E2E.

- [ ] **P08-016 — Complete delivered-purchase and full-return review eligibility**\
  **Status:** `Not Started` · **Area:** Backend/reviews\
  **Sources:** FR-10; FR-31\
  **Depends on:** `P05-009`, `P06-011`, `P08-003`, `P08-005`\
  **Deliverable:** Require qualifying delivered purchase and block new verification after fully returned/refunded purchase unless another qualifies.\
  **Acceptance:** Legitimate prior reviews are not auto-deleted solely by refund; edited reviews return to moderation when required.\
  **Evidence to attach:** Verified purchase/return review tests.

- [ ] **P08-017 — Enable verified customer review submission and editing UI**\
  **Status:** `Not Started` · **Area:** Storefront/reviews\
  **Sources:** FR-10; FR-31\
  **Depends on:** `P08-016`, `P05-010`, `P05-012`\
  **Deliverable:** Build product/My Reviews submit/edit controls with purchased-product eligibility and moderation feedback.\
  **Acceptance:** Guest or ineligible accounts cannot post; edited reviews return to moderation where required.\
  **Evidence to attach:** Customer verified-review E2E.

- [ ] **P08-018 — Verify complete after-sales milestone**\
  **Status:** `Not Started` · **Area:** Quality/returns/refunds\
  **Sources:** FR-10; FR-15; FR-17; FR-18; FR-32; FR-33\
  **Depends on:** `P08-012`, `P08-013`, `P08-014`, `P08-015`, `P08-016`, `P08-017`, `P08-011`, `P08-006`, `P08-007`, `P07-017`\
  **Deliverable:** Exercise customer return/refund/review interfaces and item/quantity races, evidence uploads, approval/inspection, multiple partial refunds, manual/gateway payout evidence and failed outcomes.\
  **Acceptance:** M5 safety gates pass; every Completed refund has verified payout proof.\
  **Evidence to attach:** M5 after-sales test report.

### Phase 09 — Admin management and reports

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 09. **Associated gate:** M6. **Tasks:** 12.

- [ ] **P09-001 — Implement admin KPI dashboard and filtered activity summaries**\
  **Status:** `Not Started` · **Area:** Admin/analytics\
  **Sources:** FR-22\
  **Depends on:** `P06-011`, `P08-005`, `P04-006`, `P03-013`\
  **Deliverable:** Implement full canonical DashboardMetrics/DashboardCounts: product/customer/order and status counts, pending physical returns, lowStockItems/recentOrders (≤20 each), cutoff/date basis, outstanding COD and financial fields.\
  **Acceptance:** Statistics correspond to authoritative API; access restricted to administrator.\
  **Evidence to attach:** Dashboard dataset/route tests.

- [ ] **P09-002 — Implement separated gross/discount/paid/COD/refund/net reporting**\
  **Status:** `Not Started` · **Area:** Backend/reports\
  **Sources:** FR-22; FR-29\
  **Depends on:** `P09-001`, `P07-002`, `P06-012`, `P08-005`\
  **Deliverable:** Calculate gross merchandise, sale/coupon discounts, verified paid collections, outstanding COD, pending/completed refunds and net collected revenue.\
  **Acceptance:** Uncollected COD does not inflate collected revenue; refund and duplicate attempt aggregates remain accurate.\
  **Evidence to attach:** Financial sample-ledger tests.

- [ ] **P09-003 — Complete admin customer search, history and suspension workflow**\
  **Status:** `Not Started` · **Area:** Admin/customers\
  **Sources:** FR-27; PRD §10.2; Architecture §7.5\
  **Depends on:** `P03-013`, `P03-008`, `P06-014`, `P08-005`, `P01-007`\
  **Deliverable:** Build customer list/search, authorized order/return/refund history, suspend/reactivate controls and verified account-deletion request review/retention-safe processing.\
  **Acceptance:** Sensitive data is minimized; suspended sessions are revoked; deletion requests require verified ownership and approved retention handling, preserve required financial/audit records, and record operator decisions without inventing a self-service deletion feature.\
  **Evidence to attach:** Customer admin security E2E.

- [ ] **P09-004 — Complete complaint, support and delivery exception operations**\
  **Status:** `Not Started` · **Area:** Admin/support\
  **Sources:** FR-16; FR-26; FR-34\
  **Depends on:** `P06-017`, `P06-019`, `P03-013`\
  **Deliverable:** Provide complaint record, contact, order context, status, resolution and customer response path. Anonymous input requires contactName/contactEmail; authenticated omissions resolve only from own profile/verified order, never fabricated values.\
  **Acceptance:** Deadlines/complaint response rules are policy-verified before launch; duplicate actions preserve history.\
  **Evidence to attach:** Complaint workflow integration.

- [ ] **P09-005 — Complete store identity, content, policy and low-stock settings**\
  **Status:** `Not Started` · **Area:** Admin/settings\
  **Sources:** FR-34; FR-28\
  **Depends on:** `P06-001`, `P04-006`, `P03-013`, `P01-007`\
  **Deliverable:** Build branding, store address, contact, support details, low-stock threshold and approved policy publishing.\
  **Acceptance:** Unapproved placeholders cannot be published as law; existing order snapshots remain stable.\
  **Evidence to attach:** Settings/configuration E2E.

- [ ] **P09-006 — Finalize review moderation using qualifying purchase state**\
  **Status:** `Not Started` · **Area:** Admin/reviews\
  **Sources:** FR-10; FR-31\
  **Depends on:** `P08-017`, `P05-010`, `P03-013`\
  **Deliverable:** Complete approved/rejected/hidden and edited-review queue with audit reasons.\
  **Acceptance:** Only approved verified reviews publicly display; rating cannot be attributed falsely to customer edits by admin.\
  **Evidence to attach:** Review moderation E2E.

- [ ] **P09-007 — Consolidate financial/inventory exception screens and audit history**\
  **Status:** `Not Started` · **Area:** Admin/operations\
  **Sources:** FR-25; FR-26; FR-29; FR-33\
  **Depends on:** `P07-015`, `P08-015`, `P04-007`, `P09-002`\
  **Deliverable:** Provide pending reconciliation, stock adjustments, failed refunds and actor/action/timestamp history.\
  **Acceptance:** Sensitive financial actions remain backend guarded and never show optimistic outcomes.\
  **Evidence to attach:** Admin exception/audit tests.

- [ ] **P09-008 — Implement public contact and policy content pages**\
  **Status:** `Not Started` · **Area:** Storefront/content\
  **Sources:** FR-03; FR-16; FR-34\
  **Depends on:** `P09-005`, `P09-004`, `P02-006`\
  **Deliverable:** Serve Contact, Shipping Policy, Return & Refund Policy, Privacy and Terms from approved content; expose basic contact/complaint submission path.\
  **Acceptance:** All policy/footer links resolve without login; no placeholder legal promises; complaints record safely.\
  **Evidence to attach:** Public policy/contact page and complaint E2E.

- [ ] **P09-009 — Implement basic business report filters and safe pagination**\
  **Status:** `Not Started` · **Area:** Admin/reports\
  **Sources:** FR-22; FR-27\
  **Depends on:** `P09-002`, `P09-001`, `P02-010`\
  **Deliverable:** Show bounded report periods/filters, empty/loading/error states and accurate monetary labels.\
  **Acceptance:** No invented advanced BI feature; totals reconcile with authoritative data.\
  **Evidence to attach:** Report UI tests.

- [ ] **P09-010 — Verify complete admin sitemap and authorization**\
  **Status:** `Not Started` · **Area:** Quality/admin\
  **Sources:** FR-21; FR-22; FR-23; FR-24; FR-25; FR-26; FR-27; FR-28; FR-29; FR-30; FR-31; FR-32; FR-33; FR-34\
  **Depends on:** `P09-003`, `P09-004`, `P09-005`, `P09-006`, `P09-007`, `P09-009`\
  **Deliverable:** Walk all required admin pages, action confirmations and ownership protections on mobile/desktop.\
  **Acceptance:** All required operations are usable without frontend-only authorization assumptions.\
  **Evidence to attach:** Admin sitemap/accessibility review.

- [ ] **P09-011 — Provision isolated staging runtime and transaction-capable DB**\
  **Status:** `Not Started` · **Area:** DevOps/staging\
  **Sources:** Architecture §13; Implementation Plan §§4.1,12\
  **Depends on:** `P03-003`, `P01-005`, `P03-002`\
  **Deliverable:** Configure isolated storefront, static admin, API, MongoDB, workers, secret management, sandbox provider and test email.\
  **Acceptance:** Staging uses no production credentials; HTTPS/origin/session plans testable.\
  **Evidence to attach:** Staging configuration review.

- [ ] **P09-012 — Deploy integrated feature-complete build to staging**\
  **Status:** `Not Started` · **Area:** DevOps/staging\
  **Sources:** Implementation Plan Phase 09; §12.2\
  **Depends on:** `P03-016`, `P04-015`, `P05-013`, `P06-020`, `P07-017`, `P08-018`, `P09-008`, `P09-010`, `P09-011`\
  **Deliverable:** Deploy applications/workers, verify indexes, deployed CSRF/CORS/cookies, callbacks and guest links.\
  **Acceptance:** Feature-complete staging includes accepted M1–M5 phase gates, public policy/contact pages and admin functionality; Phase 10 receives an isolated deployed environment with known fixture/reset process.\
  **Evidence to attach:** Staging deploy manifest and smoke tests.

### Phase 10 — Testing, security review, and bug fixing

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 10. **Associated gate:** M6. **Tasks:** 13.

- [ ] **P10-001 — Run complete FR-01–FR-34 integration acceptance**\
  **Status:** `Not Started` · **Area:** Quality/release\
  **Sources:** PRD §5; §14; Implementation Plan §8\
  **Depends on:** `P09-012`, `P01-003`\
  **Deliverable:** Execute customer, guest, admin and cross-module acceptance on deployed staging against the P01-003 subrequirement, PRD §14 and P01-004 NFR check register.\
  **Acceptance:** Every applicable FR subrequirement, business rule, PRD §14 check and NFR/release gate has a pass/fail evidence link or an explicit release-blocking issue; no test mock is marked launch accepted.\
  **Evidence to attach:** FR traceability matrix and regression results.

- [ ] **P10-002 — Stress final-unit stock and coupon races**\
  **Status:** `Not Started` · **Area:** Quality/reliability\
  **Sources:** FR-09; FR-11; FR-13\
  **Depends on:** `P10-001`\
  **Deliverable:** Repeat last-unit inventory, coupon final redemption, checkout retries and expiry races on transactional DB.\
  **Acceptance:** Counters stay nonnegative; no duplicate order/holds or capacity breaches.\
  **Evidence to attach:** Concurrency report with run IDs.

- [ ] **P10-003 — Test missing/forged/duplicate/out-of-order and dual-paid events**\
  **Status:** `Not Started` · **Area:** Quality/payments\
  **Sources:** FR-12; FR-29\
  **Depends on:** `P10-001`\
  **Deliverable:** Exercise sandbox IPN uncertainty, invalid merchant/amount, delayed/late verified payment including already-cancelled orders, risk flags, multiple paid attempts and reconciliation.\
  **Acceptance:** Collected money preserved; fulfillment allocation occurs at most once.\
  **Evidence to attach:** Payment fault-injection evidence.

- [ ] **P10-004 — Test payout failures, partial refunds and replay**\
  **Status:** `Not Started` · **Area:** Quality/refunds\
  **Sources:** FR-18; FR-33\
  **Depends on:** `P10-001`\
  **Deliverable:** Exercise overlapping physical/shortage claims, final failed-delivery stock recovery, excess-collection corrections, overcommit attempts, unknown gateway payout and duplicate/manual retries.\
  **Acceptance:** Source-collection/order caps hold; Completed requires confirmed payout. Physical-return refunds cannot bypass required inspection; approved shortage/payment-correction cases do not require fictional inspection or restock.\
  **Evidence to attach:** Refund fault-injection evidence.

- [ ] **P10-005 — Audit session, CSRF, guest and privileged operations**\
  **Status:** `Not Started` · **Area:** Quality/security\
  **Sources:** FR-01; FR-19; FR-21; PRD §12\
  **Depends on:** `P10-001`\
  **Deliverable:** Verify client/admin session isolation, guest proof replay, nested ownership, Origin/CSRF, uploads, rate limits, log safety and authorization/retention safeguards for account-deletion requests.\
  **Acceptance:** Unauthorized access/financial changes denied across all sensitive routes.\
  **Evidence to attach:** Security regression report.

- [ ] **P10-006 — Audit WCAG-targeted flows in both themes**\
  **Status:** `Not Started` · **Area:** Quality/UI\
  **Sources:** Design §§3,12,14\
  **Depends on:** `P10-001`\
  **Deliverable:** Run automated and manual keyboard/screen-reader checks on discovery, checkout, guest proof, returns, admin dialogs/tables.\
  **Acceptance:** Labels, focus, reflow, contrast, reduced motion and exact primary brand blue meet design target.\
  **Evidence to attach:** Accessibility findings/resolution record.

- [ ] **P10-007 — Verify mobile, tablet, desktop and target browsers**\
  **Status:** `Not Started` · **Area:** Quality/UI\
  **Sources:** PRD §12.7; Design §1\
  **Depends on:** `P10-001`\
  **Deliverable:** Test current stable Chrome, Firefox, Edge, Brave and Safari at representative viewports.\
  **Acceptance:** No blocking navigation/checkout issues or page-level horizontal overflow.\
  **Evidence to attach:** Browser/device matrix.

- [ ] **P10-008 — Measure public catalog and checkout performance**\
  **Status:** `Not Started` · **Area:** Quality/performance\
  **Sources:** PRD §12.1; Architecture §12\
  **Depends on:** `P10-001`\
  **Deliverable:** Record approved measurable performance budgets and catalog/load/device/network profiles in `TESTING.md` before measuring pagination/index selection, image optimization, catalog rendering, and checkout latency. Compare measurements with the approved budgets.\
  **Acceptance:** No unbounded result sets or invalid shared caching; findings have disposition.\
  **Evidence to attach:** Performance/query report.

- [ ] **P10-009 — Verify SEO, cache and personal data separation**\
  **Status:** `Not Started` · **Area:** Quality/security\
  **Sources:** FR-04; FR-05; Architecture §5\
  **Depends on:** `P10-001`\
  **Deliverable:** Validate product metadata/canonicals, catalog invalidation and no shared caching of sessions, cart, order or guest data.\
  **Acceptance:** Search metadata corresponds to active content and private responses remain private.\
  **Evidence to attach:** Cache/SEO inspection report.

- [ ] **P10-010 — Verify notification coverage and worker restart safety**\
  **Status:** `Not Started` · **Area:** Quality/operations\
  **Sources:** FR-20\
  **Depends on:** `P10-001`\
  **Deliverable:** Check registration/recovery, order, payment, cancel, shipment/delivery, return, refund events and retries after restarts.\
  **Acceptance:** No duplicate events and failed mail cannot roll back business operations.\
  **Evidence to attach:** Notification event matrix and worker tests.

- [ ] **P10-011 — Exercise protected backup/restore and uncertain-operation recovery**\
  **Status:** `Not Started` · **Area:** Quality/operations\
  **Sources:** PRD §12.3; §18; Architecture §13\
  **Depends on:** `P09-012`, `P10-003`, `P10-004`\
  **Deliverable:** Restore test data and reconcile payment/refund events received after backup snapshot.\
  **Acceptance:** Data recovered without inventing collections or losing audit/payment records.\
  **Evidence to attach:** Timestamped restoration/reconciliation runbook test.

- [ ] **P10-012 — Resolve and retest release-blocking defects**\
  **Status:** `Not Started` · **Area:** Quality/release\
  **Sources:** Implementation Plan §10.4\
  **Depends on:** `P10-002`, `P10-003`, `P10-004`, `P10-005`, `P10-006`, `P10-007`, `P10-008`, `P10-009`, `P10-010`, `P10-011`\
  **Deliverable:** Triage severity with reproduced defects, fixes, affected regression and approved exceptions.\
  **Acceptance:** No unresolved critical financial, security, privacy, stock, checkout or recovery defects.\
  **Evidence to attach:** Defect tracker and regression rerun links.

- [ ] **P10-013 — Compile M6 release-candidate acceptance decision**\
  **Status:** `Not Started` · **Area:** Quality/release\
  **Sources:** PRD §14; Implementation Plan §§10-11\
  **Depends on:** `P10-012`, `P10-001`\
  **Deliverable:** Publish FR/NFR evidence, blocked/deferred dispositions, test artifacts and release approver decision.\
  **Acceptance:** Production promotion is blocked until all mandatory gates pass.\
  **Evidence to attach:** M6 signed acceptance record.

### Phase 11 — Deployment and production verification

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 11. **Associated gate:** M7. **Tasks:** 11.

- [ ] **P11-001 — Provision production runtimes, domain and secret boundaries**\
  **Status:** `Not Started` · **Area:** DevOps/production\
  **Sources:** Architecture §13\
  **Depends on:** `P10-013`, `P01-005`\
  **Deliverable:** Configure Next.js-capable storefront, static Vite admin SPA, protected Express service, TLS and approved same-site origins.\
  **Acceptance:** Each app independently deploys; secrets stay server-side and environments isolated.\
  **Evidence to attach:** Production topology/configuration review.

- [ ] **P11-002 — Configure managed transactional database, indexes and backups**\
  **Status:** `Not Started` · **Area:** DevOps/data\
  **Sources:** PRD §12.3; Architecture §13\
  **Depends on:** `P11-001`, `P03-002`\
  **Deliverable:** Provision replica-set-capable MongoDB, apply unique/conditional indexes and encrypted protected backups.\
  **Acceptance:** Index compatibility verified before serving commerce writes; restore steps exist.\
  **Evidence to attach:** DB/index and backup verification.

- [ ] **P11-003 — Verify cookies, CORS, CSRF and callback origins on live domains**\
  **Status:** `Not Started` · **Area:** DevOps/security\
  **Sources:** FR-01; FR-21; Architecture §9\
  **Depends on:** `P11-001`, `P11-002`\
  **Deliverable:** Validate host-only customer/admin cookies, approved origins, HTTPS and IPN/callback URLs.\
  **Acceptance:** No cross-role session access and no exposed merchant/provider secrets.\
  **Evidence to attach:** Live-origin security smoke test.

- [ ] **P11-004 — Deploy restart-safe jobs, alerts and reconciliation visibility**\
  **Status:** `Not Started` · **Area:** DevOps/operations\
  **Sources:** FR-12; FR-18; FR-20\
  **Depends on:** `P11-002`, `P11-003`\
  **Deliverable:** Run durable expiry, payment/refund status and notification jobs with claims and health alerts.\
  **Acceptance:** Restart/overlap cannot duplicate financial mutations; unresolved status appears for operators.\
  **Evidence to attach:** Worker monitoring test.

- [ ] **P11-005 — Confirm production merchant activation, limits and refund pathways**\
  **Status:** `Not Started` · **Area:** External/payment\
  **Sources:** FR-12; FR-18\
  **Depends on:** `P01-006`, `P11-003`\
  **Deliverable:** Obtain documented activation, limits, validation, and payout support for all three required bKash/Nagad/Rocket channels. A missing channel blocks baseline launch; any restricted release first requires an approved PRD scope revision.\
  **Acceptance:** Unsupported channels hidden; no unapproved live financial testing.\
  **Evidence to attach:** Merchant activation/approval evidence.

- [ ] **P11-006 — Load approved products, branding and operational configuration**\
  **Status:** `Not Started` · **Area:** Operations/content\
  **Sources:** FR-03; FR-16; FR-23; FR-28; FR-34\
  **Depends on:** `P11-002`, `P09-005`, `P01-005`\
  **Deliverable:** Publish actual catalog/stock, delivery coverage/charges, support contact and store identity.\
  **Acceptance:** Customer prices/availability accurate; no placeholder policies or invented products.\
  **Evidence to attach:** Owner sign-off and configuration snapshot.

- [ ] **P11-007 — Obtain current legal and published-policy approvals**\
  **Status:** `Not Started` · **Area:** Operations/compliance\
  **Accountable role:** Store owner / authorized release approver; actual named delegation recorded before review.\
  **Sources:** FR-16; FR-17; FR-18; FR-34\
  **Depends on:** `P01-007`, `P11-006`\
  **Deliverable:** Verify current Bangladesh delivery deadlines, the applicable complaint-response period, refund obligations and approved shipping, cancellation, return, refund, privacy and terms copy.\
  **Acceptance:** Policy baselines are not misrepresented as operative law; checkout terms reference approved version.\
  **Evidence to attach:** Dated authority/operator approval record.

- [ ] **P11-008 — Run approved production storefront/COD/guest/admin smoke tests**\
  **Status:** `Not Started` · **Area:** Quality/production\
  **Sources:** FR-11; FR-19; FR-21; FR-26\
  **Depends on:** `P11-003`, `P11-004`, `P11-006`, `P11-007`\
  **Deliverable:** Check browsing, customer/admin login, guest verification, configured delivery, safe COD and order visibility through approved production scenarios.\
  **Acceptance:** Results are authoritative; testing does not create unapproved orders or charge customers.\
  **Evidence to attach:** Production smoke log.

- [ ] **P11-009 — Validate offered live channels and operational refund safeguards**\
  **Status:** `Not Started` · **Area:** Quality/production\
  **Sources:** FR-12; FR-18; FR-29; FR-33\
  **Depends on:** `P11-005`, `P11-008`\
  **Deliverable:** Verify all three required live channels, URLs, webhook reachability, status checks, reconciliation, and authorized real-transaction evidence when approved. Apply a smaller set only after the approved PRD scope revision is recorded.\
  **Acceptance:** All baseline-required channels have activation and acceptance evidence; no unsupported method appears. A reduced set is accepted only against a previously approved PRD scope revision. Payout safeguards and incident response are ready.\
  **Evidence to attach:** Merchant/operations verification sign-off.

- [ ] **P11-010 — Verify monitoring, alerting, rollback and incident response**\
  **Status:** `Not Started` · **Area:** DevOps/production\
  **Sources:** PRD §12; §18\
  **Depends on:** `P11-004`, `P11-009`, `P10-011`\
  **Deliverable:** Confirm health/error alerts, protected logs, escalation, rollback triggers and backup/restoration evidence.\
  **Acceptance:** Application rollback cannot erase financial history; incidents route to authorized reconciliation.\
  **Evidence to attach:** Observability and incident drill record.

- [ ] **P11-011 — Obtain explicit M7 production launch acceptance**\
  **Status:** `Not Started` · **Area:** Release\
  **Sources:** PRD §14; §18\
  **Depends on:** `P11-010`, `P11-007`, `P11-008`, `P11-009`\
  **Deliverable:** Record approved deploy version, tests, enabled channels, owner decision and unresolved limitations.\
  **Acceptance:** No unsafe or unverified money/security/policy gate is accepted as complete; all PRD-required channels pass, or an approved revised PRD explicitly defines the accepted channel set.\
  **Evidence to attach:** M7 launch approval record.

### Phase 12 — Documentation and handover

**Plan reference:** `IMPLEMENTATION_PLAN.md` §6, Phase 12. **Associated gate:** M8. **Tasks:** 9.

- [ ] **P12-001 — Finalize repository README and local setup guide**\
  **Status:** `Not Started` · **Area:** Documentation\
  **Sources:** PRD §18; Architecture §4\
  **Depends on:** `P11-011`\
  **Deliverable:** Document npm workspaces, prerequisites, app start, env variable names, fixtures and local tests.\
  **Acceptance:** New engineer can reproduce builds without secrets in documentation.\
  **Evidence to attach:** README reproducibility review.

- [ ] **P12-002 — Document API contracts, schemas, errors and index setup**\
  **Status:** `Not Started` · **Area:** Documentation\
  **Sources:** Architecture §§7-8\
  **Depends on:** `P12-001`\
  **Deliverable:** Reconcile existing `API.md` endpoint/request/response/error/authorization contracts and existing `DATABASE.md` schemas/indexes/migrations against the final implementation. Keep the two deliverables separate and cross-referenced; do not author them for the first time at handover.\
  **Acceptance:** Docs match implementation; no undocumented route grants access.\
  **Evidence to attach:** API/schema documentation audit.

- [ ] **P12-003 — Publish deployment, rollback, jobs and restore runbooks**\
  **Status:** `Not Started` · **Area:** Documentation\
  **Sources:** PRD §18; Architecture §13\
  **Depends on:** `P11-010`, `P12-001`\
  **Deliverable:** Finalize existing `OPERATIONS.md` sections for CI/CD, environments, index rollout, health checks, worker restart, backup/restore, escalation, and operator/provider procedures. Reconcile existing `TESTING.md` commands, fixtures, scenarios, and evidence with release verification.\
  **Acceptance:** Operator can rehearse incident without exposing secrets or erasing records.\
  **Evidence to attach:** Runbook restoration walk-through.

- [ ] **P12-004 — Publish store operator guide**\
  **Status:** `Not Started` · **Area:** Documentation\
  **Sources:** PRD §18; FR-26; FR-33\
  **Depends on:** `P09-010`, `P12-001`\
  **Deliverable:** Explain catalog, stock, delivery, orders, COD, risk holds, refunds, reviews, customer support and settings.\
  **Acceptance:** Guides reflect real UI, decision permissions and verified statuses.\
  **Evidence to attach:** Operator walkthrough checklist.

- [ ] **P12-005 — Document payment/refund provider operations**\
  **Status:** `Not Started` · **Area:** Documentation\
  **Sources:** FR-12; FR-18; FR-29\
  **Depends on:** `P11-009`, `P12-003`\
  **Deliverable:** Describe gateway channel/config ownership, attempt search, IPN reconciliation, refund status and manual payout evidence.\
  **Acceptance:** No merchant credentials in docs; uncertain payments stay investigable.\
  **Evidence to attach:** Provider runbook review.

- [ ] **P12-006 — Hand over repository, admin and third-party account ownership**\
  **Status:** `Not Started` · **Area:** Operations/handover\
  **Sources:** PRD §18\
  **Depends on:** `P12-004`, `P12-005`\
  **Deliverable:** Transfer access by secure process and list accountable production owners for app, DNS, MongoDB, media, email and merchant.\
  **Acceptance:** Ownership and recovery paths accepted; no secrets copied into TASKS.md.\
  **Evidence to attach:** Access handover acknowledgments.

- [ ] **P12-007 — Record known limitations, support, costs and warranty boundaries**\
  **Status:** `Not Started` · **Area:** Operations/handover\
  **Sources:** PRD §18\
  **Depends on:** `P12-006`\
  **Deliverable:** Document accepted limitations, deferred work, support contacts, third-party fees and maintenance arrangement.\
  **Acceptance:** Mandatory initial-release safety requirements are not silently deferred.\
  **Evidence to attach:** Signed limitations/support record.

- [ ] **P12-008 — Reconcile task status, acceptance evidence and milestone history**\
  **Status:** `Not Started` · **Area:** Planning/handover\
  **Sources:** Implementation Plan §14.3\
  **Depends on:** `P12-002`, `P12-003`, `P12-007`\
  **Deliverable:** Audit all TASKS.md checkboxes, evidence references, blocker disposition and final FR/NFR acceptance.\
  **Acceptance:** No Done without evidence; M1–M7 have recorded decisions and owners; M8 has a complete evidence package and named approver, with its acceptance still pending P12-009.\
  **Evidence to attach:** Final task/evidence reconciliation.

- [ ] **P12-009 — Obtain final M8 handover acceptance**\
  **Status:** `Not Started` · **Area:** Release/handover\
  **Sources:** PRD §18; Implementation Plan §14\
  **Depends on:** `P12-008`\
  **Deliverable:** Collect final technical/operational handover sign-off for owner, support and unresolved issues.\
  **Acceptance:** Repository, deployment, incident runbooks and approved production ownership are acknowledged.\
  **Evidence to attach:** M8 handover acceptance record.

## 6. Dependencies & blockers

**Core commerce path:** `P01–P03 foundation → P04 catalog/inventory → P05 pricing/coupon/cart → P06 delivery/checkout/COD/holds → P07 verified online payment → P08 refunds/returns → P09 integrated admin and staging → P10 release acceptance → P11 production → P12 handover`.

- Task IDs are stable identifiers, not a demand that independent modules be implemented strictly in numeric order. Complete all referenced prerequisites before accepting dependent work.
- Some tasks also require **external** decisions or operator-supplied inputs. Do not equate dependency task completion with merchant activation, approved legal terms or live credentials.
- A phase may contain implemented-but-not-externally-verified work. Keep its provider-dependent task or milestone unaccepted until authoritative evidence exists.
- A later phase may finish an earlier feature: delivered reviews close after order/return eligibility, notifications span phases, and admin screens are implemented alongside their respective domain features.

[P01-008 critical scenarios](./evidence/P01-008-critical-scenarios.md) map mandatory exceptions and safety invariants
to existing tests, feature/verification owners and the declared dependency path. Runtime evidence remains separate.

### 6.1 External readiness and blocker register

[P01-005 readiness records](./evidence/P01-005-readiness.md) track accountable functions, named appointments, separate
test/production states, evidence needs, blocking impacts and safe next actions for every EXT ID below.

[P01-006 gateway/refund assessment](./evidence/P01-006-gateway-feasibility.md) records official source findings and
account-specific verification needs for EXT-01/02/09; it does not establish merchant activation or live payout capability.

[P01-007 policy gates](./evidence/P01-007-policy-gates.md) assign the launch verification role and record required
qualified/operator approvals, source evidence and publication checks; draft policies are not legally certified.

| ID | Dependency / gate | First affected tasks | Resolution evidence |
| --- | --- | --- | --- |
| EXT-01 | SSLCOMMERZ sandbox, live activation and enabled bKash/Nagad/Rocket channels | P01 gateway readiness; P07; P11 | Merchant account activation, test and live-channel verification |
| EXT-02 | SSLCOMMERZ supported refund/status procedure and limits | P01 gateway readiness; P08; P11 | Provider documentation/account-specific supported method and sandbox outcome |
| EXT-03 | MongoDB transaction-capable deployment and backup/restore infrastructure | P03; P06; P09–P11 | Replica-set test, indexes and restore result |
| EXT-04 | Cloudinary account, media credentials, upload policy and approved assets | P04 | Credentials/access verification and media security test |
| EXT-05 | Email provider, approved sender identity and delivery testing | P03; P06–P08; P11 | Sender verification and email delivery/retry results |
| EXT-06 | Approved product images/prices/SKUs/stock and store identity/support contact | P04; P09; P11 | Operator-approved catalog/configuration evidence |
| EXT-07 | Approved delivery zones/charges, fulfillment policy and operational contacts | P06; P11 | Delivery configuration and operational approval |
| EXT-08 | Current legal verification and approved policy/terms/privacy content | P06; P08; P09; P11 | Dated legal/owner review and published copy approval |
| EXT-09 | Hosting, approved origins/DNS, staging and production credentials | P09; P11 | Deployment, HTTPS, cookies/CORS/CSRF and backup evidence |

Record readiness evidence against each EXT ID during provisioning and integration. When an input blocks execution,
set the affected task to `Blocked` and record its owner, acceptance impact and next verification action. Continue safe
independent work; use actual provider and policy evidence for financial and launch acceptance.

## 7. Requirements coverage matrix

The matrix assigns implementation ownership. Record requirement-level evidence during execution and use PRD §14 as the definitive acceptance checklist.

[P01-003 detailed traceability](./evidence/P01-003-traceability.md) maps every source clause and acceptance check to its
accountable task, shared UI/API context and planned verification/evidence slot. The summary below retains the original
owners and includes additional cross-domain owners identified by that mapping.

| PRD requirement | Owning tasks (and key follow-through) |
| --- | --- |
| FR-01 | `P03-004`, `P03-005`, `P03-007`, `P03-010`, `P03-013`, `P03-014`, `P03-015`, `P03-016`, `P10-005`, `P11-003`, `P09-003` |
| FR-02 | `P03-004`, `P03-008`, `P03-010`, `P03-011`, `P03-013`, `P03-015`, `P03-016`, `P06-014`, `P05-004`, `P05-012`, `P08-012`, `P06-005`, `P08-013` |
| FR-03 | `P04-012`, `P04-015`, `P09-008`, `P11-006`, `P02-006`, `P09-005` |
| FR-04 | `P04-001`, `P04-009`, `P04-011`, `P04-013`, `P04-015`, `P10-009`, `P04-002` |
| FR-05 | `P04-002`, `P04-003`, `P04-010`, `P04-011`, `P04-014`, `P04-015`, `P10-009`, `P05-001`, `P05-004`, `P05-010`, `P06-004` |
| FR-06 | `P04-002`, `P04-005`, `P04-010`, `P04-014`, `P04-015`, `P04-006`, `P06-005` |
| FR-07 | `P05-001`, `P05-002`, `P05-003`, `P05-011`, `P05-013`, `P06-004` |
| FR-08 | `P05-004`, `P05-012`, `P05-013` |
| FR-09 | `P05-005`, `P05-006`, `P05-007`, `P05-011`, `P05-013`, `P06-004`, `P06-007`, `P06-009`, `P06-010`, `P06-020`, `P07-008`, `P07-009`, `P10-002`, `P05-008`, `P06-008`, `P07-013` |
| FR-10 | `P05-009`, `P05-010`, `P05-012`, `P05-013`, `P08-016`, `P08-017`, `P08-018`, `P09-006` |
| FR-11 | `P06-004`, `P06-005`, `P06-006`, `P06-008`, `P06-009`, `P06-018`, `P06-020`, `P07-004`, `P10-002`, `P11-008`, `P06-001` |
| FR-12 | `P01-006`, `P06-008`, `P06-012`, `P07-001`, `P07-002`, `P07-003`, `P07-004`, `P07-005`, `P07-006`, `P07-007`, `P07-008`, `P07-009`, `P07-010`, `P07-011`, `P07-012`, `P07-013`, `P07-014`, `P07-015`, `P07-017`, `P10-003`, `P11-004`, `P11-005`, `P11-009`, `P12-005`, `P06-010` |
| FR-13 | `P04-006`, `P04-008`, `P04-015`, `P06-007`, `P06-008`, `P06-009`, `P06-010`, `P06-020`, `P07-008`, `P07-009`, `P07-017`, `P08-004`, `P10-002`, `P06-013`, `P07-011`, `P06-011` |
| FR-14 | `P06-005`, `P06-011`, `P06-014`, `P06-019`, `P06-020`, `P06-013`, `P08-012`, `P08-013`, `P06-003`, `P06-017`, `P07-011` |
| FR-15 | `P06-013`, `P06-019`, `P06-020`, `P08-018`, `P08-005`, `P06-016` |
| FR-16 | `P01-007`, `P06-001`, `P06-002`, `P06-003`, `P06-011`, `P06-017`, `P06-018`, `P06-020`, `P09-004`, `P09-008`, `P11-006`, `P11-007`, `P06-016` |
| FR-17 | `P01-007`, `P08-001`, `P08-002`, `P08-003`, `P08-004`, `P08-011`, `P08-012`, `P08-018`, `P11-007` |
| FR-18 | `P01-006`, `P01-007`, `P07-011`, `P08-005`, `P08-006`, `P08-007`, `P08-008`, `P08-009`, `P08-010`, `P08-011`, `P08-013`, `P08-018`, `P10-004`, `P11-004`, `P11-005`, `P11-007`, `P11-009`, `P12-005` |
| FR-19 | `P06-015`, `P06-019`, `P06-020`, `P10-005`, `P11-008`, `P06-013`, `P08-012`, `P08-013` |
| FR-20 | `P03-009`, `P03-010`, `P06-016`, `P06-020`, `P07-016`, `P08-011`, `P10-010`, `P11-004` |
| FR-21 | `P03-004`, `P03-005`, `P03-012`, `P03-013`, `P03-014`, `P03-015`, `P03-016`, `P09-010`, `P10-005`, `P11-003`, `P11-008` |
| FR-22 | `P09-001`, `P09-002`, `P09-009`, `P09-010` |
| FR-23 | `P04-002`, `P04-003`, `P04-005`, `P04-015`, `P09-010`, `P11-006` |
| FR-24 | `P04-001`, `P04-004`, `P04-015`, `P09-010`, `P04-003` |
| FR-25 | `P04-006`, `P04-007`, `P04-015`, `P09-007`, `P09-010`, `P08-004` |
| FR-26 | `P06-003`, `P06-011`, `P06-012`, `P06-013`, `P06-017`, `P06-019`, `P06-020`, `P09-004`, `P09-007`, `P09-010`, `P11-008`, `P12-004`, `P07-015`, `P08-015` |
| FR-27 | `P09-003`, `P09-009`, `P09-010` |
| FR-28 | `P06-001`, `P06-002`, `P06-020`, `P09-005`, `P09-010`, `P11-006` |
| FR-29 | `P06-012`, `P06-020`, `P07-002`, `P07-010`, `P07-012`, `P07-015`, `P07-017`, `P09-002`, `P09-007`, `P09-010`, `P10-003`, `P11-009`, `P12-005`, `P08-015` |
| FR-30 | `P05-008`, `P05-013`, `P09-010` |
| FR-31 | `P05-009`, `P05-010`, `P05-013`, `P08-016`, `P08-017`, `P09-006`, `P09-010` |
| FR-32 | `P08-001`, `P08-003`, `P08-004`, `P08-014`, `P08-018`, `P09-010`, `P08-002`, `P08-005` |
| FR-33 | `P08-005`, `P08-006`, `P08-008`, `P08-009`, `P08-010`, `P08-015`, `P08-018`, `P09-007`, `P09-010`, `P10-004`, `P11-009`, `P12-004`, `P08-011`, `P08-007` |
| FR-34 | `P01-007`, `P06-017`, `P09-004`, `P09-005`, `P09-008`, `P09-010`, `P11-006`, `P11-007`, `P06-001` |

### 7.1 Non-functional and cross-cutting coverage

[P01-004 detailed coverage](./evidence/P01-004-nfr-release.md) assigns each PRD §12 and §18 requirement, every existing
AC check, QA/operations release checklist item and M1–M8 gate a task owner and planned verification/evidence slot.

| Area | Owning task groups and release evidence |
| --- | --- |
| Authentication, security, authorization and privacy | P03 identity/security; P06 guest proof; P10 security regression; P11 production-origin verification |
| Financial, coupon and inventory integrity | P04 stock foundation; P05 promotions; P06 allocation; P07 payment; P08 refund; P10 concurrency/fault injection |
| Public search, SEO, performance and private caching | P04 catalog/metadata; P10 performance and cache audit |
| Responsive, theme and accessibility | P02 UI foundation; feature UI tasks in P03–P09; P10 both-theme/browser acceptance |
| Notifications, scheduled work and recovery | P03 email core; P06/P07/P08 events; P07/P08 reconciliation; P10 restart and backup; P11 monitoring |
| Delivery, complaints, customer rights and publication | P01 readiness; P06 deadlines/complaints; P08 eligible returns; P09 policies; P11 authority/owner approval |
| Operational and release readiness | P09 staging; P10 PRD acceptance/restore; P11 live safe checks; P12 handover |

### 7.2 Page and end-to-end coverage

Storefront pages must include Home, Products, Category, Product Details, Login/Register/Recovery, Cart, Wishlist, Checkout, Payment Result, Order Confirmation, Guest Order Lookup, Account/Profile/Addresses, My Orders/Details, My Reviews, Return Request/My Returns/Refund Details, Contact, and Shipping/Returns/Privacy/Terms content. Each is owned by its domain task and validated via P10 acceptance; `P09-008` public-content work and P11 approved operator settings supply policy pages, not hard-coded legal claims. Admin pages cover Dashboard, Products/Add/Edit, Categories, Inventory, Orders/Details, Customers, Delivery Settings, Payments, Coupons, Reviews, Returns, Refunds, Reports and Store Settings. Complaints may live in order/customer context rather than a standalone ticketing product.

For each critical user journey (guest COD, registered COD, hosted gateway, late/duplicate payment, return, refund, verified review, failed delivery and admin reconciliation), link a test in its owning task and the P10 release evidence. No separate page may bypass backend permission checks.

## 8. Verification & completion rules

Before checking a task, ensure its applicable code/configuration exists, builds and follows approved module boundaries; server-side validation, access control and failure states are covered; related UI states meet `DESIGN.md`; and tests plus reviewer evidence are recorded. Mark review/approval as distinct from implementation; use `In Review` until acceptance.

**Required completion evidence, as applicable:** code/commit or PR reference, tests and their environment, concurrency/transaction test output, integration screenshots, provider sandbox/live validation, accessibility/browser report, approved policy or operator sign-off, and monitoring/restore runbook demonstration. Never invent results or mark unfinished provider and legal verification as done.

**Mandatory gate checks:**

1. Checkout uses authoritative integer-poisha pricing, stock, coupon, delivery and immutable historical order snapshots.
2. Checkout, inventory, coupon, payment, notifications, financial retries and refund commitments remain idempotent/concurrency-safe.
3. IPNs and redirects never prove payment by themselves; verified collection can exist independently of fulfillment. COD is collected only on verified recording.
4. Refund commitments cannot exceed source-collection or order capacity; Completed requires confirmed payout. Physical returns require inspection; missing-item claims have no fictional receipt/restock. Excess-collection corrections do not consume merchandise-return quantities.
5. Guest, customer and admin privileges remain isolated, including nested records, rate limits, CSRF and provider callback verification.
6. Critical checkout/admin flows support mobile, keyboard, assistive technology, visible state text, and both approved appearance modes.
7. Staging acceptance, live channel activation, policies, monitoring, backup/restore and final operator approval precede production launch.

**Failure policy:** A failed mandatory criterion keeps its task/phase/release gate open. Document the defect, affected scenario, reproduction and fix evidence; retest impacted behavior. Mandatory security, payment, inventory, coupon, checkout and recovery requirements cannot be waived as routine known issues.

## 9. Change & execution log

Record task execution, material blockers, acceptance and milestone decisions here. Documentation revisions belong in
[CHANGELOG](../CHANGELOG.md).

| Date (Asia/Dhaka) | Task / milestone | Change or result | Owner / reviewer | Evidence | Next action |
| --- | --- | --- | --- | --- | --- |
| 17 October 2026 | P01-001 | Baseline verification passed; project owner accepted the checklist; status Done | Codex / project owner | [Accepted baseline verification](./evidence/P01-001-baseline.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-002 | Scope and exclusion review passed; project owner accepted the checklist; status Done | Codex / project owner | [Accepted scope verification](./evidence/P01-002-scope.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-003 | Traceability verification passed; project owner accepted the register; status Done | Codex / project owner | [Accepted traceability register](./evidence/P01-003-traceability.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-004 | NFR/release coverage verification passed; project owner accepted the register; status Done | Codex / project owner | [Accepted NFR/release register](./evidence/P01-004-nfr-release.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-005 | Readiness-register verification passed; project owner accepted the register; status Done; external readiness remains separately Pending | Codex / project owner | [Accepted readiness register](./evidence/P01-005-readiness.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-006 | Gateway/refund planning assessment passed; project owner accepted the assessment; status Done; merchant-specific activation/payout gates remain separate | Codex / project owner | [Accepted gateway/refund feasibility](./evidence/P01-006-gateway-feasibility.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-007 | Policy-gate verification passed; project owner accepted the record; status Done; actual legal/publication approvals remain separate | Codex / project owner | [Policy/customer-rights gates](./evidence/P01-007-policy-gates.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-008 | Critical-scenario and dependency checks passed; project owner accepted the planning record; status Done; runtime verification remains separate | Codex / project owner | [Critical-scenario map](./evidence/P01-008-critical-scenarios.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-009 | Workspace clean-install/discovery and safety checks passed; project owner accepted the foundation; status Done | Codex / project owner | [Workspace foundation](./evidence/P01-009-workspace.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-010 | Local pipeline and 12 tooling regressions passed; hosted run 39039353486 Passed; project owner accepted baseline; status Done | Codex / project owner | [Accepted CI baseline evidence](./evidence/P01-010-ci.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-011 | Agent-rule review and static checks passed; project owner accepted the reviewed instructions; status Done | Codex / project owner | [Accepted agent-rule review](./evidence/P01-011-agent-rules.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-012 | Not Started → In Review → Done; protocol/register checks passed; project owner accepted the task/status/evidence protocol | Codex / project owner | [Accepted task-protocol review](./evidence/P01-012-task-protocol.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-013 | Not Started → In Review → Done; coverage/static and local CI checks passed; project owner accepted the testing baseline | Codex / project owner | [Accepted testing baseline](./evidence/P01-013-testing-baseline.md) | Proceed through declared task dependencies |
| 17 October 2026 | P01-014 | Not Started → In Review → Done; operations/static checks passed; project owner accepted the operations baseline | Codex / project owner | [Accepted operations baseline](./evidence/P01-014-operations-baseline.md) | Proceed through declared task dependencies |
| 17 October 2026 | P02-001 | Not Started → In Progress → In Review → Done; build, layout/production smoke and configured CI checks passed; project owner accepted the storefront scaffold | Codex / project owner | [Accepted storefront scaffold](./evidence/P02-001-storefront.md) | Proceed through declared task dependencies |

| 17 October 2026 | P02-002 | Not Started → In Progress → In Review → Done; independent build, DOM navigation, HTTP smoke and configured CI checks passed; project owner accepted the admin scaffold | Codex / project owner | [Accepted admin scaffold](./evidence/P02-002-admin.md) | Proceed through declared task dependencies |

When execution starts, update the task status and attach evidence. Change a checkbox to `[x]` only after acceptance.
Preserve IDs and dependency references; update phase totals and record milestone acceptance separately.
