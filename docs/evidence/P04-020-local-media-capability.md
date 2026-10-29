# P04-020 — Local media capability and backend queue

**Date:** 25 October 2026
**Executor:** Codex
**Status:** Done; accepted by project owner on 25 October 2026
**Revision:** `93dbbe936ec0ce6cd98b8f3bb6cf788cf680a585` for verified application code; documentation changes in this working tree.

## Authorized split and ownership

The owner instructed: “Local backend কাজ আলাদা করে queue ঠিক করো”. This authorizes the work-package
split, not acceptance of provider/staging gates or automatic acceptance of this local verification task.

Sources: [Plan §3.1](../IMPLEMENTATION_PLAN.md#31-delivery-model), [Tasks](../TASKS.md), FR-05/FR-23,
[API §16.2](../API.md), [Database §6.7](../DATABASE.md) and Architecture §§4–6/11.
The accepted product/API/data/security contracts are unchanged. Existing media implementation and
historical verification remain in [P04-003 evidence](./P04-003-controlled-media.md).

| Work package | Scope and scheduling role |
| --- | --- |
| P04-020 | Local ledger/service/protocol/HTTP and default-deny composition verification. Requires accepted P01-024/P03-013 and independent acceptance. |
| P04-003 | Complete original media outcome, including real Cloudinary account, scanner deployment, approved policy and actual upload/private-delivery/deletion evidence. Still Blocked (EXT-04); now depends on the local prerequisite. |
| P04-016 / P09-013 | Technical category/settings prerequisites use P04-020 instead of requiring live provider acceptance before implementation. They still validate media references and deny unavailable capabilities. |
| P04-017 | Remains dependent on P04-016. Full product/variant management has not been implemented or accepted by this change. |
| P03-022 / P04-015 | Explicitly require P04-003; backend closeout still requires P09-011. No provider, staging, application-stage or product gate is removed. |

After P04-020 acceptance, P04-016 and P09-013 become eligible. Recommended implementation order:
category API → product/variant API, then settings → delivery → checkout under their existing dependencies.
This is an available dependency path, not approval to run a task before all of its prerequisites are accepted.
No Admin/Storefront stage is started and P09-011 is not marked complete by local media tests.

Plan §3.1 owns the reusable local-versus-external split; Tasks owns IDs, dependencies, status, counts,
traceability and the owner decision. P04-003's evidence retains its historic results and current external
blocker with a link to this verification. Changelog records the scheduling correction. No application,
provider, runtime configuration, schema, HTTP contract, dependency manifest or CI behavior was changed.

## Current local capability review

Reviewed the current media-owned service/context/upload/access/attachment/cleanup boundaries, canonical
persistence, Cloudinary and ClamAV protocol adapters, auth-owned admin access and explicit root composition.
The verified behavior includes:

- Strict upload-intent/ownership ledger and indexes; file signatures/dimensions/size/type bounds before upload.
- Current admin authorization, role/origin/CSRF, bounded multipart admission and dedicated media quota.
- Quarantine and unknown provider/scanner outcomes; no blind retry that invents success.
- Transactional attach/detach and target rollback; private owner/order/item access and fail-closed guest scope.
- Attach/delete races, guarded retention/holds, bounded orphan cleanup and deletion reconciliation.
- External effects rejected inside database transactions; bounded Cloudinary HTTP/ClamAV TCP protocol handling.
- Default-disabled ordinary startup; explicit injected provider/scanner/policy and verified persistence are
  required for test composition. Current order/claim/guest integration remains its owning feature work.

Provider transport and scanner replies are explicit local doubles/protocol fixtures. The integration uses
real isolated MongoDB, BSON/index enforcement, sessions, HTTP, transaction rollback and races. Synthetic
order/target fixtures and scoped guest proof establish only the local capability contract. They do not
prove production purchase/evidence authorization or operator/legal policy approval.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0; isolated MongoDB 8.0.16 replica sets with generated database/URI;
synthetic media/users/order targets only. No external application database or merchant/provider account used.
Local listeners require execution outside the restrictive sandbox; no remote source push/deployment occurred.

| Command | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/media.test.ts tests/unit/composition.test.ts` | Passed; 10 cases |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run test:integration --workspace=backend -- tests/integration/media.test.ts tests/integration/composition.test.ts` | Passed; 19 media + 5 composition = 24 cases, including actual opt-in media composition/default-disabled admission |
| `npm run test:contract --workspace=backend` | Passed; four artifacts fresh, all 60 cases |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed; 211 files |
| `npm run lint:boundaries` | Passed; 241 files, zero errors |
| `npm run build --workspace=backend` | Passed |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, protected readiness, redacted invalid configuration and graceful shutdown |
| Task dependency/count audit | Passed; 210 unique IDs, 77 Done records preserved, no missing dependency/cycle/reverse-stage prerequisite; external gates retained |
| `npm run lint` and `git diff --check` | Passed after adding the new evidence file; no documentation/link or whitespace errors |

The dependency audit also confirms P04-016/P09-013 have only P04-020 left before eligibility, while
P03-022 still requires both blocked external tasks. The prior Phase 09 wording was corrected to distinguish
isolated backend staging (P09-011) from the later integrated deployment (P09-012).

The complete fresh integration report is retained at `test-results/P04-020/local-integration.json` (ignored
local artifact). No application fix was required and no cases were skipped/waived in the selected suites.
P04-003's historical test counts/paths are not represented as new results; the commands above use current
paths and observed output. No full cross-project, frontend, UI/browser or repeated architecture research
was needed for this local verification and approved planning correction.

## Recovery and independent review

P04-003 remains Blocked for EXT-04; P09-011 remains Blocked for staging resources/Docker access. Neither
external task, nor M1–M8, receives acceptance here. Real Cloudinary original/derived privacy, maintained
scanner security, approved retention/legal-hold policy, deployed credentials and staging transactions remain
**Not Run / Blocked** under their owning gates. No configured production media provider is enabled.

Recovery is documentation-only: restore the prior scheduling dependencies together if this split is rejected;
retain historical evidence/statuses and all ledger/reference data. No migration or external effect exists
to reverse. Downstream tasks stay unaccepted until their prerequisites and own checks pass.

Independent project-owner review accepted this local verification and queue on 25 October 2026:
“Local verification ও queue গ্রহণ করছি—Done করো”. P04-020 is Done under
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). P04-016/P09-013 are Ready after prerequisite
checks; their implementation/acceptance and all external gates remain separate. Historical verification
and dependency-audit counts above describe the pre-acceptance revision.
