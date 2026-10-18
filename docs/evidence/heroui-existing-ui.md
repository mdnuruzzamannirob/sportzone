# Existing UI migration to HeroUI

**Date:** 18 October 2026\
**Status:** In Review\
**Scope:** Owner-requested migration of existing presentation primitives; no new commerce functionality.

## Changes

| Existing UI | HeroUI implementation |
| --- | --- |
| Appearance in both apps | Controlled Select with Label, ListBox, indicator and popover; existing browser-local preference store/bootstrap |
| Storefront mobile navigation | Controlled Disclosure; library-managed trigger/panel relationships with route/breakpoint dismissal and Escape focus recovery |
| Public/private Appearance panel | Reusable storefront Disclosure composition |
| Storefront/admin links | HeroUI Link with app-owned Next.js/React Router adapters, retaining anchors, refs and router options |
| Home, account, destination and missing-page panels | Shared storefront PagePanel composition using Card and native heading/section semantics |
| Loading state | Card and decorative Spinner alongside the existing polite text announcement |
| Offline and page-error feedback | Alert with safe text, online/offline cleanup and the existing real retry action |
| Admin public/unavailable-access panels | Card; authentication boundary and disabled sign-in remain explicit |

Next.js imports HeroUI through explicit client components while public page content remains server-rendered; private account cache isolation remains covered by HTTP checks.

The token adapter enforces 44px minimum controls, project radii, grayscale surfaces and the same brand blue in both themes. Layout utilities, headings, navigation landmarks and text remain ordinary semantic HTML. No additional dependencies, theme store or shared UI package were introduced.

The current rules in AGENTS, Design, README and Testing supersede the native-control exceptions recorded during the earlier [foundation integration](./heroui-foundation.md). Historical task acceptance remains unchanged; this migration does not accept P02-007 or any milestone.

## Verification

| Check | Result |
| --- | --- |
| Storefront focused unit suite | Passed; 44 cases including actual HeroUI popup keyboard opening/selection, persistence, hydration, mobile dismissal/focus and safe retry |
| `npm run ci` | Passed; all 13 configured commands, 96 tests (12 root, 44 storefront, 40 admin), both production builds and six HTTP smoke groups; Node 24.20.0 / npm 11.19.0 |
| Shared theme test helper lint | Passed; `node_modules/.bin/biome lint tests/theme-interactions.tsx --vcs-enabled=false --error-on-warnings` |
| `git diff --check` | Passed |
| Browser visual and native keyboard review | Not Run; no enabled browser surface available in this session |

## Sources

- [HeroUI Select](https://heroui.com/en/docs/react/components/select)
- [HeroUI Disclosure](https://heroui.com/en/docs/react/components/disclosure)
- [HeroUI Link](https://heroui.com/en/docs/react/components/link)
- Installed HeroUI 3.2.6 component declarations and implementations.
