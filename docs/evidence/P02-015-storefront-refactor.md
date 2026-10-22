# P02-015 — Storefront structure and behavior parity

**Date:** 22 October 2026\
**Baseline:** `8979834`\
**Status:** In Review — local verification passed; independent acceptance pending

## Scope and delivery

The owner requested storefront, admin and monorepo refactoring as one batch. Storefront implementation and its
lint/types/unit/build/smoke checks were completed before admin implementation; independent acceptance remains
required for each task at the combined handoff. No milestone or provider gate is implicitly accepted.

- Public home/catalog/cart/wishlist destinations use (shop); contact/support/policies use (information).
  Generic catch-all routing is replaced by explicit routes and bounded policy parameters; all existing URLs,
  unavailable states, noindex behavior and unknown-path 404s are preserved.
- (account)/account and (auth) retain their URLs, private/no-store/no-referrer controls and metadata.
- Root providers compose the identity provider. Flat auth/home/account features own views, endpoints and schemas.
  Account state/session presentation is separated from account forms/details; reusable IdentityForm lives in
  components/forms and consumes app-owned UI controls.
- lib/api-client owns credentialed uncached transport, CSRF, generation fencing and the one-mutation guard;
  lib/api-error owns safe messages; lib/query-client owns existing bounded read retries and disabled mutation retries.
  Feature API modules own identity/profile/address/password/email endpoints and their response schemas.
- Native HeroUI UI/Link/theme boundaries, root shared theme/money helpers and commerce compositions remain intact.
  lib/format and styles/globals.css are the canonical entry points. No unused server API/template module was added.
- Typecheck clears only generated route-type caches before fresh Next type generation; stale moved validators cannot
  remain silently in the TypeScript project. No runtime/customer state is deleted.

## Verification and limits

Baseline: 7 files / 85 unit/component cases Passed. After refactoring: all 85 cases, lint/typecheck, production
build and compiled HTTP smoke Passed before the admin refactor. Smoke covers root landmarks/CSS, eleven existing
unavailable destinations, private cache/robots headers, internal group names and unknown-path 404s.

Commands: npm run lint/typecheck/test:unit/build/test:smoke with --workspace=storefront.
The build uses public NEXT_PUBLIC_API_ORIGIN=https://127.0.0.1:4443 for isolated real-API browser fixtures.
Integrated CI/browser, keyboard/theme/accessibility and executor visual inspection Passed; results are recorded in
[P01-019](./P01-019-monorepo-refactor.md). This is structural parity, not new catalog/cart/checkout acceptance.

## Recovery and review

Use the complete prior frontend artifact/configuration for rollback; do not mix stale Next generated routes or
staging-baked public origins with another deployment. API/data/provider contracts and EXT-04 are unchanged.
Owner visual/task acceptance is pending; no browser CI pass substitutes for that independent review.
