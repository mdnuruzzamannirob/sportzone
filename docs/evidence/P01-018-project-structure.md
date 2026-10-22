# P01-018 — Project structure documentation reconciliation

Date: 22 October 2026 (Asia/Dhaka). Executor: Codex. Status: Done.
Decision owner: project owner; approved adopting the final proposed design into documentation.
Independent documentation acceptance: project owner, 22 October 2026, explicit popup reply. No application refactor/milestone acceptance claimed.

## Delivered

- PROJECT_STRUCTURE is the detailed canonical companion delegated by Architecture §§4–6. It records
  full workspace/backend/frontend targets, domain ownership, entry-point responsibilities, cohesive
  modules, naming, provider/jobs/scripts boundaries, test organization and ongoing review obligations.
- Architecture replaces the previous target, retains historical implemented-path references and
  preserves modular monolith, native HeroUI, API/data/security/financial/operational constraints.
- The selected account annotation is explicit: (account)/account/ is two physical levels;
  (account) contributes no URL segment. Existing account/order/address/return/settings, guest,
  payment-return and verification URLs must be inventoried and preserved, not inferred or renamed.
- API/Database preserve canonical routes/DTOs/collections/indexes and narrow shared-collection
  capabilities while documenting target grouping. Design preserves UI/theme/accessibility rules;
  Testing/Operations distinguish planned moves/checks from implemented runners/operator entry points.
- AGENTS requires future work to identify target owner/path, follow naming and import direction,
  preserve current user edits, migrate test/tool/CI consumers together and add negative automated
  boundary fixtures in the owning application refactor. README points to the same canonical target.
- Plan/TASKS add P01-018 (documentation review), P03-021 (backend), P02-015 (storefront), P02-016
  (admin). Application tasks remain Not Started, sequential and independently accepted. Stable
  previous IDs/history and P04-003 EXT-04 blocker are retained. Total 183: 53 Done, 128 Not Started,
  1 Blocked, 1 In Review. Root specification filenames remain uppercase to preserve existing links;
  existing pure shared utilities and reusable UI remain until verified consumer migration.

## Verification

Change type: Markdown documentation/agent instructions only. Existing staged source/media/product
changes were preserved; this task did not move or edit application code, tools, dependencies or
configuration. No source file, migration or provider activity was executed for the new structure.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed: repository/Markdown/local links |
| `git diff --check` | Passed |
| Task ID/status count audit | Passed: 183 unique task entries; phase totals/statuses match dashboard |
| Cross-document review | Target versus current paths, ownership, account group/URLs, task dependencies, agent rules and release gates reconciled |
| Application tests/builds/browser/provider checks | Not Run: no application source change for this documentation task |

Executable boundary extensions, script/path/test discovery changes and actual behavior/visual parity
are required deliverables of P03-021/P02-015/P02-016; they are not claimed implemented by editing docs.
Existing boundary tooling remains in effect. Future reviewers must check conformance before task
acceptance, and exceptions require an explicit architecture decision with affected verification.

## Next action and recovery

Submit this documentation revision for independent owner review. After acceptance, start P03-021
with an actual current→target inventory; finish/review backend before storefront, then admin. Do not
mass-scaffold unimplemented modules or rename public/data contracts to match folder names. Source
refactoring does not clear real provider/scanner policy evidence or production/legal gates.

Recovery is a reviewable documentation reversal with task reconciliation; no runtime/data rollback
is needed. Existing staged application changes and their prior evidence remain owned by their tasks.


## Owner acceptance

Reviewer: project owner. Date: 22 October 2026 (Asia/Dhaka).
Decision: “Docs review করেছি—accept করছি, Done করো” through the documentation-review popup.
P01-018 transitions In Review → Done; the task checkbox and dashboard are updated. This accepts
the documentation/conventions, not application source migration, automated boundary extensions or
provider/milestone readiness. P03-021/P02-015/P02-016 remain Not Started in the agreed order.
Acceptance update checks: `npm run lint` and `git diff --check` passed. No application tests rerun
because this acceptance update changes documentation only. Earlier verification counts above are
historical at submission; current totals are 183 tasks: 54 Done, 128 Not Started, 1 Blocked.
