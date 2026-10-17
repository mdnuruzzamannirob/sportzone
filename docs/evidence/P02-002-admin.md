# P02-002 — React/Vite admin scaffold

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Prerequisite:** P01-009 Done

## Scope and references

Implemented the independently buildable React/Vite administration workspace required by
[Architecture §§2,4,5](../ARCHITECTURE.md) and [P02-002](../TASKS.md#phase-02--uiux-design).
The scaffold includes strict TypeScript, Tailwind, client-side routing, separate public/admin route boundaries and actual
blocking CI checks. Full navigation, design tokens, typography, theme preference and backend authentication retain their
existing task owners. No persistence/API contract changed and no provider, merchant or operational gate was accepted.

Setup references: [Vite JavaScript API](https://vite.dev/guide/api-javascript),
[Vite local preview limitations](https://vite.dev/guide/static-deploy.html),
[React Router declarative routing](https://reactrouter.com/start/declarative/routing) and
[Tailwind Vite integration](https://tailwindcss.com/docs/installation/using-vite).
Exact package versions, engines and required/optional peers were checked against the official npm registry.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Manifest and lockfile | Private ESM workspace, exact dependencies, independent dev/preview/lint/typecheck/unit/build/smoke scripts |
| Vite / TypeScript | Official React and Tailwind plugins, strict bundler-oriented types, SPA mode, fail on occupied configured port |
| Entry document | English language, viewport, noindex/nofollow metadata, client React root |
| `/` and `/login` | Root replaces history with `/login`; explicit unavailable sign-in presentation; no fake login form or success |
| `/app` and nested paths | Dedicated unavailable-access boundary; no management screen mounted and no client flag grants access |
| Unknown public routes | Page-not-found presentation with native sign-in recovery link; route input not echoed |
| Styles | Minimal grayscale system light/dark surfaces, fixed #2563EB focus/brand, visible focus, responsive width/padding and no motion |
| Tests | Four jsdom client routing tests and two HTTP smoke groups against the built app |
| CI | Admin active with lint, typecheck, unit, build and smoke; storefront checks preserved; backend still Not Configured |
| README / Testing / Operations | Verified commands, current tool availability, local-preview limits and static-host fallback requirements |

The unavailable-access boundary is scaffold behavior, not an authentication system. It reads no cookie/local-storage role,
makes no privileged API request and renders no customer/order data. Express must verify sessions and authorize all future
management operations. P02-007 owns complete navigation/protected-layout presentation; Phase 03 owns authentication.

## Toolchain

| Package / runtime | Exact version |
| --- | --- |
| Node / npm | 24.20.0 / 11.19.0 |
| React / React DOM | 19.3.1 / 19.3.1 |
| Vite / React plugin | 8.3.4 / 6.1.2 |
| React Router | 8.4.0 |
| TypeScript | 6.0.3 |
| Tailwind / Vite adapter | 4.3.3 / 4.3.3 |
| Biome / Vitest / jsdom | 2.5.15 / 5.0.5 / 30.1.3 |
| @types/node | 24.19.2 |
| @types/react / @types/react-dom | 19.3.0 / 19.3.0 |

## Verification

Executed from the repository root on the pinned Node/npm toolchain. No deployment, external account or production data
was changed. Build/loopback checks required the execution environment's sandbox permissions.

| Command / check | Result |
| --- | --- |
| Official npm version/engine/peer queries | Passed: compatible exact versions and resolved dependency graph |
| `npm ci --offline --ignore-scripts --no-audit --no-fund --cache /tmp/sportzone-p02-npm-cache` | Passed: clean install, 122 packages from populated cache |
| `npm run lint --workspace=admin` | Passed: Biome, no warnings/errors |
| `npm run typecheck --workspace=admin` | Passed: strict TypeScript |
| `npm run test:unit --workspace=admin` | Passed: 4 actual client routing tests |
| `npm run build --workspace=admin` | Passed independently: typecheck and optimized Vite dist assets |
| `npm run test:smoke --workspace=admin` | Passed: 2 built-app HTTP smoke groups; preview closed afterward |
| `npm run ci` | Passed: 13 configured commands across root, storefront and admin; backend explicitly Not Configured |
| `npm run lint`, `python3 /tmp/p02-002-verify.py`, `git diff --check` | Passed: repository links/structure, task/dependency totals, lock/config consistency and unrelated-file/index preservation |

| Evidence key | Executed assertions |
| --- | --- |
| AD-01 | Root redirects to login, one main, explicit unavailable sign-in, no fake form |
| AD-02 | Nested management URL remains unavailable despite forged local role/authenticated flags; no order-ID echo |
| AD-03 | Native link changes browser-history URL and rendered route; dispatched history event restores unavailable boundary |
| AD-04 | Unknown public path renders recovery link without echoing path |
| ADMIN-SMOKE-01 | `/`, `/login`, `/app`, nested order URL and unknown URL serve the same SPA entry, no-store/noindex headers and robots metadata |
| ADMIN-SMOKE-02 | Built JS/CSS return 200, nonempty bodies and compiled Tailwind dvh utility |

DOM routing runs in jsdom and is distinct from real-browser E2E verification. HTTP smoke verifies SPA document fallback
and assets; it does not execute client JavaScript. Local Vite preview is not a production server. Production static hosting
still requires SPA fallback, correct asset/API routing and noindex/private document headers verified at deployment.

## Review and acceptance

Static/component review covers native links, landmarks, readable grayscale light/dark values, responsive max-width/padding,
visible keyboard focus and no animation. Real-browser keyboard/viewport/theme visual checks: **Not Run**; the available UI
surface inventory returned no browsers. Backend/session authorization and production hosting: **Not Run**, outside this slice.
No FR, provider, WCAG or milestone acceptance is inferred from scaffold tests.

The project owner accepted this scaffold on 17 October 2026: “Admin scaffold গ্রহণ করছি”. P02-002 is Done under
[TASKS §2](../TASKS.md#2-task-management-conventions) and [AGENTS §13](../../AGENTS.md#13-task-completion--reporting).
This acceptance covers the scaffold evidence and its stated verification limits; milestone gates remain unchanged.
