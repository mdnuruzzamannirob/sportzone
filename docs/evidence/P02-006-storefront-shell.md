# P02-006 — Responsive storefront navigation shell

**Reviewed:** 18 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Prerequisites:** P02-001 and P02-005 Done

## Delivered behavior

Implemented [Design §§3–5](../DESIGN.md#3-responsive-design) with a shared public header/footer and separate private account
presentation. Existing colors, fonts, theme preference, session/cache boundaries and backend ownership remain unchanged.
The root appearance control moves into the public header's native Appearance disclosure; private account pages retain
an equivalent Appearance disclosure. Root and public not-found states expose recovery navigation.

| Area | Behavior |
| --- | --- |
| Desktop header | Home wordmark, Products/Search/Account/Wishlist/Cart links, current-page indicator, Appearance disclosure |
| Mobile header | Home, Menu, Search and Cart; inline nonmodal disclosure below header at widths under 1024px |
| Menu interaction | aria-expanded/controls, native links/buttons, Escape and Close return focus; link/route changes close; desktop breakpoint closes and transfers hidden-menu focus to Home |
| Public layout | One focusable main, skip link, fluid full-width 1280px container, responsive gutters, wrapping navigation, nonsticky header |
| Footer | Contact, customer support, shipping, cancellation, returns/refunds, privacy and terms entry points |
| Placeholder destinations | 11 explicitly unavailable/noindex static paths, no made-up product/category/cart counts, contacts or published policy text |
| Loading | Polite status message without implying an order/payment result |
| Error | Generic error text, actual Next reset callback and home link; internal error details are not rendered |
| Offline | Reversible online/offline status message with event cleanup; browser connectivity signal is not provider/API health proof |
| Not found | Generic missing-page heading, home recovery and public navigation; unknown paths return HTTP 404 |

The mobile panel is a disclosure, not a modal dialog or ARIA application menu. Links retain normal document tab order;
no focus trap is imposed. Appearance is available to guests and on the separate private placeholder. Approved dynamic
categories, search, cart/wishlist behavior, real customer authentication, store contacts and published policy content remain
with their feature tasks. No promotional or operator-supplied content was fabricated.

The allowlisted placeholder paths are `/products`, `/search`, `/wishlist`, `/cart`, `/contact`, `/support`,
`/policies/shipping`, `/policies/cancellation`, `/policies/returns-refunds`, `/policies/privacy` and `/policies/terms`.
The catch-all route uses explicit static params with dynamicParams false; it does not turn arbitrary URLs into successful
placeholder pages. Future owning features can replace the relevant scaffold destinations with their real route contracts.

References: [WAI disclosure navigation example](https://www.w3.org/WAI/ARIA/apg/patterns/disclosure/examples/disclosure-navigation-hybrid/)
and [Next.js dynamic segments](https://nextjs.org/docs/app/api-reference/file-conventions/dynamic-routes).
These references inform structure; they are not browser/accessibility certification for this implementation.

## Verification

Environment: Node 24.20.0 / npm 11.19.0, existing exact dependency versions and lockfile. Production build and temporary
loopback checks used required execution-environment permissions. No deployment or external account was changed.

| Command / check | Observed result |
| --- | --- |
| `npm run ci` | Passed: all 13 configured commands, 12 root/43 storefront/39 admin tests (94 total), both builds/typechecks and 6 HTTP smoke groups |
| `npm run test:unit --workspace=storefront` | Passed: 6 new shell cases plus 37 existing layout/token/foundation/theme cases |
| Storefront lint | Passed after correcting the route-change effect's dependency use; no rule disabled |
| Storefront production build | Passed: public home/placeholder pages static, account remains dynamic/private |
| Storefront production smoke | Passed: known destination HTML/noindex/landmarks, closed mobile menu, stylesheet/fonts/bootstrap, account cache rules and actual 404 recovery |
| `npm run lint`, `python3 /tmp/p02-006-verify.py`, `git diff --check` | Passed: references, task/dependency counts, route manifest and unaffected-source/staged-index preservation |
| Native keyboard/Tab, assistive technology and actual 320–1280px viewport overflow checks | Not Run: no browser available in UI surface inventory |

| Executed test | Assertions |
| --- | --- |
| SHELL-01 | Initially closed disclosure; matching controls ID; opening; Escape closes and restores trigger focus |
| SHELL-02 | Link and Close dismiss panel; explicit close restores focus |
| SHELL-03 | Path change closes; active link updates; desktop media change closes and moves hidden-panel focus to visible Home link |
| SHELL-04 | One main/skip target, responsive breakpoint classes, seven footer links, Appearance and no fake cart/shipping claims |
| SHELL-05 | Offline/online status changes and effect cleanup |
| SHELL-06 | Generic error hides sensitive fixture detail, retry invokes reset, loading status and 404 recovery link |
| SMOKE-04 | All 11 placeholder routes respond 200 with unavailable/noindex text, one main and footer; closed menu markup present |
| SMOKE-03 | Unknown and encoded internal-group URLs respond 404 with missing-page text and footer |

Responsive behavior is supported by fluid/wrapping layout classes and simulated breakpoint events. Escape/focus checks
use real DOM events in jsdom; native browser Tab order, touch behavior and screen-reader behavior were not measured.
Loading/error components were verified directly; no backend failure or real order/session expiry flow is claimed.
Existing palette/contrast and reduced-motion tests pass, without claiming complete WCAG or milestone acceptance.

## Acceptance

The project owner accepted the storefront shell and its stated verification evidence on 18 October 2026: “Storefront shell গ্রহণ করছি”.
P02-006 is Done under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting). Milestone gates remain unchanged.
