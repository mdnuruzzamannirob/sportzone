# P02-016 — Admin structure and behavior parity

**Date:** 22 October 2026\
**Baseline:** `8979834`\
**Status:** In Review — local verification passed; independent acceptance pending

## Scope and delivery

This task is part of the owner's explicit storefront/admin/monorepo batch. Storefront parity was verified before
admin implementation. Final independent acceptance remains separate from successful checks and milestone gates.

- app/router and providers retain React Router Declarative Mode; app/require-admin owns the lazy session UX guard.
  The existing error boundary, pending/error states, deep links and recovery remain; Express still authorizes access.
- Auth views/provider/schema/API files are flat and feature-owned. Reusable IdentityForm lives in components/forms.
  Safe API errors and transport/query defaults live in lib/api-error, api-client and query-client; endpoint methods
  remain in auth.api. No registration route or optimistic session/payment authority is introduced.
- Native HeroUI control/theme/Link boundaries, layout/management compositions, default styles, format helper and
  private cache clearing/cross-tab invalidation remain. The guard reports uncertain logout honestly and retries only
  by explicit user action. Credentials/proofs are not persisted in browser storage or generic query variables.

## Verification and limits

Baseline: 7 files / 80 unit/component cases Passed. After refactoring: all 80 cases, lint/typecheck, Vite production
build and compiled HTTP smoke Passed before monorepo migration. Smoke verifies assets, SPA fallback, deep links,
no-store/noindex headers; it does not prove production hosting or server authorization.

Commands: npm run lint/typecheck/test:unit/build/test:smoke with --workspace=admin.
The build uses public VITE_API_ORIGIN=https://127.0.0.1:4443 for isolated real-API browser fixtures.
Integrated browser/theme/keyboard/accessibility and executor visual inspection Passed; results are maintained in
[P01-019](./P01-019-monorepo-refactor.md). Existing unavailable management screens remain unavailable.

## Recovery and review

Roll back with the matching complete frontend artifact and public origin configuration; backend sessions, identity,
notification/audit records and provider evidence remain intact. No database migration or production change is run.
Owner visual/task acceptance is pending. EXT-04 and all milestone/operator/provider gates remain independent.
