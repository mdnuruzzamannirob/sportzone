# P01-012 — Task statuses and evidence protocol

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Result:** Passed — task-register and evidence-protocol review\
**Prerequisites:** P01-003 and P01-008 Done

## Scope and authority

Reviewed [TASKS §2](../TASKS.md#2-task-management-conventions),
[§4 milestones](../TASKS.md#4-milestone-tracker),
[§6 dependencies/blockers](../TASKS.md#6-dependencies--blockers),
[§8 completion rules](../TASKS.md#8-verification--completion-rules) and
[§9 execution log](../TASKS.md#9-change--execution-log) against
[Implementation Plan §3.4](../IMPLEMENTATION_PLAN.md#34-task-decomposition-contract),
[§11](../IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates) and
[§14](../IMPLEMENTATION_PLAN.md#14-completion--handover).
[Testing §17.2](../TESTING.md#172-test-evidence-record) owns detailed test evidence;
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting) governs agent handoff and independent acceptance.

The task register now makes all seven status conditions, evidence fields and transition recording explicit. Stable task IDs,
existing dependency edges, product scope, acceptance criteria and milestone decisions are unchanged. No runtime/tooling
file or previous accepted evidence was modified.

## Initial unverified state

Read the first committed TASKS.md with:

```sh
git log --reverse --format=%H -- docs/TASKS.md
git show 55b3ddfcd93e5e5e099e6d409951d041338c9fd8:docs/TASKS.md
```

Commit `55b3ddfcd93e5e5e099e6d409951d041338c9fd8` contains exactly 171 task entries, all unchecked and Not Started.
All 171 original IDs remain in the current register. This is historical proof of initial non-acceptance; already accepted
work stays Done with its evidence rather than being reset to an artificial initial state.

## Protocol review

| Control | Owning rule / observed outcome | Review result |
| --- | --- | --- |
| Stable IDs and task metadata | TASKS §2 and Plan §3.4; all 171 tasks have source, dependency, deliverable, acceptance and evidence/attachment fields; no renumbering | Passed |
| Seven supported statuses | Not Started, Ready, In Progress, Blocked, In Review, Done, Deferred; each has an explicit record/exit condition in TASKS §2 | Passed |
| Readiness | Ready requires accepted task prerequisites and required external inputs; phase numbering is not a strict serial schedule | Passed |
| Work in progress | Record actual executor, scope and applicable checks; do not infer completion from work starting | Passed |
| Blocker handling | Record failed prerequisite, accountable function, acceptance impact, evidence and next action; safe independent work can continue | Passed |
| Review state | Deliverable/observed checks attached; independent acceptance pending; unchecked status remains accurate | Passed |
| Done and checkbox | Applicable DoD plus actual independent reviewer/date/decision/evidence; x only for Done; accepted task prerequisites already Done | Passed |
| Deferral | Explicit authorized scope/release disposition and impact; no mandatory safety/provider/legal gate waived by a status label | Passed |
| Evidence identity | Exact task/deliverable revision or commit, source, command/procedure, environment/fixture, observed result, artifact, executor/reviewer | Passed |
| Honest result categories | Planned cases are not executed tests; unavailable checks Not Run/Blocked; mock evidence not real provider/DB proof | Passed |
| Atomic register maintenance | Task state, phase/total counts and execution log updated together; record old/new state, reason, evidence, owner/reviewer, next action | Passed |
| Reopening and history | Preserve accepted history; defect/contract change links correction, regression evidence and renewed review before reacceptance | Passed |
| Independent milestone decisions | All eight M1–M8 gates remain Not Accepted; task checkboxes and green CI do not authorize milestones or launch | Passed |
| External gates | Nine EXT IDs preserved; task completion does not imply merchant activation, current legal review or actual operational readiness | Passed |
| Handover | Plan §14 full acceptance still requires FR/NFR, deployed behavior, recovery, ownership and support evidence; no excluded feature added | Passed |

## Accepted task reconciliation

Each previously Done entry has a checked box, actual Project owner acceptance with date, a local evidence artifact and Done
prerequisites. These are accepted task records, not automatic financial/provider/product release acceptance.

| Task | Recorded acceptance | Existing evidence |
| --- | --- | --- |
| `P01-001` | Project owner, 17 October 2026 — “Checklist গ্রহণ করছি”. | [Accepted evidence](./P01-001-baseline.md) |
| `P01-002` | Project owner, 17 October 2026 — “Scope checklist গ্রহণ করছি”. | [Accepted evidence](./P01-002-scope.md) |
| `P01-003` | Project owner, 17 October 2026 — “Traceability register গ্রহণ করছি”. | [Accepted evidence](./P01-003-traceability.md) |
| `P01-004` | Project owner, 17 October 2026 — “NFR/release register গ্রহণ করছি”. | [Accepted evidence](./P01-004-nfr-release.md) |
| `P01-005` | Project owner, 17 October 2026 — “Readiness register গ্রহণ করছি”. | [Accepted evidence](./P01-005-readiness.md) |
| `P01-006` | Project owner, 17 October 2026 — “Gateway/refund assessment গ্রহণ করছি”. | [Accepted evidence](./P01-006-gateway-feasibility.md) |
| `P01-007` | Project owner, 17 October 2026 — “Policy-gate record গ্রহণ করছি”. | [Accepted evidence](./P01-007-policy-gates.md) |
| `P01-008` | Project owner, 17 October 2026 — “Critical-scenario map গ্রহণ করছি”. | [Accepted evidence](./P01-008-critical-scenarios.md) |
| `P01-009` | Project owner, 17 October 2026 — “Workspace foundation গ্রহণ করছি”. | [Accepted evidence](./P01-009-workspace.md) |
| `P01-010` | Project owner, 17 October 2026 — “accha yabar ay task ta done koro”. | [Accepted evidence](./P01-010-ci.md) |
| `P01-011` | Project owner, 17 October 2026 — “Agent-rule review গ্রহণ করছি”. | [Accepted evidence](./P01-011-agent-rules.md) |

## Status and evidence decision examples

These are static protocol walkthroughs, not runtime test runs or additional task acceptances.

| Situation | Required disposition |
| --- | --- |
| Prerequisite still unchecked or external input required for this work missing | Do not declare Ready; record exact pending prerequisite or Blocked impact |
| Document created but not reviewed | Attach artifact and actual static checks; In Review, no x |
| Runtime suite cannot run because replica set/provider is unavailable | Not Run/Blocked with cause; never Passed or feature Done from a mock |
| Reviewer accepts a planning register | Done may cover that planning task; keep actual merchant/legal/production gates separately pending |
| Reviewer accepts implementation after all applicable evidence passes | Record actual reviewer/date/decision and evidence; Done/x, update totals/log |
| Previously accepted behavior regresses | Reopen affected task with reason and prior acceptance preserved; attach fix/retest and independent reacceptance |
| Request to defer required wallet/refund/security evidence for launch | Record block or obtain owning-source scope decision; ordinary Deferred cannot waive mandatory gates |
| All engineering tasks in a gate appear checked | Collect separate authorized milestone decision with environment/artifacts/blockers; no automatic acceptance |

## Transition and evidence record template

Use the task metadata and execution log as the canonical status record; link a detailed run/evidence artifact when necessary.

| Field | Required actual content |
| --- | --- |
| Task / transition | Stable task ID; prior status → new status; reason and date (Asia/Dhaka) |
| Prerequisites / scope | Source references, affected feature, accepted dependencies and relevant external blockers |
| Deliverable identity | Exact file/revision, commit/build or reviewed record; identify local working-tree evidence accurately |
| Verification | Real command/procedure, environment/topology/provider mode, fixture/action, assertions and observed result |
| Evidence | Sanitized actual artifact/run link and defect/retest references; no credentials or customer data |
| Executor / reviewer | Real executor and reviewer; pending review explicitly pending; actual dated decision before Done |
| Disposition | Acceptance, open limitations, scope/deferral authority if applicable and safe next action |
| Register reconciliation | Checkbox, phase/global counts, execution log and separate milestone record where applicable |

Detailed test-run fields remain in Testing §17.2; this template does not replace test procedures or invent infrastructure,
provider evidence, dates, operational contacts, legal sign-off or a fixed retention period.

## Verification record

**Commands:** `npm run lint`, `python3 /tmp/p01-012-verify.py`, `git diff --check`\
**Environment:** Current repository, Git history and local static checks\
**Result:** Passed — 171 initial unchecked/Not Started entries and stable IDs; current task metadata and acyclic dependency
graph; previously accepted task evidence/reviewer/dependency records; seven status rules; phase/global totals; eight unchanged
milestones; nine external IDs; local links/anchors and Markdown structure; prior specifications/evidence/runtime/index preserved.\
**Runtime/provider/deployment tests:** Not Run — task/evidence protocol changes only.

## Acceptance

Accepted by the project owner on 17 October 2026 (Asia/Dhaka): “Task protocol গ্রহণ করছি”.
Independent acceptance is recorded under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); P01-012 is Done.
Acceptance covers the task/status/evidence protocol; no external readiness, feature or milestone acceptance is granted here.
