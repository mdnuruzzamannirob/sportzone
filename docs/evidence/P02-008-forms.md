# P02-008 — Accessible form and feedback primitives

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner accepted on 18 October 2026: “Form/feedback foundation গ্রহণ করছি”

## Scope and authority

- [Task](../TASKS.md#phase-02--uiux-design): P02-008; accepted dependencies P02-003 and P02-004.
- [Design §§6, 9–10](../DESIGN.md#6-ui-components): input/selection, validation, feedback, pending, overlay and recovery states.
- [Usage guide](../DESIGN.md#65-app-owned-ui-boundary-and-component-apis): actual component API, state ownership and integration conventions.
- No API, database or business-operation contract changed. No login/commerce form, authenticated preview route, financial mutation or external request was added.

## Delivered foundations

| Module in each app | Behavior |
| --- | --- |
| `fields.tsx` | TextInput/TextArea composition with visible labels, helper/field errors, required/disabled states and retained input; labelled Select with disabled options; Checkbox and Radio choices |
| `form.tsx` | Form guards repeat submit events while pending; focus-keyed error summary links to fields without stealing focus on ordinary edits |
| `button.tsx` | Primary/outline/ghost/danger, disabled and HeroUI pending semantics with visible progress text and decorative Spinner |
| `feedback.tsx` | Four persistent Notice severities, one announced loading region with optional decorative skeletons, and empty state with a recovery action |
| `overlays.tsx` | HeroUI form modal/drawer, title/description, Escape/Cancel and focus return; pending locks dismissal until the caller settles; controlled parent drafts survive close/reopen |

The runtime components remain app-owned; the behavior test contract is shared only by tests. Existing Appearance controls use SelectField, connectivity feedback uses Notice and storefront loading uses LoadingState. No dependency or CI command was added; the existing five checks per active app discover the new suites automatically.

Project tokens continue to govern both themes. Controls/options retain the 44px baseline, error text uses the semantic danger color, modal radius follows the dialog token and status notices use project status text colors. Disabled/pending controls do not establish backend idempotency or authorization.

## Verification

Environment: Node 24.20.0, npm 11.19.0, Vitest/jsdom, synthetic fixtures. Each app runs 15 new cases in each of light and dark themes: 30 new cases per app, 60 total.

| Check | Result |
| --- | --- |
| `npm run test:unit --workspace storefront` | Passed; 74 tests including 30 new form/feedback cases |
| `npm run test:unit --workspace admin` | Passed; 77 tests including 30 new form/feedback cases |
| `npm run ci` | Passed; 13 commands, 163 tests (12 tooling + 74 storefront + 77 admin), both production builds and six HTTP smoke groups |
| Shared test helper lint | Passed; `node_modules/.bin/biome lint tests/form-primitives.tsx --vcs-enabled=false --error-on-warnings` |
| Scope/task audit and `git diff --check` | Passed; task identities/dependencies, other statuses, milestone gates, unrelated files and staged index preserved |
| Browser manual keyboard, native Tab/focus cycling, viewport/zoom, touch and assistive technology | Not Run; computer-use inventory returned no enabled apps or browsers |

The contract checks actual generated label/helper/error associations, retained input and DOM, disabled option/control behavior, keyboard opening and selecting a long-label option, error-summary focus/field links, pending form/button guards, live-region semantics, modal/drawer focus containment/restoration, Escape/Cancel, draft retention and pending dismissal locks. Request settlement in these tests is a local UI state change, not a provider or backend success claim.

Existing admin-shell focus assertions now wait for observed focus entry/restoration with a bounded deadline rather than assuming the overlay's animation-frame work has finished at a fixed instant. No accessibility assertion was removed.

## Review boundary

The project owner explicitly accepted this task after the reported scope, results and verification limitations. Browser evidence remains Not Run and cannot be inferred from DOM tests or production builds. No milestone acceptance is implied.

## References

- [HeroUI TextField](https://heroui.com/en/docs/react/components/text-field)
- [HeroUI Form](https://heroui.com/en/docs/react/components/form)
- [HeroUI Modal](https://heroui.com/en/docs/react/components/modal)
- Installed HeroUI 3.2.6 declarations/source govern the concrete Checkbox/Radio and pending-control composition.

## Revision evidence

Local CI started at `2026-10-18T10:41:30.688Z`; the ignored `test-results/ci.json` records command results and lockfile hash. These are unreleased worktree changes.

| Source | SHA-256 |
| --- | --- |
| `storefront/src/components/ui/fields.tsx` | `e1dc884636123768d3464e6a6be8b20872e564c8e3484c8541cfb96bb5cef411` |
| `storefront/src/components/ui/form.tsx` | `eda92451d3422c4893762f0ee87ea817fb88002bfa70222cf1a590033c958e4b` |
| `storefront/src/components/ui/overlays.tsx` | `0e8dcb82ffecc2cfa189401026d3a1670f674e8bbb3eec60cd29cb7dd5f0f6ad` |
| `admin/src/components/ui/fields.tsx` | `bcec2666bf24b3007c4cc03adb806d67cb7796ae4ba22190e993c430b59ec047` |
| `tests/form-primitives.tsx` | `86c36bcebb039cc253fe32ede34a5f86c0524881ac9e9df49a097495bca71bcb` |
