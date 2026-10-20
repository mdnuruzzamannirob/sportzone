# P02-012 — Storefront routes, layouts and feature placement

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** Done; independently accepted by the project owner on 20 October 2026

## Scope and dependencies

The owner requested the next task after discussing the two remaining Phase 02 tasks. This slice is P02-012, whose declared prerequisites P01-015 and P02-011 are accepted. Implementation Plan §3.6 allows the frontend refactors independently after documentation acceptance; its general backend-first priority remains the default outside this requested Phase 02 slice. P03-019/P03-020 are not accepted by this work.

Architecture §§4–5, Design, and Testing §§14,15.5 govern the move. API §§3,5 private-cache rules and Database §2 backend ownership remain unchanged. No API, schema, dependency, environment, migration or business-policy change is required. Existing foundation acceptance remains historical evidence.

## Current-to-target mapping

| Previous path | Current responsibility |
| --- | --- |
| `storefront/src/app/(public)/` | `storefront/src/app/(store)/`; same URLs, metadata, static destinations and loading/error/404 boundaries |
| `storefront/src/app/(private)/account/page.tsx` | Thin route in `(account)/account/page.tsx`; account-only view in `features/account/components/account-page.tsx` |
| `storefront/src/app/(private)/layout.tsx` | `(account)/account/layout.tsx`; same force-dynamic, force-no-store, noindex and separate landmark |
| Home route markup | `features/home/components/home-page.tsx`, composed by the store home route |
| Root shell/header/network/appearance components | `components/layout/` |
| Root page panel/loading/missing states/theme preference | `components/ui/` |

Reusable commerce components and pure root shared utilities retain their existing ownership. The finite catch-all destination scaffold is retained until actual feature implementation replaces it; unimplemented feature folders, auth routes, providers and API clients are not created. Folder names do not grant authenticated access. Account access and all other unavailable destinations retain their honest placeholder text. The existing public placeholders contain no session/cart data.

All import consumers and test paths moved together. Existing Vitest globs and CI inventory still discover the same workspace checks; no runner or check name changed. Added production smoke negatives for both new group names and unknown account/product deep links. Browser parity cases exercise production home, products, cart, wishlist, policy, account and missing routes.

## Verification

Local Linux, Node v24.20.0, npm 11.19.0; production storefront build with synthetic browser contexts, no backend/provider calls.

Revision: working-tree P02-012 changes over `8752994`; no commit, push, deployment or hosted run performed for this slice.

| Command / procedure | Observed result |
| --- | --- |
| `npm run lint --workspace storefront` | Passed; 46 files |
| `npm run typecheck --workspace storefront` | Passed after removing stale generated `.next/types` and `.next/dev/types` from old route groups; no source/type relaxation |
| `npm run test:unit --workspace storefront` | Passed; 7 files, 114 tests, including layouts, shell states, themes, forms and commerce |
| `npm run build --workspace storefront` | Passed; 14 generated static pages, `/account` remains dynamic |
| `npm run test:smoke --workspace storefront` | Passed; four smoke groups, 11 unavailable destination URLs, two synthetic account cookie contexts, private/no-store/noindex headers, CSS/fonts/theme bootstrap and seven negative routes |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-ci-browser-vq3gIQ/webkit.sh npm run test:ui -- --grep 'storefront refactor'` | Passed; 18 cases, zero skipped/flaky/failed, 79.3 seconds |
| `node node_modules/typescript/bin/tsc --project tests/ui/tsconfig.json` | Passed; browser fixture/config/spec types |
| `npm run lint:boundaries` | Passed; 98 source files, zero errors |
| `npm run format:check` | Passed; existing four-file baseline |
| `npm run lint` and `git diff --check` | Passed; documentation links/repository checks and whitespace review |

Browser run: 20 October 2026, 17:53:50–17:55:09 Asia/Dhaka. Chromium, Firefox and WebKit × light/dark × 320/768/1440 px. Each case traverses seven production pages, checks one main landmark, stored theme persistence and reflow, and performs six axe scans with WCAG 2/2.1/2.2 A/AA tags (108 scans, zero violations). Keyboard checks cover skip-to-main, mobile disclosure open/Escape/focus recovery and recovery link navigation. Account cache headers and unavailable text are checked directly.

The first build attempts failed because sandboxed Node child-process execution returned `EPERM`, producing empty TypeScript `--showConfig` output. Repeating the actual unchanged build with reviewed local execution permissions passed; no dependency patch or disabled check. Production-server/browser commands also ran with reviewed local execution permissions. WebKit reused the previously provisioned host wrapper; no new browser libraries were installed.

Artifacts: `test-results/ui-report.json` and its screenshot attachments (Git-ignored local artifacts). Executor inspected Chromium product/account screenshots at light 1440px and dark 320px: typography, card bounds, spacing, navigation and footer show no clipping or overflow. These are executor visual checks, not independent owner acceptance.

Not Run: full repository CI, unchanged admin/backend suites, hosted CI, physical devices and screen readers. Checks were selected under Testing §15.5 for a storefront-only source move; business/provider and release acceptance remain with their owning tasks.

## Review and recovery

Independent owner review was completed through the review popup; the owner accepted P02-012. Milestone acceptance remains separate. Recovery is the prior compatible storefront build/source revision; no data migration or external-effect reconciliation is needed. Hosted CI, real devices and screen-reader acceptance are not claimed by local checks.

## Owner acceptance

On 20 October 2026, the project owner responded to the P02-012 review/acceptance popup: “Review করেছি—accept করছি, Done করো”. This explicitly confirms review and accepts the submitted implementation and verification evidence. Recorded In Review → Done, checked the task checkbox, and synchronized Phase 02/overall totals. No additional application changes or test execution were needed for this documentation-only acceptance update. P02-013 and all milestone gates retain their previous statuses.
