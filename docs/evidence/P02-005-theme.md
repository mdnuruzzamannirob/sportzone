# P02-005 — Light / Dark / System preference

**Reviewed:** 18 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Prerequisite:** P02-003 Done

## Implementation

Implemented the appearance behavior in [Design §2.2](../DESIGN.md#22-light-and-dark-color-system).
Both applications expose a native labelled Appearance select with Light, Dark and System options on every route.
Their small controls are app-owned; [shared theme state](../../shared/theme.ts) contains only UI preference handling.
No session, account setting, API, payment or backend authority was added.

| Area | Behavior |
| --- | --- |
| Initial appearance | Identical classic `/theme-bootstrap.js` scripts in each document head read the browser preference before body parsing; no async/defer/module flag |
| Explicit selection | Root data-theme light/dark selects the existing palette; brand/on-brand values are unchanged |
| System selection | Removes forced data-theme so existing prefers-color-scheme CSS follows current OS settings and subsequent OS changes |
| Persistence | localStorage key sportzone.theme stores light/dark/system per origin; only validated values are accepted |
| Storage failure | Bootstrap falls back to CSS System; interactive selection still applies in memory if storage access/write fails |
| Synchronization | Same-window notifications update controls; same-origin localStorage changes/clear synchronize tabs; unrelated/sessionStorage events are ignored |
| State preservation | Only root appearance attributes/control state change; route subtree is not keyed/replaced and theme logic never reloads/navigates |
| Hydration | Control renders a stable System server default, then reads applied preference; only html root attributes have targeted hydration-warning suppression because bootstrap intentionally changes them |
| Accessibility | Native labelled select, visible existing focus, semantic surface/text/border colors and 44px minimum control height |
| Reduced motion | Shared reduce media rule shortens animations/transitions, limits animation iterations and disables smooth scrolling |
| Verification setup | Storefront now explicitly declares the same exact jsdom 30.1.3 dev dependency already used by admin; lockfile updated without changing versions |

Storage is origin-scoped: separate storefront/admin origins keep independent preferences; no cross-origin storage bridge or
backend account preference is implied. Bootstrap source is fixed application code, not generated from user input.
It is served from each app's own public assets. No inline script/CSP exception or external theme library was introduced.

Implementation references: [Next.js hydration behavior](https://nextjs.org/docs/messages/react-hydration-error),
[Web Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API) and
[prefers-reduced-motion](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/prefers-reduced-motion).

## Verification

Environment: Node 24.20.0 / npm 11.19.0. Builds/loopback checks used the execution environment's required permissions.
No deployment, third-party account, production data or milestone approval changed.

| Command / procedure | Result |
| --- | --- |
| `npm ci --offline --ignore-scripts --no-audit --no-fund --cache /tmp/sportzone-p02-npm-cache` | Failed: existing xmlchars package was absent from local cache; not a code/lock mismatch |
| `npm ci --ignore-scripts --no-audit --no-fund --cache /tmp/sportzone-p02-npm-cache` | Passed: clean locked install, 122 packages |
| `npm run ci` | Passed: all 13 configured commands; 12 root, 37 storefront and 39 admin tests; both typechecks/builds and 5 HTTP smoke groups |
| `npm run test:unit --workspace=storefront`, `npm run test:unit --workspace=admin` | Passed: 12 interactive/bootstrap theme cases per app, plus previous suites |
| Both workspace `test:smoke` commands | Passed: actual served head script is blocking/classic and source matches checked-in asset; prior route/cache/font checks preserved |
| Shared TypeScript/TSX Biome check | Passed: theme state and shared interaction suite |
| `npm run lint`, `python3 /tmp/p02-005-verify.py`, `git diff --check` | Passed: references/structure, task/dependency totals, lock/bootstraps and unaffected source/index preservation |
| Browser first-paint filmstrip, real keyboard/OS switching and reduced-motion visual checks | Not Run: UI inventory returned no connected browsers |

| Theme test key | Executed checks |
| --- | --- |
| THEME-01 (2 cases) | Persisted light and dark bootstrap applies before any React child mounts |
| THEME-02 (3 cases) | Missing, System and corrupt values leave CSS media fallback unforced |
| THEME-03 | Label association/options; change through all modes; persistence; edited draft, input node identity and pathname/query preserved |
| THEME-04 | Persisted selection restores on control remount |
| THEME-05 | Blocked getItem/setItem retains working in-memory Dark selection |
| THEME-06 | Cross-tab changes update control, unrelated/session storage is ignored and clear returns System |
| THEME-07 | Subscriptions clean up and invalid JavaScript input is rejected |
| THEME-08 | Existing media-driven System selector and reduced-motion contracts remain present |
| THEME-09 | Server-rendered control hydrates without recoverable errors or resetting bootstrap Dark |

Interactive assertions run in jsdom with real React DOM events/hydration. They do not measure browser paint, CSS media
rendering or native keyboard behavior. HTTP checks verify the production documents and bootstrap delivery/order.
Before-body application is established by that blocking-script structure and executed bootstrap tests; a browser
first-paint filmstrip/no-flash visual measurement was not available. No complete WCAG or milestone acceptance is claimed.

## Acceptance

The project owner accepted the theme preference and its stated verification evidence on 18 October 2026: “Theme preference গ্রহণ করছি”.
P02-005 is Done under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Milestone gates remain unchanged.
