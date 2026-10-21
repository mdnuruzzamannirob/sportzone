# P02-007 — Admin navigation and protected-layout presentation

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 18 October 2026: “Admin shell গ্রহণ করছি”

## Scope and authority

- [Task](../TASKS.md#phase-02--uiux-design): P02-007; dependencies P02-002 and P02-005 are accepted.
- [Design §§3–5](../DESIGN.md#3-responsive-design): desktop sidebar, dismissible mobile drawer, shared page context/actions and grouped destinations.
- [Design §12](../DESIGN.md#12-accessibility): landmarks, keyboard/focus and responsive behavior.
- [Implementation Plan Phase 02](../IMPLEMENTATION_PLAN.md#phase-02--uiux-design): presentation foundations without claiming later features are implemented.
- [API](../API.md): administrator session and authorization contracts remain backend-owned. No API/data contract changed or backend call was added.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Navigation | One configuration supplies five groups and 14 destinations from Design §5.2; longest section match handles nested settings/details without reflecting IDs or query strings |
| Desktop | Persistent sidebar from 1024px, neutral selected surface with blue border and visible current-section semantics |
| Smaller screens | HeroUI left Drawer with labelled dialog, shared navigation, Close/Escape dismissal, focus containment/restoration and scrollable body with vertical touch panning |
| Route/breakpoint changes | Navigation closes the Drawer; desktop transition closes it and moves focus to a visible header link after overlay restoration; a closed Drawer never steals form focus on resize |
| Loading | Lazy-loaded admin boundary with a polite loading fallback; sign-in does not eagerly load the complete shell |
| Page shell | One main landmark and focusable skip target; reusable title, contextual action region and safe breadcrumb context |
| Appearance | HeroUI disclosure/select in the shell; public login/recovery presentation retains Appearance; theme changes preserve drafts and URL |
| Connection | Polite offline Alert, cleared on reconnection, with subscription cleanup |
| Access boundary | Every `/app/*` route renders only public navigation metadata and unavailable-access content. Forged local flags never mount management screens; no administrator identity, metrics or functioning logout is invented |

Production routes do not expose a preview flag, synthetic authenticated session or mock data. The reusable shell/action/draft preview exists only in component tests. Authentication, expired-session handling and backend permission verification remain owned by Phase 03; this task does not implement them.

## Verification

Environment: Node 24.20.0, npm 11.19.0, local worktree. DOM fixtures contain synthetic identifiers only.

| Check | Observed result |
| --- | --- |
| `npm run test:unit --workspace admin` | Passed; 47 tests, including seven admin-shell cases |
| `npm run ci` | Passed; all 13 commands, 103 tests (12 tooling + 44 storefront + 47 admin), both builds and six HTTP smoke groups |
| `git diff --check` and repository/source consistency audit | Passed; source/index preservation and task totals checked separately |
| Browser visual/native Tab/zoom/touch review | Not Run; computer-use inventory returned no enabled apps or browsers |

The seven shell cases cover group/destination completeness and access denial; real HeroUI modal containment, Escape and focus return; navigation/desktop/explicit close dismissal; longest-match and unknown-route privacy; title/action and draft/theme preservation; and offline cleanup. Existing tests cover entry redirect, forged flags, history recovery and unknown public routes. HTTP smoke coverage includes 20 SPA paths and built assets; it does not execute browser JavaScript or establish production hosting readiness.

The project owner explicitly accepted this task after reviewing the reported scope and verification limitations. Browser checks remain Not Run; no milestone acceptance is inferred.

## Implementation references

- [Admin shell](../../admin/src/components/layout/admin-shell.tsx)
- [Navigation configuration](../../admin/src/components/layout/navigation.ts)
- [Route access boundary](../../admin/src/features/auth/components/admin-access-boundary.tsx)
- [Shell interaction tests](../../admin/tests/shell.test.tsx)
- [HeroUI Drawer reference](https://heroui.com/en/docs/react/components/drawer)

## Revision evidence

Local CI started at `2026-10-18T10:24:36.376Z`; report: `test-results/ci.json` (local ignored artifact). Working tree contains unreleased changes. The final admin build emits a separate boundary chunk and no oversized-chunk warning.

| Source | SHA-256 |
| --- | --- |
| `admin/src/components/admin/admin-shell.tsx` | `4d805c2804595fec1be55a85e7ba535969b9d65a61a755e81b00f86b50ea97b9` |
| `admin/src/components/admin/navigation.ts` | `c3ce278867fe98fcb4e0e0504f51543a6ecaea2d00522d2cd582fb0028ed8d29` |
| `admin/src/components/admin/admin-access-boundary.tsx` | `78a899f59204144195f9047aa66690ae386b656d3743dcbbdf6bd11462ddda1d` |
| `admin/tests/shell.test.tsx` | `52b063ec5518ece2a838a3a528143febaabd0dbb55c52c5bc2ffab13c36a583f` |

**P02-013 path maintenance (20 October 2026):** Source links above follow the current refactored locations. Historical acceptance and file hashes retain their original revision/path meaning; current parity evidence is in [P02-013](./P02-013-admin-refactor.md).
