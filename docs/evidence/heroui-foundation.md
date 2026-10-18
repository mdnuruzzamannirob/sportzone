# HeroUI foundation review

**Date:** 18 October 2026\
**Status:** In Review\
**Scope:** Owner-requested component-library migration and UI working conventions; not completion of another numbered feature task.

## Authorization and implementation

The project owner requested HeroUI going forward and delegated UI design to the implementing agent. Design remains governed by [Design §2](../DESIGN.md#2-design-system); product, API, authorization and financial contracts are unchanged.

- Storefront and admin use exact `@heroui/react` / `@heroui/styles` 3.2.6 dependencies with a generated root lockfile.
- Both CSS entries import Tailwind, HeroUI, project tokens, foundation and the shared adapter. Existing semantic colors override library defaults; the adapter aliases library colors to project tokens, including CSS System mode without a second theme store or provider.
- App-owned Button components set 44px minimum height, control radius and primary/outline/ghost variants. Menu, Close menu and retry use real HeroUI behavior; admin sign-in is visibly disabled while authentication is unavailable.
- Native links, disclosure and Appearance select retain their existing semantic behavior. Further primitives migrate when required by feature tasks. The CI inventory records HeroUI in both active apps; the same five mandatory checks per app remain in force.
- AGENTS, Design, README and Testing specify component ownership, delegated design, visual feedback and cleanup rules. Superseded button-specific presentation was removed at migrated call sites.

## Verification

| Check | Result |
| --- | --- |
| Registry metadata and installation | Passed; React 19 / Tailwind 4 peer ranges compatible, installation added 49 packages |
| `npm run ci` | Passed; 13 commands, 12 tooling + 43 storefront + 39 admin tests, both production builds and six HTTP smoke groups; Node 24.20.0 / npm 11.19.0 |
| `npm run test:smoke --workspace storefront` and `npm run test:smoke --workspace admin` | Passed after adding served-CSS assertions for HeroUI aliases, primary Button styling, 44px minimum size and focus outline |
| `npm run lint` and `git diff --check` | Passed; final repository check found 115 files, 915 local links and zero errors |
| Real browser visual/keyboard/theme review | Not Run; computer-use inventory returned no enabled apps or browsers |

No application release or milestone acceptance is asserted. Previous task acceptance records remain historical; this migration awaits independent review.

## Sources

- [HeroUI installation](https://heroui.com/en/docs/react/getting-started/quick-start)
- [Next.js/Vite integration and provider requirements](https://heroui.com/en/docs/react/getting-started/frameworks)
- Installed package metadata, declarations and CSS for exact 3.2.6 behavior.
