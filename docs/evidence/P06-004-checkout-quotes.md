# P06-004 — Authoritative checkout quotes

**Date:** 26 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Done; accepted by project owner on 26 October 2026
**Revision:** Working tree against `42e8a753ed125edba32f66b26ef3565d695d6e50`.
Prior P06-003/notification changes present at kickoff were preserved; no commit/reset/cleanup was performed.

## Scope and approved decision

Sources: FR-11/FR-09, [API §11.1](../API.md#111-checkout-requestquotesubmission),
[Database §7.1.1](../DATABASE.md#711-checkoutquotes--buyer-confirmation), Architecture §§6–10,
Testing §10 and Tasks P06-004. P05-006/P04-008/P06-001 are accepted prerequisites. P06-003 remains
Blocked for qualified compliance evidence; this feature neither supplies nor waives that approval.

The owner explicitly selected “AND: দুটো শর্তই মিলবে” for simultaneous product/category coupon scopes.
Owning API/Database sections now require both nonempty restrictions to match. Category membership uses
listed product category IDs; no implicit subtree expansion or client couponEligible authority is added.
This approves scope semantics, not task completion, legal policy content or merchant activation.

The feature includes POST /checkout/quotes and the documented GET /delivery/areas discovery needed
for destination selection. No order-placement/payment endpoint is enabled. Two planned routes become
implemented: 79 implemented / 85 planned of the unchanged 164-operation inventory.

## Delivered behavior and ownership

- Express root composition opts quote creation in only with explicit configuration and customer-auth
  infrastructure. Public area discovery uses active effective coverage in active zones, bounded/filterable
  output and exact public CORS. Scheduled/inactive coverage and private configuration do not leak.
- Auth owns guest/customer authorization. Present invalid/duplicate customer cookies cannot downgrade
  to guest. Guests reuse a verified active storefront context without consuming/rotating it for every
  advisory quote; only its HMAC scope hash crosses the boundary. Customers use owned account/session
  transaction checks. Saved addresses resolve exclusively from the current profile.
- Strict DTOs reject client totals/prices/discounts/user/role fields, duplicates, invalid quantities,
  recipient XOR violations and bad Bangladesh phone/email. Buyer and recipient contacts remain distinct;
  guest email is required. Private normalized draft and customer data never appear in the quote response.
- Catalog/delivery/settings/promotions retain private persistence behind detached transaction-bound
  capabilities. Quote creation recomputes current visible SKU regular/sale prices, availability, eligible
  coupon scope/quota, active charge/rule, approved policy pointers and eligible deadline basis in one
  transaction snapshot. Integer-poisha allocation reuses the existing exact calculator and server line IDs.
- Payment eligibility retains all four channels. Configured online flags alone never prove activation;
  default live composition denies online methods until the payment owner supplies verified durable
  capabilities/ranges. Synthetic capability tests prove range behavior only; no provider call is made.
- Quote records retain immutable commercial/draft hashes, stable line allocations, coupon identity/terms
  version, delivery identity/version, deadline basis and required policy references. Explicit lifetime
  is enforced; no TTL/automatic consent deletion is installed. Capture time/advisory stock changes do
  not spuriously change commercial terms. Corrupted stored consent fails integrity checks.
- Internal transaction-required revalidation checks scope-safe lookup, open status, exact expiry,
  normalized resolved draft/consent and current commercial terms with the original line IDs. Price,
  policy, deadline, delivery or coupon-term changes require a fresh buyer-confirmed quote, including
  coupon revisions that preserve the discount total. Insufficient stock/coupon usage retains its specific
  error. The check returns the original intact consent snapshot and does not consume it.
- Creation reserves no stock/coupons and creates no order, intent, collection or provider session. Multiple
  valid advisory quotes may coexist, including against the same last units. Quote admission uses the
  durable shared customer network budget and a distinct checkout group; logs contain route/correlation/
  static error facts, not contacts, addresses, credentials, fingerprints or quote scope hashes.
- Compiled additive quote bootstrap preserves existing records, installs declared indexes and refuses
  staging/production. Explicit runtime options have no invented TTL/applicable-policy defaults. Missing
  independently reviewed deadline/current published policies fails closed before quote publication.

Lifecycle consumption and financial idempotency remain P06-005–P06-009: resolve an existing intent first,
then atomically consume quote with order/stock/coupon effects and the required current-record fences.
The later submission HTTP error/renewed-policy presentation is not claimed by the internal checker.

All private models stay with their owner. No frontend, provider protocol, package, destructive migration,
new service infrastructure or alternate public order API was added. Changes to existing delivery/notification
config and deadline schema outside the feature are formatter-only; their existing logic was preserved.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0; disposable MongoDB 8.0.16 replica sets with generated databases.
Synthetic contacts, policies/review references, delivery, products, coupons and merchant capability only.
No application .env connection, production DB, live merchant channel or qualified legal approval was used.
Replica-set/subprocess/HTTP suites used local sandbox escalation where required.

| Command/check | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/checkout-quote.test.ts tests/unit/pricing.test.ts tests/unit/coupon.test.ts tests/unit/browser-security.test.ts tests/unit/sessions.test.ts tests/unit/composition.test.ts` | Passed; 160 tests in 6 files |
| `npm run test:integration --workspace=backend -- tests/integration/checkout-quote.test.ts` | Passed; 21 tests, including actual root flag composition/log privacy, persistent throttle, guest/customer HTTP, saved ownership, AND scope, exact rounding IDs, concurrent advisory quotes, consent corruption/change/expiry and compiled bootstrap |
| `npm run test:integration --workspace=backend -- tests/integration/browser-security.test.ts tests/integration/sessions.test.ts tests/integration/pricing.test.ts tests/integration/coupon.test.ts tests/integration/profile.test.ts tests/integration/composition.test.ts tests/integration/delivery.test.ts tests/integration/settings.test.ts` | Passed; 136 tests in 8 files: 31 browser security, 20 sessions, 10 pricing, 6 coupon, 29 profile, 5 composition, 19 delivery, 16 settings. Final distinct integration coverage is 157 |
| `npm run api:generate --workspace=backend` | Passed; four artifacts |
| `npm run test:contract --workspace=backend` | Passed; 92 cases, freshness/router parity/offline schemas/HTTP |
| `npm run build --workspace=backend` | Passed before final compiled/root/consumer suites; later changes were documentation or formatting only |
| `npm run lint --workspace=backend` | Passed; 265 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed; 275 files, zero violations |
| `npm run format:check` | Passed; 429 files after targeted formatting correction |
| `npm run test:smoke --workspace=backend` | Passed; actual DB startup, liveness/restricted readiness, redacted configuration failure and graceful shutdown |
| `npm run test:security` | Passed; zero secret findings and zero dependency advisories |
| `npm run lint`, task-register audit and `git diff --check` | Passed; documentation/reference/status consistency and whitespace |

Local reports: [21 quote cases](../../test-results/P06-004-checkout-quotes.json),
[136 consumer cases](../../test-results/database.json), [security](../../test-results/security.json).
These ignored reports may be replaced by later runs; the command/count record above describes this revision.

Initial integration had six passes/seven failures because the auth-owned context hash was excluded by
its private default projection. Selecting it only inside the auth capability corrected guest scope persistence;
the complete suite then passed. Initial typing/lint checks caught nested Mongoose typing, type-only imports
and test fixture overloads; fixed checks passed. Initial format check flagged the new checkout config and
three existing backend files; only canonical formatting was changed, then all 429 files passed. The first
integration JSON was preserved locally in `/tmp/P06-004-first-integration.json`; failures are not acceptance.

## Rollout, recovery and remaining gates

[Operations](../OPERATIONS.md) owns explicit quote activation/lifetime/applicable-policy configuration,
protected deadline loading, required persistence preparation, rate limits and rollback. Local bootstrap
refuses production/staging. Roll back matching routes/contracts/capabilities together while retaining
private quote consent, historical evidence and any future linked order/intent. Expiry is not deletion
permission, and an error must not trigger automatic replacement quote/order submission.

**Not Run:** actual order/intent/quote consumption and reservation concurrency, payment initialization/
collection, deployed checkout/staging, real merchant activation, qualified deadline sign-off, frontend
checkout/browser/theme review and full integrated release regression. Those owning tasks/gates remain
required. P06-003, P04-003 and P09-011 stay Blocked; no product milestone is accepted.

## Independent acceptance

On 26 October 2026 (Asia/Dhaka), after the implementation and verification handoff, the project owner
explicitly instructed: “done koro”. P06-004 is accepted as Done and its task checkbox is checked.
Acceptance covers the quote/area backend feature and recorded local verification, not actual order/
financial consumption, qualified P06-003 sign-off, merchant activation, staging, client stages or product
milestones. Those requirements and their recorded blockers remain unchanged.
