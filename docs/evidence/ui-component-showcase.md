# Local UI component showcase

**Date:** 20 October 2026\
**Executor:** Codex\
**Status:** In Review; initial preview rejected; revised native reference awaiting owner review

## Requested outcome

The owner requested a browsable showcase of the two frontends’ existing UI controls, rather than feature pages. This is a supporting design-review tool, not a new commerce/auth feature or a reopened numbered phase task. Design tokens, product/API/database contracts, production routes and task/milestone acceptance remain unchanged.

## Delivery

Run `npm run ui:showcase`, then visit:

- [Storefront](http://127.0.0.1:5180/showcase.html?app=storefront)
- [Admin](http://127.0.0.1:5180/showcase.html?app=admin)

`tests/ui/showcase.html` and `showcase.tsx` use the existing local fixture Vite configuration. Both views import their own real app-owned UI controls; component selection does not create a production shared UI library. Existing shared fonts/tokens/style adapters are reused. The UI offers frontend switching, section navigation and each app’s actual Light/Dark/System preference control.

Examples include button variants/sizes/disabled/pending states; app link adapters; text/required/invalid/disabled inputs and textarea; select/checkbox/radio controls; form rejection/error summary; four alert tones; empty/loading states; editable modal/drawer previews; storefront cards/prices/status/variants/cart quantity and estimated summary; admin table/empty results/filter/pagination/upload/guarded-action controls. All values are synthetic/local; no API/provider calls or data writes. The preview form intentionally demonstrates rejection without resetting input. Uploaded previews use the existing local file component.

The showcase lives outside both application production trees and is never imported by their entry points. No dependencies, builds or database are needed to run it. The convenience script uses existing installed Vite tooling; CI check inventory and workspace scripts are unchanged. README documents URLs, startup and port ownership. Port 5180 is shared with the existing browser test fixture; stop this preview before running a browser suite that reserves that port.

## Focused verification

Local Linux, Node v24.20.0/npm 11.19.0. No full CI or application build/test-suite runs.

| Check | Result |
| --- | --- |
| `npm run ui:showcase` | Passed; local loopback Vite server started on 5180 and intentionally left running for owner review |
| `node node_modules/typescript/bin/tsc --project tests/ui/tsconfig.json` | Passed; new showcase and its actual component imports |
| Biome lint of `tests/ui/showcase.tsx` | Passed |
| `npm run lint:boundaries` | Passed; production imports unchanged, zero boundary errors |
| `npm run lint` and `git diff --check` | Passed; repository/documentation/whitespace checks |
| Focused Chromium review script | Passed; eight combinations of Storefront/Admin, light/dark and 375/1440 px; zero page errors or horizontal overflow |
| Controls and recovery | Passed; editable input, local button click, intentional form rejection, modal edit/dismiss/reopen retention and drawer Escape dismissal |
| Axe on eight showcase views | Passed; zero WCAG 2/2.1/2.2 A/AA tagged violations |
| Executor visual review | Inspected full-page storefront light desktop and admin dark mobile screenshots; readable component groups, responsive wrapping and no clipping |

The initial ad-hoc browser harness used Playwright’s convenience `browser.newPage`, which axe rejects; the corrected explicit context harness passed all eight cases. No application fix or suppressed rule was needed. Browser checks ran with reviewed local process permissions. Local artifacts: `test-results/ui-showcase/report.json` and eight screenshots in the same directory. Focused script: `/tmp/sportzone-showcase-check.mjs` (temporary local artifact).

Not Run: full CI, app builds, backend/unit suites, Firefox/WebKit, real devices and screen readers. Production app code is unchanged; this reversible local review surface received focused verification per the owner’s request and Testing §15.5.

## Review and recovery

Owner review/acceptance requested through the agreed popup. To recover, stop the local Vite process and remove this standalone entry and convenience command. No deployment, migrations, production data or external effects exist.

## Revised owner scope — original HeroUI reference

The owner rejected the original app-control gallery, asked for original HeroUI design with simplicity/professionalism, and clarified the scope in a popup: “শুধু project-এ ব্যবহৃত HeroUI components—তাদের সব variants”. This supersedes the earlier gallery design handoff; no acceptance is inferred.

Current default entry: `tests/ui/showcase.html` → `native-showcase.tsx` → `native-showcase.css`. The stylesheet imports only Tailwind and `@heroui/styles`, with layout-only selectors. It imports no SportZone token/font/adapter CSS and no app wrappers. Browser inspection confirmed that the only injected stylesheet is `tests/ui/native-showcase.css`. Native colors, shapes, variants, typography, sizes, shadows and interactions come from the installed HeroUI 3.2.6 package.

[Original HeroUI reference](http://127.0.0.1:5180/showcase.html) is the main review link. The separate [app composition gallery](http://127.0.0.1:5180/app-showcase.html) retains commerce/management examples. Its internal links point to that separate entry. Both remain local-only and require no backend or app build.

A read-only TypeScript import scan found 29 imported native names across both apps: Alert, Breadcrumbs, Button, Card, CardContent, CardHeader, Checkbox, Chip, Description, Disclosure, Drawer, FieldError, Form, Input, Label, Link, ListBox, Modal, NumberField, Pagination, Radio, RadioGroup, Select, Skeleton, Spinner, Surface, Table, TextArea and TextField. These are represented in 22 catalogue families; structural parts such as Label and CardHeader are composed in their actual native contexts.

### Native variant coverage

Supported styling axes were inspected directly from installed `@heroui/styles` variant metadata, rather than assuming v2 APIs.

| Family | Coverage |
| --- | --- |
| Button | All seven variants × three sizes; disabled, pending, icon-only and full-width |
| Link | Default and disabled; no named visual variant axis in this version |
| Card / Surface | default, secondary, tertiary, transparent |
| TextField / Input / TextArea | primary/secondary input variants; required, invalid, disabled, read-only, full width; file input |
| Select | primary/secondary; empty/selected/required/invalid/disabled/full-width; actual option popovers |
| ListBox / Item | default/danger variants, single/multiple selection, disabled items |
| Checkbox | primary/secondary; unchecked/checked/indeterminate/invalid/disabled |
| RadioGroup / Radio | primary/secondary; default/invalid/disabled, selected and unavailable options |
| NumberField | primary/secondary; default/invalid/disabled/full-width, increment/decrement |
| Form / Label / Description / FieldError | Actual composed controls and native required/invalid validation |
| Alert | default/accent/success/warning/danger, with native indicators |
| Chip | All four variants × five colors × three sizes |
| Spinner | All five colors × four sizes |
| Skeleton | pulse/shimmer/none, with rectangular/text/circle layout examples |
| Modal | Controls for all six sizes, three backdrop variants, two scroll modes and four placements |
| Drawer | Controls for all four placements and three backdrop variants |
| Disclosure | Closed/open/disabled |
| Table | primary/secondary |
| Pagination | All three sizes; summary, active page, previous/next/ellipsis |
| Breadcrumbs | Default/current page and custom separator |

This is complete supported visual-variant-axis coverage for the used native families, not every possible Cartesian combination of all behavior props or unused HeroUI components.

### Verification of final native reference

- Passed: showcase TypeScript and Biome lint; repository documentation/link/whitespace checks.
- Passed: all 22 families render; selection, checkbox keyboard interaction and modal/drawer opening/dismissal work without page errors.
- Passed: light/dark at 375/1440 px, no document horizontal overflow; screenshots inspected separately from automation.
- Passed: stylesheet isolation check, proving project adapter/tokens/fonts/fixture CSS are absent.
- Accessibility scan: **findings recorded, not Passed**. Original HeroUI palette includes normal-text primary/danger color contrast below 4.5:1 in the reference. Do not change the native palette to conceal this; the reference is not production WCAG acceptance. Production retains the approved semantic palette/contrast rules. Shell helper-copy contrast was improved using the native foreground token without changing component styles.

Artifacts: `test-results/ui-showcase/native-report.json`, `native-contrast.json` and native light/dark screenshots. The first two ad-hoc checkbox checks used an absent explicit role selector and then pointer-clicked the hidden input; the corrected native keyboard interaction passed. No library component code or CSS was patched. Full CI/backend tests were not run for this preview change.

### App styling follow-up

Removed forced radius classes from app-owned HeroUI button/card/dialog compositions and redundant shape/spacing overrides from the shared adapter, preserving the production palette, font foundations, 44px minimum targets and native interaction semantics. Added native alert indicators, inherited pending-spinner color, and correct footer CloseTrigger flow. Earlier proposed custom 12/20/24px radii were discarded when the owner selected original HeroUI styling; foundation token values remain unchanged.

Final app checks: storefront lint/types and four affected suites Passed (93 tests); admin lint/types and four affected suites Passed (73 tests); both production builds and HTTP smoke scripts Passed. These checks apply to the app styling changes and are distinct from the stock-library reference findings above. No backend/API/database/dependency changes. All UI changes and revised preview remain In Review pending owner acceptance; task/milestone counts are unchanged.
