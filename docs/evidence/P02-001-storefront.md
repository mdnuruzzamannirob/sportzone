# P02-001 — Next.js storefront scaffold

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Prerequisite:** P01-009 Done\
**Verification:** Passed — independent production build, local CI and route smoke checks

## Scope and references

Implemented [Architecture §§2,4,5](../ARCHITECTURE.md) and the Phase 02 foundation in
[Implementation Plan §6](../IMPLEMENTATION_PLAN.md#6-phase-by-phase-implementation).
The scaffold establishes App Router, React, strict TypeScript, Tailwind, independent scripts and public/private layouts.
It provides a prelaunch home and unavailable-account placeholder, not completed catalog/account/checkout functionality.
Express remains the sole future business/authentication authority; no backend model/service or provider credential enters
this frontend. Full tokens, typography, theme preference and navigation remain assigned to later Phase 02 tasks.

Sources used for setup: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation),
[route segment configuration](https://nextjs.org/docs/app/api-reference/file-conventions/route-segment-config) and
[Tailwind Next.js integration](https://tailwindcss.com/docs/installation/framework-guides/nextjs).
Exact versions/engine/peer metadata were queried from the official npm registry before installation and locked.

## Delivered files and boundaries

| Area | Delivered behavior |
| --- | --- |
| `storefront/package.json`, root lockfile | Exact dependency versions; independent dev/start/lint/typecheck/unit/build/smoke scripts |
| `storefront/tsconfig.json`, Next config | Strict application types, Next route type generation, alias and framework config; powered-by header disabled |
| PostCSS/Tailwind and global CSS | Compiled Tailwind utilities; minimal grayscale light/dark system styling, fixed brand blue, visible focus and no network font dependency |
| `src/app/layout.tsx` | Root document language, metadata and stylesheet |
| `src/app/(public)/layout.tsx`, `page.tsx` | Static public home, semantic header/main/footer, home link and focusable skip target |
| `src/app/(private)/layout.tsx`, `account/page.tsx` | Dynamic/no-store private presentation group, noindex metadata and explicit account cache/robots headers; no customer data or fictitious auth success |
| `storefront/biome.json`, Vitest config | Supported lint tool and actual component test discovery; warning/failure exit is blocking |
| `storefront/tests/layouts.test.tsx` | Two server-rendered component regressions for public skip/landmarks/home link and separate private content shell |
| `storefront/tests/smoke.mjs` | Real production HTTP/CSS/cache/indexing/404 tests on a temporary loopback server with cleanup |
| `ci-workspaces.json` | Storefront active with lint, typecheck, unit, build and smoke; admin/backend remain manifest-only |
| `.gitignore` | Generated next-env.d.ts ignored alongside existing .next/node_modules/output rules |
| README, Testing, Operations | Actual setup/start/build/check commands and current tooling states updated |

No new API route, authentication proxy, session implementation, database model, payment/coupon logic or extra service was
added. A private route group/cache policy does not authorize access: Phase 03 must enforce server-side sessions/ownership
through Express before account data/actions exist. The placeholder discloses no account records.

## Verified toolchain

| Package / tool | Exact version |
| --- | --- |
| Node / npm | v24.20.0 / 11.19.0 |
| Next.js | 16.4.2 |
| React / React DOM | 19.3.1 / 19.3.1 |
| TypeScript | 6.0.3 |
| Tailwind / PostCSS adapter | 4.3.3 / 4.3.3 |
| PostCSS | 8.5.23 |
| Biome | 2.5.15 |
| Vitest | 5.0.5 |
| @types/node | 24.19.2 |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 |

Biome avoids retaining an unsupported ESLint peer chain. Next.js explicitly supports either lint integration.
Development/production builds use Next's supported `--webpack` option; no compiler/type/lint validation is disabled.
Turbopack's local IPC bind was restricted in the execution environment; Webpack production compilation and all route
checks were verified. Build and loopback-server checks ran with the required sandbox permissions.

## Commands and observed results

All commands run from the repository root; no live service, production record, third-party account or deployment was changed.

| Command / procedure | Observed result |
| --- | --- |
| Official `npm view` version/engine/peer checks | Passed: selected exact compatible releases; installed dependency graph resolves |
| `npm ci --offline --ignore-scripts --no-audit --no-fund --cache /tmp/sportzone-p02-npm-cache` | Passed: clean locked install from populated local cache; no dependency-free/offline-without-cache claim |
| `npm run lint --workspace=storefront` | Passed: Biome, no warnings/errors |
| `npm run typecheck --workspace=storefront` | Passed: Next route type generation plus strict TypeScript |
| `npm run test:unit --workspace=storefront` | Passed: 2 layout-rendering test functions |
| `npm run build --workspace=storefront` | Passed independently: optimized production output and route classification |
| `npm run test:smoke --workspace=storefront` | Passed: 3 production smoke groups below; temporary server stopped |
| `npm run ci` | Passed: root tooling checks/12 regressions plus all 5 storefront checks; admin/backend explicitly Not Configured |
| `npm run lint`, `python3 /tmp/p02-001-verify.py`, `git diff --check` | Passed: documents, dependency/task state, layout/config contract and source/index preservation |

Production route output:

```text
○ /              static public content
○ /_not-found    framework not-found route
ƒ /account       dynamic server-rendered content
```

| Executed evidence key | Actual assertions |
| --- | --- |
| SF-01 | Public children rendered once in main; home link and skip link target present/focusable |
| SF-02 | Private children rendered in a distinct main without the public header/footer shell |
| SMOKE-01 | Public route 200; expected heading/main; compiled stylesheet fetched 200 with Tailwind dvh output; no x-powered-by |
| SMOKE-02 | Account route 200 for two synthetic cookie contexts; private/no-store Cache-Control; noindex header/meta; no request-cookie echo |
| SMOKE-03 | Unknown route and both encoded internal route-group names return 404 |

These are scaffold assertions. The synthetic-cookie check does not claim authenticated customer isolation. No existing
FR acceptance/OPV/provider/milestone row was marked Passed from these results.

## UI and environment review

Static/component review confirms native keyboard links, skip target, landmarks/headings, focus outline, responsive utility
classes, no motion, grayscale surfaces and consistent #2563EB brand in system light/dark styles. The minimal scaffold has
no form, mutation or theme selector. Full theme/typography/responsive/accessibility interaction work follows P02-003–P02-011.
Interactive browser/manual viewport checks were Not Run: no connected browser was available in this session. HTTP smoke
and server-rendered component tests are recorded separately, without claiming full browser or WCAG acceptance.

## Acceptance

Submitted under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). The project owner accepted the built scaffold and
route-boundary evidence on 17 October 2026: “Storefront scaffold গ্রহণ করছি”. P02-001 is Done.
Customer authentication, full storefront/UI and milestone acceptance remain assigned to their own tasks and evidence.
