# P02-010 — Reusable admin visual primitives

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Admin primitives গ্রহণ করছি”

## Scope and sources

- [Task register](../TASKS.md#phase-02--uiux-design): P02-010; P02-007 and P02-008 independently accepted.
- [Design](../DESIGN.md): §§4, 6, 8.4 and 9 — local table overflow, status/filter/actions, confirmation and upload feedback.
- [API](../API.md): §7 pagination and §16.2 media contract; the owning features retain DTOs, request security and upload lifecycle.
- [Usage guide](../UI_COMPONENTS.md#admin-management-compositions): props, state ownership, exact upload constraints and backend boundaries.

No business/API/database contract or dependency changed. Components are not integrated authenticated pages. No live table data, upload request, authorization, inventory mutation or financial action is simulated as implemented.

## Delivered behavior

| Component | Behavior |
| --- | --- |
| DataTable | HeroUI headers/row identity, controlled sort, unchanged server row order, arrow-key cell navigation, labelled focusable local overflow region, retained/loading/error/empty/retry states |
| FilterToolbar | Caller-owned search draft/optional filter controls, explicit apply/clear, pending guards |
| ListPagination | HeroUI previous/next and textual metadata; positive integer page and nonnegative snapshot counts; no invented page totals |
| FileUpload | HeroUI input; explicit MIME/byte constraints, linked errors, selected file retained on failure, JPEG/PNG/WebP preview, object-URL cleanup, bounded/indeterminate progress, removal/retry guards |
| GuardedAction | Descriptive confirmation and caller context, optional required reason, live eligibility/pending guards, rejection retention, Escape/cancel/focus restoration, caller-controlled closure, no optimistic status success |

The feature supplies real PageMeta, upload policy, authoritative eligibility and operation state. Backend checks remain required. A file selection is not an upload receipt; a confirmation callback is not a successful mutation. No fake routes, public admin bypass or extra CI command was added.

## Verification

Environment: Node 24.20.0 / npm 11.19.0, React/Vitest/jsdom. Ten new cases per explicit theme, 20 total.

| Check | Observed result |
| --- | --- |
| Focused management suite | Passed; 20 tests, both explicit themes |
| Admin lint | Passed; 28 files |
| `npm run ci` | Passed; all 13 commands, 223 tests (12 tooling, 114 storefront, 97 admin), both production builds and six HTTP smoke groups |
| CI report | `test-results/ci.json` (generated, Git-ignored); 2026-10-18T11:29:12.712Z to 2026-10-18T11:30:01.497Z; result Passed |
| Browser viewport/zoom, native Tab/file picker and visual review | Not Run; computer-use inventory returned no enabled apps or browsers |

Keyboard DOM cases exercise Enter sort, ArrowDown cell navigation, Escape and trigger focus restoration. Test focus synchronization waits for actual dialog focus before dispatching Escape; no focus assertion is skipped. CSS containment assertions do not prove real browser reflow. Backend/API, upload scanning/provider delivery and real financial/authorization effects are outside this presentation task.

## Review boundary

The project owner independently accepted this task on 18 October 2026 under Tasks §2 and AGENTS §13. M1–M8 remain unaccepted. P02-011 retains foundation responsive/accessibility verification; this task does not claim a complete WCAG audit or production readiness.

## Component references

- [HeroUI Table](https://heroui.com/en/docs/react/components/table)
- [HeroUI Pagination](https://heroui.com/en/docs/react/components/pagination)
- Installed HeroUI 3.2.6 declarations and existing app-owned form/dialog components.
