# SportZone — Implementation plan

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 17 October 2026

**Product reference:** [PRD](./PRD.md)\
**Technical reference:** [Architecture](./ARCHITECTURE.md)\
**Design reference:** [Design](./DESIGN.md)\
**Execution reference:** [Tasks](./TASKS.md)\
**Scope:** Single-store sports e-commerce platform for Bangladesh\
**Audience:** Software engineers and development agents

This document defines the implementation sequence, dependencies, work packages, verification activities, acceptance gates, and release preparation for SportZone. The PRD governs product scope, business rules, and acceptance criteria; `ARCHITECTURE.md` governs technical boundaries and data integrity; `DESIGN.md` governs interface behavior and visual consistency. `TASKS.md` is the existing execution register for the individual tasks derived from this plan. This document does not replace those specifications or assert that development work has already been completed.

---

**Contents**

- [1. Overview & objectives](#1-overview--objectives)
- [2. Implementation principles](#2-implementation-principles)
- [3. Development strategy](#3-development-strategy)
- [4. Foundation & readiness](#4-foundation--readiness)
- [5. Implementation roadmap](#5-implementation-roadmap)
- [6. Phase-by-phase implementation](#6-phase-by-phase-implementation)
- [7. Dependencies & critical path](#7-dependencies--critical-path)
- [8. Requirements traceability](#8-requirements-traceability)
- [9. Integration strategy](#9-integration-strategy)
- [10. Security & quality assurance](#10-security--quality-assurance)
- [11. Milestones & acceptance gates](#11-milestones--acceptance-gates)
- [12. Environments & deployment](#12-environments--deployment)
- [13. Risks & change management](#13-risks--change-management)
- [14. Completion & handover](#14-completion--handover)

---

## 1. Overview & objectives

### 1.1 Purpose

Turn the approved product, architecture, and design baselines into an executable development sequence without changing their requirements. Organize work so that each delivered feature includes the backend behavior, affected user interfaces, integration, and verification needed to make that feature usable and safe.

**Implementation objectives:**

1. Deliver the PRD's initial-release functionality for guests, customers, and the single authorized administrator role.
2. Preserve correct order, payment, stock, coupon, return, and refund behavior under retries and concurrent requests.
3. Build the Next.js storefront, React + Vite administration portal, and modular Express API within the approved npm-workspaces monorepo.
4. Apply the approved design system, including accessible mobile-first layouts and matching light/dark brand tokens.
5. Establish repeatable tests, safe deployment procedures, monitoring, backup/recovery, and operational handover.
6. Keep every functional requirement and important non-functional requirement traceable to a phase and test evidence.

### 1.2 Scope and exclusions

The initial release serves one Bangladesh store, uses BDT, supports guest and registered checkout, offers store-managed COD, and integrates the SSLCOMMERZ-hosted channels that are actually enabled for the merchant. The administrator maintains catalog, inventory, delivery, orders, customers, promotions, reviews, returns, refunds, policies, and basic reporting.

Excluded features remain those listed in PRD §3.2, including multi-vendor operations, native mobile applications, automated courier integrations, live GPS tracking, loyalty programs, AI recommendations, international shipping, and multiple administrator permission levels. No phase may silently introduce an excluded capability as a release dependency. PRD §3.3 requires verified bKash, Nagad, Rocket, and COD for initial release. Missing online-channel activation blocks launch; a smaller channel set requires an approved PRD scope revision and updated acceptance, plan, and task records.

### 1.3 Source precedence and change handling

- **PRD:** authoritative for included/excluded features, business policies, release boundaries, and acceptance criteria.
- **Architecture:** authoritative for chosen technologies, application/module ownership, security boundaries, state consistency, and integration rules.
- **Design:** authoritative for visual tokens, navigation, page specifications, components, interaction states, and accessibility behavior.
- **Implementation Plan:** authoritative for execution sequence, work-package dependencies, and planned verification gates; it cannot overrule the three specifications.
- **Tasks:** authoritative only for task-level ownership, execution status, blockers, and evidence links after decomposition from this plan.
- **Database:** authoritative for collection/field schemas, indexes, persistence constraints, and migrations, within Architecture's invariants.
- **API:** authoritative for endpoint requests/responses, errors, authorization, CSRF bootstrap, and idempotency contracts.
- **Testing :** authoritative for test strategy, scenario procedures, fixtures, commands, and verification matrices; product acceptance stays in PRD.
- **Operations:** authoritative for deployment/configuration, monitoring, backups, restore, incidents, and operator procedures.
- **README / AGENTS:** root setup/navigation and coding-agent instructions. Neither overrides product or technical contracts.

When a source requirement is unclear, unavailable, or apparently inconsistent, record the exact reference and decision needed. Do not treat an implementation assumption or a successful test mock as product approval. Obtain the relevant approval before changing product scope, architecture, or design.

### 1.4 Execution status

This version defines the development baseline. Execute the roadmap through the stable tasks in TASKS.md, recording implementation status and milestone evidence there.

---

## 2. Implementation principles

1. **Backend authority.** Only Express domain services may confirm customer access, final prices, discounts, delivery charges, stock, order transitions, payment collection, or refunds.
2. **One business backend.** The storefront and admin portal are separate presentations over the same `/api/v1` API. Next.js server rendering is not a second commerce backend.
3. **Small, verifiable increments.** Deliver complete vertical slices with tests and relevant UI states rather than building every API before integrating any page.
4. **Dependencies before features.** Create shared foundations only where required by a dependent workflow; avoid speculative abstraction and unnecessary infrastructure.
5. **Financial and inventory integrity.** Use integer poisha for money, immutable order snapshots, indexed identities, guarded transitions, atomic writes, and transactions when multiple records must change together.
6. **Safe retries and uncertainty.** Duplicate checkout submissions, callbacks, refund attempts, and job runs must not repeat effects. Timeouts do not establish financial failure.
7. **Security by default.** Enforce session/role/ownership checks and input validation on the server; route guards and hidden actions are not authorization.
8. **Design parity.** Apply the semantic tokens from `DESIGN.md`; the primary blue stays `#2563EB` with white label text in both themes. Test accessibility in both modes.
9. **Continuous quality.** Add type checks, linting, relevant automated tests, review, and accessible error/loading/empty states during implementation, not only before launch.
10. **Explicit evidence.** A phase or feature is complete only when its stated tests and acceptance criteria have passed with reproducible evidence.
11. **Controlled configuration.** Operator-supplied content, merchant activation, legal/policy approval, and external service credentials are configuration prerequisites, not values to invent in code.
12. **Operational simplicity.** Prefer the modular monolith and durable scheduled jobs defined in the architecture; add external infrastructure only after an approved, demonstrated need.

---

## 3. Development strategy

### 3.1 Delivery model

Use dependency-driven, incremental delivery through the twelve phases owned by this plan and constrained by PRD product acceptance. A phase is an organizing milestone, not a rule that every task must run sequentially. Independent UI, API, test, and environment activities may proceed in parallel when their contracts and prerequisites are established. Do not begin a state-changing financial integration before its invariants and authoritative data structures exist.

A normal vertical slice follows:

`Confirm requirements → Define data/API contract → Implement domain rules → Implement required UI → Add tests → Verify acceptance → Record evidence`

For higher-risk work, write state-transition and concurrency tests before enabling the corresponding mutation in an integrated environment. Keep external calls outside database transactions.

### 3.2 Standard phase format

Each phase in §6 identifies its objective, prerequisite, implementation work, verification, deliverables, and exit gate. Backend, storefront, and administration work appear only when relevant. Cross-cutting standards in §§9–12 apply to every phase and should not be implemented a second time as separate competing features.

### 3.3 Feature-level definition of done

An implementation work package is done when all applicable conditions are met:

- The intended PRD behavior and out-of-scope boundaries are satisfied.
- Relevant domain and API behavior uses the approved module ownership, validation, error conventions, and authorization.
- Affected storefront/admin pages work with the actual API and include usable pending, error, empty, disabled, and successful states.
- Financial/inventory mutations are idempotent and concurrency-safe where required; failure and recovery paths are covered.
- Tests run successfully at the appropriate unit, integration, contract, and end-to-end levels.
- Responsive, keyboard, focus, contrast, and light/dark behavior meet the design specification where UI is involved.
- Appropriate logs, audit events, documentation, and operational checks have been added.
- Acceptance evidence and any known limitation are recorded in the corresponding `TASKS.md` item.

A mock-only page, a passing happy path without required failure handling, or a browser payment redirect without server verification does not satisfy this definition.

### 3.4 Task decomposition contract

Convert approved work packages into `TASKS.md` entries with a stable ID, short outcome, source requirement, phase, prerequisites, affected application/module, acceptance checks, verification evidence, and status. Optional fields are owner and blocker. Do not repeat large PRD, design, or architecture sections inside each task. Update dependencies when a design or operational decision changes; do not declare unfinished work complete to preserve an estimated schedule.

### 3.5 Timeline and estimation

Do not assign arbitrary completion dates. Estimate work after evaluating developer capacity, approved hosting, gateway/refund feasibility, operator content, and integration access. Record milestone dates separately in task tracking once agreed. A missing merchant capability may block online-payment acceptance without blocking COD-oriented development.

---

## 4. Foundation & readiness

### 4.1 Baseline and environment prerequisites

Before feature work, confirm that the current PRD, architecture, and design revisions are the intended baselines and that source references resolve from `docs/`. Record unresolved merchant, policy, hosting, email, product-content, and design-asset dependencies. Establish local, staging, and production configuration boundaries early; provision the isolated staging environment and deploy the integrated build before Phase 10 acceptance testing. Production deployment remains in Phase 11.

### 4.2 Repository and application setup

Create the repository layout defined in Architecture §4. Establish the minimal npm-workspaces shell in Phase 01, initialize the two frontend application shells in Phase 02, and complete the backend application/tooling foundation in Phase 03; these activities are not deferred until Phase 04:

```text
sportzone/
├── storefront/           # Next.js App Router, React, TypeScript
├── admin/                # React, Vite, TypeScript
├── backend/              # Express, TypeScript, Mongoose
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── DESIGN.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── TASKS.md
│   ├── DATABASE.md           # Data contracts
│   ├── API.md                # HTTP contracts
│   ├── TESTING.md            # Verification procedures
│   └── OPERATIONS.md         # Deployment/operations procedures
├── AGENTS.md
├── CHANGELOG.md
├── README.md
├── .env.example
├── .gitignore
└── package.json         # npm workspaces
```

Use supported mutually compatible package versions and commit the lockfile. Configure workspace scripts for development, linting, type checking, testing, and independent application builds. Install code-formatting and lint rules appropriate to each application. Add a CI baseline that fails on broken types, tests, lint, or builds; expand its coverage as features arrive. Verify `AGENTS.md` during Phase 01 with source-document precedence, scope constraints, task/evidence conventions, and required verification; keep it aligned with this plan and `TASKS.md`.

Frontend applications must not import Mongoose models or backend runtime services. A shared pure contract package is optional only if verified duplication justifies it; a shared UI component library is not required.

### 4.3 Database and application infrastructure

- Configure MongoDB connection management and Mongoose schema/index conventions. Use a replica-set-capable local/test/staging environment for transaction-dependent tests; a standalone server cannot validate transactional checkout behavior.
- Establish consistent environment validation, health/readiness checks, request identifiers, safe error responses, structured logs, and protected secrets.
- Establish `/api/v1` response/error conventions, validated pagination and sort parameters, and a testable application bootstrap.
- Configure public-content caching boundaries without shared caching of sessions, carts, checkout, orders, payment status, or guest-scoped information.
- Establish a durable scheduled-job execution path with claims/leases if parallel execution is possible. Expired TTL documents alone must never be responsible for business-state release.
- Provide documented, non-production fixtures and repeatable index creation/verification; never seed real customer data into test systems.

### 4.4 Integration and operator readiness register

| Dependency | Earliest required action | Acceptance dependency |
| --- | --- | --- |
| SSLCOMMERZ | Confirm merchant onboarding, sandbox access, activated channels, limits, validation and refund capabilities | Sandbox payment/refund evidence in Phases 07–08; live activation in Phase 11 |
| MongoDB | Select transaction-capable deployment and backup/restore method | Inventory/checkout concurrency tests and production release |
| Cloudinary | Confirm account, allowed uploads, credentials, and image policy | Product media implementation in Phase 04 |
| Transactional email | Approve sender/service and test delivery | Recovery, guest access, order events; production sender readiness |
| Catalog assets | Obtain approved products, variants, prices, images, categories, stock | Realistic catalog and production launch |
| Store configuration | Confirm delivery zones/charges, contact, fulfillment process, policy content | Checkout, support, operational acceptance |
| Hosting and DNS | Confirm origin/domain plan supporting API sessions and Next.js runtime | Staging integration and Phase 11 launch |
| Consumer/legal policy review | Verify applicable delivery, complaint, cancellation, return, refund, and privacy requirements against current authority | Public policy publication and production acceptance |

**External dependency status must not be inferred from a vendor name in the PRD.** For example, bKash, Nagad, and Rocket must not be presented as enabled checkout options until they are actually activated for the merchant. Specific legal deadlines and provider support must be validated before launch; the implementation plan does not independently certify their current validity.

### 4.5 Shared design foundation

Implement the approved semantic CSS tokens, theme bootstrap, font loading, responsive primitives, form controls, buttons, overlays, navigation patterns, status components, and accessibility utilities in the applications where needed. Storefront and admin components may remain separate while using the same token definitions. Maintain the Light / Dark / System preference, system default before override, persistence before first visible paint, and uninterrupted form state on theme changes.

---

## 5. Implementation roadmap

This roadmap owns the twelve phase labels; PRD §15 delegates delivery sequencing to this plan. Detailed delivery requirements are in §6; a dependency may be built earlier as a foundation and fully integrated in its designated feature phase.

| Phase | Scope | Principal dependency | Phase outcome |
| --- | --- | --- | --- |
| 01 — Requirements Finalization and Planning | Baseline review, decisions, readiness register | Approved source documents | Controlled implementation baseline |
| 02 — UI/UX Design | Convert existing design specification into reusable UI foundations | Design baseline, repository | Tested interface foundation |
| 03 — Authentication and Core Backend | Backend API, persistence, security, customer/admin identity | Transaction-capable DB and local setup | Working, protected applications/API |
| 04 — Product Catalog and Inventory | Categories, variants, media, catalog discovery, stock accounting | Backend, admin session, UI foundation | Admin-managed, browsable catalog |
| 05 — Cart, Wishlist, Coupons, and Reviews | Shopping state, discount rules, coupon allocation foundation, review foundations | Catalog, customer identity | Usable pre-checkout shopping features |
| 06 — Checkout, Orders, and Delivery Rules | Server totals, delivery config, COD, order lifecycle, guest lookup, hold foundation | Catalog, inventory, promotions, identity | Verified COD journey and payment-ready checkout |
| 07 — Payment Integration and Verification | Hosted payments, independent verification, retries, reconciliation | Checkout intents, reservation/coupon holds | Verified online collection and allocation |
| 08 — Returns and Refunds | Cancellation financial resolution, returns, inspection, gateway/manual refund handling | Orders, collections, snapshots | Safe post-purchase workflows |
| 09 — Admin Management and Reports | Remaining management workflows, reporting, operational oversight | Feature-level admin screens and financial history | Complete administration capability |
| 10 — Testing, Security Review, and Bug Fixing | Full regression, concurrency, accessibility, performance, recovery | Integrated feature coverage | Evidence-backed release candidate |
| 11 — Deployment and Production Verification | Staging-to-production release, live configuration, smoke tests | Acceptance gates and operator approvals | Approved, monitored production release |
| 12 — Documentation and Handover | Source, operations, configuration, runbooks, limitations | Verified production implementation | Accepted handover |

**Execution rule:** Phase 09 does not defer the admin screens required to create products, manage stock, configure delivery charges, approve refunds, or perform other earlier workflows. Those screens are implemented with their dependent domain slices. Likewise, testing and operational preparation begin before Phases 10–11.

---

## 6. Phase-by-phase implementation

### Phase 01 — Requirements finalization and planning

**Objective:** Confirm the existing development baselines, unresolved operational decisions, requirement ownership, and implementation dependencies without rewriting approved specifications.

**Prerequisites:** PRD v1.0, Architecture v1.0, and Design v1.0 available as the source documents.

**Work packages:**

1. Confirm source-document revisions, repository paths, product boundaries, and the change-approval process.
2. Map FR-01–FR-34 and PRD acceptance items to the implementation phases and their applicable UI/API surfaces.
3. Open the readiness register for merchant features, refund support, hosting/DNS, transactional database, email, media, business policies, fulfillment process, and approved product content.
4. Identify architectural trust boundaries and high-risk financial/inventory scenarios requiring dedicated tests.
5. Establish the minimal repository and npm-workspaces skeleton needed for Phase 02 application scaffolding; verify `AGENTS.md` against source precedence, implementation constraints, task/evidence rules, and verification expectations without implementing feature logic.
6. Define task IDs, evidence recording, blocker escalation, and milestone acceptance ownership in `TASKS.md`.
7. Resolve or explicitly defer only issues that do not prevent a safe next phase; do not silently decide unapproved policies.

**Verification:** Every functional requirement has a planned implementation/verification owner; unresolved external dependencies have status, consequences, and required decision/evidence. `AGENTS.md` reflects the approved source hierarchy and does not introduce conflicting instructions or excluded features.

**Deliverable:** Approved execution baseline, dependency register, and task-decomposition conventions.

**Exit gate:** Required source references and the next-phase prerequisites are available; all open blockers have an explicit disposition.

### Phase 02 — UI/UX design

**Objective:** Implement the already-specified UI foundation; this phase does not redesign SportZone.

**Prerequisites:** Phase 01 repository/workspace skeleton, `DESIGN.md` v1.0, and available approved visual assets or identified placeholders awaiting operator assets.

**Work packages:**

1. Initialize the Next.js storefront and React + Vite admin workspaces, then implement semantic theme tokens and Tailwind mappings for both applications. Keep the brand blue `#2563EB` and white-on-brand text identical in both modes; keep neutrals true grayscale.
2. Set up Inter, Plus Jakarta Sans, Bengali-capable fallbacks, consistent spacing/radii, icon conventions, and BDT formatting.
3. Implement responsive storefront and admin shells, navigation, theme preference, keyboard-accessible menus/drawers, and error/not-found/loading boundaries.
4. Implement the appropriate basic primitives: inputs, buttons, alerts, status badges, pagination, dialogs, file upload, tables, cards, and skeletons as needed for upcoming slices.
5. Establish form-error, focus, disabled, selection, loading, confirmation, and reduced-motion patterns using real component states in both themes.
6. Define reusable page-level templates for product discovery, detail, account, checkout, and admin management without falsely marking those pages feature-complete.

**Verification:** Check responsive reflow, keyboard access, focus treatment, contrast, theme persistence/no flash, same-color brand buttons, and no loss of entered state during theme switching. Component previews alone do not satisfy feature acceptance.

**Deliverable:** Reusable and tested UI foundations in both applications.

**Exit gate:** Applicable design-system primitives and route shells can support Phase 03–04 work without revisiting core visual decisions.

### Phase 03 — Authentication and core backend

**Objective:** Establish the modular Express API and secure identity foundation used by customer, admin, and later guest workflows.

**Prerequisites:** Phase 01 readiness, transaction-capable development/test database, Phase 02 UI foundations where required.

**Backend work packages:**

1. Initialize TypeScript Express application, Mongoose configuration, structured errors, central validation, CORS, logging, health checks, database indexes, and isolated test infrastructure.
2. Define the User, Session, Address, and required verification/recovery artifacts with appropriate normalized identities, indexes, and expiry/revocation controls.
3. Implement password hashing; registration, login, logout, password reset, account suspension behavior, and profile/password/email-change processes where applicable. Establish transactional registration and password-recovery email events with safe delivery and failure handling.
4. Implement opaque server-managed sessions with hashed tokens, secure `HttpOnly` host-only cookies, rotation/revocation, and separate customer/admin session types and cookie names. Issue a session-bound CSRF token in a private API response; require it in a custom header with approved Origin validation for browser mutations, and refresh it after session rotation or expiry.
5. Implement admin-only secure provisioning, authentication, password recovery, privilege separation, backend role/ownership middleware, login/recovery limits, and security audit events.
6. Set up typed API requests/responses, safe error codes, integration fixtures, and tests for access isolation and token invalidation.

**Storefront/admin work packages:** Connect customer login/registration/recovery/account pages and admin login/shell to real session endpoints. Handle signed-out, expired, suspended, unauthorized, loading, and validation states without leaking private data. Implement customer addresses and basic account data according to FR-02.

**Verification:** Customer/admin session separation; no public admin registration; expired/revoked sessions; CSRF and Origin failures; account/record ownership; recovery-token single use; rate limits; and password/session security tests.

**Deliverable:** Protected customer/admin identities, profile/address workflows, and working API/database foundation.

**Exit gate:** Authenticated routes and state-changing requests are safe, and subsequent modules can rely on proven role/session middleware.

### Phase 04 — Product catalog and inventory

**Objective:** Make approved products discoverable and purchasable by SKU while establishing authoritative stock accounting.

**Prerequisites:** Protected admin API, data and UI foundations; Cloudinary account, upload policy, and credential readiness confirmed or tracked as a media-acceptance blocker. Product-media integration itself is implemented in this phase.

**Backend work packages:**

1. Implement category/subcategory, product, variant/SKU, price/sale-price, visibility, featured flag, images, and product-attribute models and indexes.
2. Build admin catalog/category CRUD with active/inactive rules, slug/SKU uniqueness, category reassignment protections, and Cloudinary upload restrictions/cleanup handling.
3. Implement stock counters (`Physical`, `Reserved`, `Committed`) and the invariant `Available = Physical − Reserved − Committed`, including nonnegative atomic checks, adjustments, inventory movement history, and low-stock queries.
4. Establish tested inventory allocation service interfaces for later reservation, commitment, release, shipment, and inspected return workflows. Do not simulate a purchase as a stock adjustment.
5. Implement public catalog search, filter, sort, pagination, category and product detail APIs with inactive-product restrictions and bounded queries; add suitable indexes.

**Frontend work packages:** Build storefront Home, Products, Category, Product Details, search/filters, variant selection, image gallery, availability cues, related products, and product SEO. Include operator-approved homepage banner, featured/new/discounted products, categories, search, account/cart/wishlist indicators, support/complaint contact, and footer policy links. Build associated admin Products, Add/Edit Product, Categories, Inventory, and image-upload workflows.

**Verification:** Unique SKU/slug; inactive-product visibility; default SKU for non-option products; unavailable variants; out-of-stock purchase blocking; stock arithmetic; unauthorized stock adjustment rejection; mobile discovery; approved/absent homepage content and navigation/support/policy links; catalog revalidation/caching behavior; and real admin CRUD-to-storefront propagation.

**Deliverable:** Admin-managed catalog and reliable stock foundation, with public discovery operational.

**Exit gate:** Public product/variant state derives from the API and all stock mutation primitives enforce their invariants under concurrent tests.

### Phase 05 — Cart, wishlist, coupons, and reviews

**Objective:** Implement shopping preparation, promotions, and review foundations before order placement.

**Prerequisites:** Catalog and variants, customer identity, and inventory availability APIs.

**Backend work packages:**

1. Implement persistent customer carts, safe guest-cart merge rules, quantity validation, and authoritative price/availability refresh. Cart insertion must not reserve stock.
2. Implement authenticated wishlists with unique user/product membership and clear behavior for inactive/unavailable products.
3. Implement product sale pricing and coupon validation (fixed/percentage amounts, activation windows, thresholds, eligible product subtotal, global/per-customer limits, and one coupon per order). Require login for coupons with per-customer limits; guest coupons may have global limits only.
4. Implement deterministic discount allocation in integer poisha. Apply sale prices before coupons, exclude delivery from coupon eligibility, prevent negative discount outcomes, and preserve allocation detail for order snapshots and later refunds.
5. Define durable coupon holds/redemptions and atomic capacity checks that Phase 06 checkout can coordinate with inventory. Reserve capacity only during the appropriate checkout workflow, never on cart update.
6. Implement review persistence, edit ownership, moderation states, one-active-review uniqueness, and read-only approved review display. **Do not enable a new verified review unless delivered-purchase eligibility can be checked against actual orders.** Complete that eligibility integration after Phase 06 order lifecycle and Phase 08 refund/return eligibility data are available.

**Frontend/admin work packages:** Build Cart, Wishlist, coupon feedback, review listing/editing states, and relevant admin coupon creation/management. Implement review submission/moderation controls in staged form; enable only when the corresponding authorization and purchase evidence are operational.

**Verification:** Guest cart persistence; safe login merge; no stock hold on cart/wishlist; coupon rounding, date/threshold and usage-limit races; allocation/release primitives; unique wishlist/review rules; moderation visibility; and tests proving review eligibility cannot be bypassed.

**Deliverable:** Shopping-preparation features, promotion foundations, and gated review workflow.

**Exit gate:** Cart/discount data is suitable for server-side checkout and unsupported review eligibility cannot be asserted as verified.

### Phase 06 — Checkout, orders, and delivery rules

**Objective:** Deliver a complete guest/customer COD ordering path and the order/hold foundation required by verified online payments.

**Prerequisites:** Identity, catalog/variants, inventory primitives, discount/coupon capacity rules, working transactional-email verification, and approved delivery-area/charge inputs or an explicit operator-configuration blocker. Delivery-zone management itself is implemented in this phase.

**Backend work packages:**

1. Implement admin-managed delivery zones, district/area coverage and charges, enabled/disabled delivery selection, a shared store-wide guard for cross-zone charge scheduling/activation, estimated delivery dates, immutable deadline-rule snapshots and separate operational delivery commitments (Database §7.2; API §11.3). Calculate a confirmation-based absolute deadline only from the actual confirmation event. The PRD's 14-calendar-day delivery planning target is subject to any shorter applicable legal deadline; verify the operative rules before launch. Apply settings changes only to future orders.
2. Implement the API §11.1 contract with scope-bound persisted checkout quotes, mandatory quoteId, expiry/commercial comparison and atomic single-order consumption; changed terms require explicit buyer reconfirmation. Implement checkout validation that rechecks selected SKUs, stock, sale prices, coupon eligibility, customer details, district/area, address, terms acceptance, and server-calculated totals in integer poisha.
3. Implement immutable order/order-line snapshots, unique order numbers, fulfillment/payment separation, customer/order ownership, and stable checkout-intent idempotency keys.
4. Establish transactionally safe allocation coordination: accepted COD remains Pending and commits stock and coupon redemption; administrator confirmation is a separate fulfillment transition; the online path creates **15-minute** inventory and coupon holds with generation-specific heldAt, synchronized stock/coupon expiry/release and idempotent replay that never extends a hold. Keep provider interaction disabled until Phase 07 integration is ready.
5. Implement COD checkout acceptance, order confirmation, customer order history/details, authorized admin order confirmation/processing/shipment/delivery updates, stock movement on dispatch, and collection recording distinct from delivery status.
6. Implement eligible pre-shipment cancellation requests, recorded reasons, required admin review (including dispatch verification during Processing), and exactly-once inventory/coupon release. A paid order creates a refund obligation for Phase 08; unpaid COD cancellation creates no monetary refund.
7. Implement guest order lookup through order number plus email **followed by** a time-limited single-use email proof. Grant scope to only the verified order and eligible actions; apply rate limits and non-enumerating messages.
8. Implement delivery exception, delay/contact, failed-delivery and complaint-record foundations, plus durable order placement/confirmation, cancellation, shipment, and delivery notification events with retry-capable dispatch.
9. Implement status validation that rejects invalid order transitions independently of client controls. Keep new verified-review submission closed until Phase 08 completes delivered-purchase and full-return/refund qualification together; do not claim FR-10 complete in Phase 06.

**Frontend/admin work packages:** Build Checkout, Order Confirmation, My Orders, Order Details, Guest Order Lookup, applicable customer cancellation controls, Delivery Settings, order-management UI, COD collection, delivery exceptions, and customer-facing deadline/charge/error messages. Preserve user input on rejected checkout.

**Verification:** Duplicate checkout returns the existing outcome; last-unit COD checkout cannot oversell; coupon limits survive races; invalid delivery zones fail; final totals and price snapshots remain stable; guest proof cannot access another order; cancellation releases once; shipped order cannot use ordinary cancellation; COD is unpaid until collection; notification delivery failure does not roll back orders.

**Deliverable:** End-to-end COD journey with verified order history and provider-ready online intent/holds.

**Exit gate:** A guest and a registered customer can complete COD, an admin can fulfill and record collection, and all affected financial/stock/order invariants hold. Online payment is not represented as operational yet.

### Phase 07 — Payment integration and verification

**Objective:** Safely integrate supported SSLCOMMERZ-hosted methods and reconcile payment outcomes independently of the browser.

**Prerequisites:** Phase 06 checkout/order/hold foundation; merchant sandbox credentials and enabled-channel information; provider validation/status access.

**Backend work packages:**

1. Isolate SSLCOMMERZ behind a provider adapter and configure sandbox credentials server-side. Keep inactive bKash, Nagad, or Rocket channels hidden.
2. Persist a Payment aggregate and distinct Payment Attempts with unique order/attempt transaction IDs, status, provider references, amounts, currency, and expiry information.
3. Initiate hosted checkout against an existing checkout intent; use a fresh `tran_id` for each attempt on the **same** order. Do not create a replacement paid order for a retry.
4. Handle IPNs and browser return paths separately. Verify provider status server-side; match merchant, order, transaction reference, amount, BDT currency, accepted payment status, and risk signals before recording collection.
5. Enforce unique provider-scoped references, idempotent state transitions, and atomic conversion of valid stock/coupon holds to committed allocations after verified payment.
6. On late verified payment after expiry, first exclude Cancelled orders from reallocation; for eligible orders recheck and atomically reacquire **both** stock and coupon capacity. Record the collection as `Paid` even if fulfillment must be held for allocation failure or review.
7. On payment verified after cancellation, retain the collection, keep Cancelled fulfillment, and create a payment-correction obligation without reallocation. Route `risk_level=1` and other high-risk verified payments to authorized fulfillment review, independent of allocation status; preserve collected funds and resolution history.
8. Preserve all independently verified collections when separate attempts are paid; fulfill and allocate once, and flag extra collected money for authorized refund or resolution.
9. Reconcile missing, delayed, duplicated, reversed-order, and uncertain IPNs via provider validation/status APIs and durable scheduled work. An HTTP timeout is never sufficient to mark a transaction Failed.
10. Add retry rules that do not prematurely release capacity needed by another active attempt/paid order; instrument pending transactions and admin payment exceptions. Emit deduplicated transactional notifications for independently verified payment success or failure.

**Frontend/admin work packages:** Implement available-method selection, hosted redirect, Payment Result states, verified status polling/refresh, safe retry guidance, payment history, attempt details, and unresolved/risky-payment administrator controls. Show **Payment received — fulfillment under review** when payment is verified but fulfillment cannot proceed.

**Verification:** Sandbox success/failure/cancel/pending, mismatched merchant/reference/amount/currency, forged callbacks, missing IPNs, duplicate/out-of-order callbacks, retry after expired holds, late paid stock/coupon exhaustion, two paid attempts on one order, and risk-level fulfillment holds.

**Deliverable:** Verified online-payment journey with reconciliation and auditable exception handling.

**Exit gate:** No browser redirect alone marks Paid; verified collection is preserved accurately; stock/coupon commitment and fulfillment remain single-effect under retries and concurrency. Activated channel coverage is documented explicitly; sandbox acceptance does not waive any required production channel in PRD §3.3.

### Phase 08 — Returns and refunds

**Objective:** Deliver traceable cancellation-related refunds, physical returns, and full/partial refund outcomes without overpayment or premature completion.

**Prerequisites:** Order snapshots, collection records, cancellation events, delivery/return eligibility, and provider refund feasibility evidence.

**Backend work packages:**

1. Implement return requests for eligible delivered order items, quantities, reasons, evidence uploads, eligibility windows, and prevention of duplicate active claims against the same quantities. Apply the PRD's development-baseline seven-calendar-day window subject to approved policy and overriding consumer rights.
2. Implement separate return and refund state machines. Approved missing-item/shortage claims use a non-physical path without receipt, inspection, or restock; track their eligible quantities separately from physical returns. Physical returns require authorization, product receipt, inspection, and resellability decision; cancellation/payment corrections do not require physical inspection.
3. Implement administrator return review, rejection reasons, receipt and inspection records, and stock restoration **only** after inspected resellable return. Preserve the original fulfillment history.
4. Implement original-order-snapshot-based refund allocation including previously refunded quantities, item-level coupon allocation, applicable delivery-charge rules, and pending/completed refund commitments.
5. Atomically reserve refundable balance before payout. The combined pending and completed commitments may not exceed independently verified collected funds.
6. Implement supported gateway refunds using original provider collection references; retain refund transaction/attempt references and reconcile payout status. Provider request acceptance is not `Completed`. Track the PRD's development-baseline seven-business-day refund target, or any shorter applicable requirement, against verified completion.
7. Implement COD/manual refund paths requiring evidence of original collection, customer agreement to the payout method where needed, verified transfer details, and authorized completion.
8. Persist approvals, rejections, failed/uncertain attempts, authorized retries, payment corrections, and auditable return/refund notification events (including refund approval, rejection, and verified completion) without duplicate payouts or messages.
9. Finish review qualification against delivered purchases that have been fully returned/refunded, while preserving previously legitimate reviews according to the moderation policy.

**Frontend/admin work packages:** Build Return Request, My Returns, Refund Details, cancellation refund feedback, admin Returns/Refunds management, evidence review, inspection, amount review, and confirmed payout states. Show return and refund statuses separately.

**Verification:** Partial and full refunds; item-level rounding; concurrent refund attempts; original payment not collected; repeated payout callbacks; refund-status uncertainty; failed manual transfer; return quantity races; wrong/damaged item shipping rules; inspected restock; and explicit pending/failed states.

**Deliverable:** Complete after-sales workflow and verified refund accounting.

**Exit gate:** Refund amounts cannot exceed verified collected funds; no refund is marked Completed without payout evidence; inventory is never restored merely because a return was requested.

### Phase 09 — Admin management and reports

**Objective:** Complete cross-feature administration and reporting over already-implemented domain data; do not defer earlier workflow-critical admin screens to this phase.

**Prerequisites:** Catalog, checkout, payment, returns/refunds, and administrative access working through real APIs.

**Work packages:**

1. Complete Dashboard aggregation for products, customers, order states, low stock, returns, and recent activity with bounded queries.
2. Report gross merchandise value, sale/coupon discounts, paid collections, outstanding COD, completed refunds, pending refunds, and net collected revenue as distinct measures. Never count uncollected COD as collected revenue.
3. Complete customer search, order/return/refund history, suspension/reactivation, and sensitive-data access limitations.
4. Complete customer support/complaints workflow, contact tracking, decisions, resolution notes, and administrator audit context.
5. Complete review moderation and display of eligible reviews after purchase and return/refund qualification is fully integrated.
6. Complete store branding/contact data, low-stock threshold, approved policy publishing, delivery/support configuration, and related history where necessary.
7. Finalize financial exception dashboards, refund investigation paths, inventory adjustments, and review of auditable administrative actions.
8. Check administrative navigation coverage and mobile/desktop workflows against the design's admin sitemap.
9. Provision and deploy the integrated storefront, admin portal, API, transaction-capable database, scheduler, and test-provider configuration to isolated staging; verify deployed origins and environment separation before Phase 10.

**Verification:** Role checks for every sensitive operation; realistic dashboard sample data; duplicate-safe collection/refund aggregation; customer suspension; privacy of individual customer records; correct audit attribution; accessible admin actions and financial confirmations.

**Deliverable:** Integrated store-management portal and basic reporting capability.

**Exit gate:** All required administration tasks in the PRD can be completed using authorized screens and verified backend outcomes; the integrated staging deployment is available for Phase 10 acceptance.

### Phase 10 — Testing, security review, and bug fixing

**Objective:** Prove end-to-end release behavior and remove critical defects; this phase consolidates rather than postpones continuous testing.

**Prerequisites:** Feature-complete build deployed to isolated staging in Phase 09, test fixtures, approved acceptance scenarios, and available gateway/email test integrations.

**Work packages:**

1. Run full guest/customer/admin functional regression and mapped FR acceptance checks.
2. Run concurrency and fault-injection scenarios for inventory, coupons, duplicate checkout, payment retry/IPN, scheduled jobs, and refund commitments.
3. Verify authentication and admin/customer session separation, CSRF, unauthorized record access, guest proof expiry, rate limits, upload restrictions, and secret handling.
4. Test WCAG 2.2 AA-targeted flows with keyboard, automated accessibility checks, and manual screen-reader review in light and dark modes. Include mobile checkout, forms, dialogs, error states, admin tables, and theme preference.
5. Agree measurable performance budgets and representative data/load/device/network profiles in `TESTING.md` before running acceptance measurements. Validate public metadata/canonical behavior, image performance, catalog pagination, cache invalidation, no private shared caching, and representative browsing/checkout load.
6. Verify notification retry/deduplication, monitoring/alerts, job restart safety, backup and restore, and staging recovery of uncertain payment/refund outcomes.
7. Retest fixed defects and rerun affected regression areas. Record any accepted, nonblocking limitation with owner and launch disposition.

**Verification:** All release-critical acceptance cases have reproducible pass evidence; no unresolved critical security, financial, privacy, inventory, or checkout defects remain.

**Deliverable:** Reviewed and tested release candidate, acceptance report, defect disposition, and rollback/recovery evidence.

**Exit gate:** Section 11 release-candidate milestone passes; remaining limitations are explicitly approved and do not violate the PRD or launch safety gates.

### Phase 11 — Deployment and production verification

**Objective:** Promote the accepted staging release to production and confirm real operational readiness.

**Prerequisites:** Phase 10 acceptance, production ownership approvals, live credentials/channel activation, approved store policies, catalog and delivery configuration, DNS/hosting, backups, and monitoring.

**Work packages:**

1. Promote the staging-accepted storefront to a production Next.js-capable runtime, admin to static hosting with SPA fallback, Express API to a protected service, and transaction-capable MongoDB to a production deployment with protected backups.
2. Configure production HTTPS and approved same-site domain topology; verify host-only session cookies, CORS allowlists, CSRF/Origin checks, runtime variables, and provider callback URLs.
3. Apply and verify unique/conditional indexes and production-safe data/configuration changes with a tested rollback or recovery path.
4. Deploy/restart scheduled workers safely with durable state, duplicate-execution protection, alerts, and reconciliation visibility.
5. Confirm activation and approved payment acceptance for all three PRD-required online channels, plus supported refund procedure and limits. A missing method blocks launch unless an approved PRD scope revision explicitly changes the accepted set. Do not turn on an unverified payment method.
6. Publish approved catalog, policies, contact details, delivery zones/charges, administrator ownership, and support procedures. Verify current applicable consumer and digital-commerce rules before publication, including delivery deadlines and the complaint-response rule identified in the PRD as requiring verification.
7. Perform approved production smoke tests for browsing, authentication, guest verification, COD, supported online methods, IPN confirmation, order visibility, email, admin access, and payment/refund operational safeguards. Avoid unapproved live financial tests.
8. Confirm health monitoring, logs without secrets, backups/restore evidence, incident contacts, retry/reconciliation procedures, and a rollback decision path.

**Verification:** Staging and production settings are separated; active channels are displayed correctly; checkout produces verified outcomes; sensitive routes remain protected; on-call operators can locate unresolved transactions and restore service.

**Deliverable:** Approved and monitored production release with release notes and evidence.

**Exit gate:** Store owner/authorized release approver confirms service configuration, policy readiness, live payment restrictions, recovery procedures, and acceptance of launch status.

### Phase 12 — Documentation and handover

**Objective:** Transfer a maintainable, operable system without exposing credentials or leaving unreconciled obligations undocumented.

**Prerequisites:** Production verification, accepted deliverables, current environment and operating records.

**Work packages:**

1. Update repository setup, workspace scripts, API conventions, environment-variable names, schema/index instructions, and test execution notes.
2. Document deployment architecture, CI/CD, health checks, backups, restore steps, operational rollback, and scheduled-job recovery.
3. Document administrator workflows for products, inventory, delivery, orders, COD collection, payments, risk review, returns, refunds, complaints, reports, and store settings.
4. Document merchant/provider settings and reconciliation procedures without placing credentials or sensitive tokens in source code or handover artifacts.
5. Hand over source access, production account ownership, administrative provisioning and recovery process, external provider access ownership, and support responsibilities.
6. Record known limitations, outstanding decisions, maintenance commitments, third-party costs, and any agreed warranty/support arrangement.
7. Reconcile `TASKS.md` status with acceptance evidence and obtain final handover acceptance.

**Verification:** A new authorized engineer/operator can follow the documented deployment, restoration, and critical incident procedures; all required handover items from PRD §18 are available.

**Deliverable:** Accepted technical and operational handover package.

**Exit gate:** Required documentation, ownership, operational access, support boundaries, and known limitations are explicitly acknowledged.

---

## 7. Dependencies & critical path

### 7.1 Primary implementation dependencies

| Capability | Must exist first | Dependent work / prohibition |
| --- | --- | --- |
| Authenticated customer/admin actions | Sessions, CSRF, roles, ownership rules | Account/cart/admin mutations; a route guard alone is insufficient |
| Product purchasing | Catalog, active SKU, prices, authoritative available stock | Cart and order lines must reference valid purchasable variants |
| Coupon redemption | Coupon rules, eligible subtotal, atomic usage-capacity controls | Final discounts cannot depend on client totals |
| COD checkout | Server quote, stock commitment, coupon redemption, delivery settings, idempotency | No accepted order without an atomic allocation and immutable snapshot |
| Online checkout | Order intent, stock/coupon holds, payment-attempt identities | No provider redirect without persisted operation identity |
| Payment fulfillment | Independently verified collection plus eligible stock/coupon allocation and risk decision | Paid does not always mean ready to fulfill |
| Verified review | Qualifying delivered purchase, account ownership, moderation | Form must not issue verified-purchase claims earlier |
| Customer return | Delivered eligible order/item quantities, approved policy and time window | No duplicate claims or inspection bypass |
| Refund payout | Verified collected amount, original order snapshot, eligible approved obligation | No payout amount based on current product price or uncollected COD |
| Production release | Acceptance tests, live activation, policies, monitoring, backup/restore, operator readiness | No unverified gateway channel or unsupported policy promise |

### 7.2 Critical commerce path

`Foundation → Identity/Admin Access → Catalog/Variant/Stock → Cart/Pricing/Coupon → Delivery/Checkout Intent → COD + Online Hold Foundation → Verified Payments → Returns/Refunds → Integrated Acceptance → Production`

Parallel work includes admin UI for each domain, storefront presentation, notification templates, support processes, test automation, infrastructure configuration, accessibility, and operational documentation. Parallel activity must not bypass dependencies in the table.

### 7.3 Dependency and blocker rules

- A blocked external integration retains an explicit blocker; replace it with a fake provider only for tests, not for acceptance.
- A feature may be marked **implemented but not externally verified** when local tests pass and a real provider or operator approval is unavailable. It is not considered launch-accepted.
- A change to pricing, reservation duration, authorization, state transitions, or refunds requires review against the PRD/Architecture and affected tests before development proceeds.
- No unresolved prerequisite should be hidden by marking an entire milestone complete.

---

## 8. Requirements traceability

### 8.1 Functional requirements mapping

**Primary phase** identifies the main implementation location; **completion dependency** identifies later integration or verification when required. Phase references do not imply the requirement is complete merely because the named phase begins.

| PRD requirement | Primary phase | Completion/verification dependency |
| --- | --- | --- |
| FR-01 Customer Authentication | 03 | Recovery, sessions, suspension, rate limits, integration tests |
| FR-02 Customer Profile Management | 03 | Profile, addresses, verified email change, ownership, order snapshots |
| FR-03 Homepage | 04 | Approved banner, featured/new/discounted products, categories, search, account/cart/wishlist indicators, support/complaints contact, footer policy links, responsive/empty states |
| FR-04 Product Catalog | 04 | Search/filter/sort/pagination, active visibility, SEO |
| FR-05 Product Details | 04 | Images, variant state, availability, review visibility |
| FR-06 Product Variants | 04 | SKU uniqueness, price/stock, order-line snapshot in 06 |
| FR-07 Shopping Cart | 05 | Guest persistence, merge, revalidation at checkout in 06 |
| FR-08 Wishlist | 05 | Authentication, unique items, persistent state |
| FR-09 Discounts and Coupons | 05 | Capacity holds/commit/release with checkout in 06–07 |
| FR-10 Reviews and Ratings | 05 | Delivered-purchase and refund qualification in 08, admin moderation in 09 |
| FR-11 Checkout | 06 | COD E2E in 06, hosted gateway completion in 07 |
| FR-12 Payment System | 07 | SSLCOMMERZ sandbox/live activation, IPN/status verification, retries |
| FR-13 Inventory Reservation and Stock | 04 | Online holds/commit/release 06–07, shipment 06, inspected return 08 |
| FR-14 Customer Order Management | 06 | Lifecycle, separate payment state, refund links in 08 |
| FR-15 Order Cancellation | 06 | Stock/coupon release in 06, paid cancellation refund in 08 |
| FR-16 Delivery Management | 06 | Zone/charge, manual fulfillment, exceptions and legal check before 11 |
| FR-17 Return Management | 08 | Delivered eligibility, receipt/inspection, admin resolution |
| FR-18 Refund Management | 08 | Full/partial calculation, verified payouts, retries and audit |
| FR-19 Guest Order Access | 06 | Single-use email proof, scoped actions, cancellation/return/refund links through 08 |
| FR-20 Notifications | 03, 06–08 | Registration/recovery, order/cancellation/shipment/delivery, payment success/failure, return/refund events; delivery retry and deduplication verified in 10 |
| FR-21 Admin Authentication | 03 | Secure provisioning, separate sessions, protected mutations |
| FR-22 Admin Dashboard | 09 | Correct COD/paid/refund metrics and cross-domain queries |
| FR-23 Product Management — Admin | 04 | Media, variants, visibility, catalog changes |
| FR-24 Category Management — Admin | 04 | Hierarchy, activity, guarded deletion/reassignment |
| FR-25 Inventory Management — Admin | 04 | Adjustments, movements, reserved/committed view, restock in 08 |
| FR-26 Order Management — Admin | 06 | Fulfillment, COD, delivery exceptions, complaint/refund links |
| FR-27 Customer Management — Admin | 09 | Search/history, suspension, limited sensitive data |
| FR-28 Delivery Charge Management — Admin | 06 | Zones, charges, inactive coverage, future-only edits |
| FR-29 Payment Management — Admin | 07 | Attempt history, collection, reconciliation, COD record in 06 |
| FR-30 Coupon Management — Admin | 05 | Rules, limits, activation, redemption history |
| FR-31 Review Management — Admin | 05, 09 | Moderation and verified-purchase eligibility after order integration |
| FR-32 Return Management — Admin | 08 | Eligibility, receipt, inspection, restock/refund authorization |
| FR-33 Refund Management — Admin | 08 | Balances, full/partial payouts, attempt verification, failure resolution |
| FR-34 Store Settings — Admin | 09 | Approved policies, branding, contact, threshold, operational configuration |

### 8.2 Interface and workflow coverage

- **Storefront:** Home, Products, Category, Product Details, Cart, Wishlist, account/authentication, Profile, Addresses, My Orders/Order Details, Reviews, Checkout, Payment Result, Order Confirmation, Guest Order Lookup, Returns, Refund Details, Contact, and policy/help pages are implemented in the phases supporting their corresponding behavior.
- **Admin:** Login, Dashboard, Products/Add/Edit, Categories, Inventory, Orders/Details, Customers, Delivery Settings, Payments, Coupons, Reviews, Returns, Refunds, Reports, and Store Settings must exist where required by the design. Complaints may be managed within customer/order context rather than a separate page.
- **Critical flows:** Registration/recovery, browse-to-cart, COD, hosted online payment, missing/duplicate IPN, guest access, fulfillment, failed delivery, cancellation, return, refund, review moderation, and administrative exception handling require linked E2E or integration evidence.

### 8.3 Non-functional and release coverage

| Requirement area | Ongoing implementation | Release evidence |
| --- | --- | --- |
| Security/privacy | Session/CSRF/CORS/ownership, rate limits, upload safety, secrets, protected logs | Security regression and unauthorized-access tests |
| Data integrity/reliability | Indexes, transaction/conditional writes, idempotency, durable jobs | Concurrency, recovery, duplicate-operation tests |
| Performance | Indexed and paginated queries, image optimization, controlled public caching | Representative catalog/checkout performance checks |
| Responsive/accessibility | Mobile-first components, keyboard flows, theme parity | WCAG 2.2 AA-targeted manual and automated checks in both themes |
| Browser compatibility | Framework-compatible controls and responsive layouts | Current stable Chrome, Firefox, Edge, Brave, Safari testing |
| Availability/operations | Logs, monitoring, backup, alerts, job visibility | Staging/production health and restoration evidence |
| Payments/refunds | Provider verification, financial snapshotting, attempt history | Sandbox tests and approved live-channel verification |
| Consumer operations | Delivery/deadline tracking, complaints, approved return/refund policies | Store-owner/legal readiness approval before publishing |

Acceptance criteria remain the full set in PRD §14. This matrix is an index, not a replacement for those checklists. PRD success metrics in §16 are tracked after sufficient operational data exists; this plan does not invent numeric targets.

---

## 9. Integration strategy

### 9.1 API and data contracts

Use versioned resource-oriented Express endpoints under `/api/v1`, bounded pagination, stable error codes, and consistent success/error envelopes. Define and test endpoint schemas alongside their feature modules; do not duplicate a speculative complete endpoint list in this plan. Storefront rendering may request public catalog data; private mutations and data remain under Express authorization, and private responses must not enter shared caches.

Backend modules own their data through public service functions. Coordinate cross-module checkout, payment, inventory, coupon, and refund changes through explicit domain orchestration and MongoDB transaction boundaries. Record business decisions before initiating uncertain external effects as required; do not hold a database transaction open during provider, Cloudinary, or email calls.

### 9.2 Money, orders, and stock

Implement PRD FR-09/FR-11–FR-18 and Architecture §§7/10 through domain services. `DATABASE.md` supplies numeric fields, immutable snapshots, counters, collection/refund records, constraints, and indexes; `API.md` supplies mutation contracts. Each feature's acceptance must prove those invariants rather than redefine them in this plan.

### 9.3 Payments, refunds, and asynchronous work

Isolate merchant APIs behind backend adapters; verify callbacks through provider status/validation; persist unique references and attempts; distinguish payment collection from fulfillment and payout completion from refund initiation. Retry and reconciliation jobs must be durable, idempotent, observable, and recoverable after restart. Duplicate provider callbacks must not repeat allocation, refund, or notification effects.

For proof-email delivery, follow API §16.3: a challenge-local authenticated encrypted envelope and verification hash, external key custody, reference-only outbox, safe expiry/reissue and uncertain-send reconciliation. Never equate one event intent with exactly-once email transport.

For important state-change notifications, persist delivery intent durably with the originating business transition where needed; dispatch email separately and retry without replaying that business transition. Delivery failures remain visible and do not reverse successfully committed orders or refunds.

| PRD FR-20 notification event | Implementation phase | Required verification |
| --- | --- | --- |
| Registration and password reset | 03 | Approved sender, safe recovery links, delivery/failure handling |
| Order confirmation, cancellation, shipment, delivery completion | 06 | Accurate order references/statuses; retry without repeating the business transition |
| Payment success or failure | 07 | Provider-verified status; no duplicate messages for repeated callbacks |
| Return request update; refund approval, rejection, completion | 08 | Separate return/refund statuses and confirmed payout before completion notice |

Phase 10 verifies event coverage, failed delivery/retries, deduplication, and customer-facing content across these phases.

### 9.4 Media, design, and external configuration

Cloudinary and email credentials remain server-only. Validate permitted upload formats, size, access, and cleanup. Storefront and admin share semantic design tokens and BDT conventions without importing each other's runtime. Operator-supplied product photos, policy copy, store branding, delivery configuration, and enabled payment channels must be loaded from approved content or backend settings rather than invented in the UI.

### 9.5 Integration acceptance examples

A product created in Admin appears in public catalog only when active; changed stock is reflected on API refresh and always revalidated at checkout. A COD order commits stock without marking collection Paid; a gateway return shows pending verification until the backend confirms payment. A cancelled paid order produces an eligible refund record without automatically marking a payout completed. A verified guest sees only that order and its eligible actions.

---

## 10. Security & quality assurance

### 10.1 Quality checks by layer

| Layer | Required verification |
| --- | --- |
| Domain unit tests | Pricing/rounding, discount allocation, capacity rules, state machines, refund limits |
| Persistence/integration | MongoDB transactions/indexes, conditional stock writes, reservations, idempotency, sessions |
| API/contract | Validation, status codes, stable errors, ownership, pagination, provider adapter behavior |
| Storefront/admin integration | Real API-backed forms, accessible states, routing, theme consistency |
| End-to-end | Guest/COD, online hosted gateway in test mode, fulfillment, return/refund, admin recovery |
| Security | Session isolation, CSRF, Origin/CORS, recovery-token abuse, guest proof, upload, privilege boundaries |
| Reliability | Duplicate/missing callbacks, delayed jobs, restart/reconcile, backup and restore |
| Performance/accessibility | Catalog/query performance; checkout; keyboard, screen reader, contrast, responsive reflow |

### 10.2 Financial and inventory risk tests

[Testing](./TESTING.md) owns reproducible procedures for the architecture's critical scenarios. Phase 10 requires linked evidence for final-unit/coupon contention, duplicate checkout, hold expiry, late payment, paid-after-cancellation, forged/missing/repeated callbacks, overlapping paid attempts, risk review, COD collection, cancellation and final non-delivery, physical/shortage claims, refund capacity and unknown payout, inspected restock, and guest/customer/admin isolation. Feature phases exercise the relevant subset continuously. Missing mandatory evidence blocks the corresponding gate.

### 10.3 UI, accessibility, and content acceptance

Verify responsive layouts, semantic landmarks, keyboard-only task completion, visible focus, dialog focus management, properly associated field errors, meaningful status text, image alternatives, and reduced-motion behavior. Test critical storefront and admin journeys in both light and dark modes. Maintain `#2563EB` blue primary buttons with white text in both modes, while applying the design's dark-mode readable link text and blue indicators. Verify prices, payment/return/refund statuses, deadlines, and warnings never rely only on color.

Do not publish placeholder legal policies, merchant activation claims, unsupported courier tracking, or unverified delivery/refund promises. Separate estimated delivery dates from applicable deadlines. Keep explicit unresolved-payment and unresolved-refund messages.

### 10.4 Defect severity and acceptance rules

Block release for a defect that can permit unauthorized access, duplicate/incorrect collection or payout, overselling, incorrect coupon redemption, irrecoverable checkout failure, misleading verified-payment status, unprotected secrets, or inability to recover critical data. Other defects are triaged against affected PRD criteria and explicitly approved before release; no generic “known issue” waiver can override a mandatory acceptance gate.

---

## 11. Milestones & acceptance gates

| Milestone | Evidence required | Decision |
| --- | --- | --- |
| M1 — Foundation Ready | Builds/type checks, API/DB health, session separation, baseline CI and token tests | Approve feature slices |
| M2 — Catalog Ready | Admin CRUD, unique SKU/slug, stock invariants, public search/variant flows | Approve shopping work |
| M3 — COD Commerce Ready | Guest/customer checkout, accurate quote, duplicate safety, stock/coupon commitment, order/guest access | Approve provider integration |
| M4 — Payment Ready | Gateway sandbox verification, IPN/retry/reconcile, late pay, risk hold, duplicate-collection evidence | Approve financial after-sales integration |
| M5 — After-Sales Ready | Valid return/inspection, refund caps and allocation, verified gateway/manual payout, audit history | Approve final admin/report review |
| M6 — Feature Complete / Release Candidate | FR-01–FR-34 coverage, completed required admin UI, NFR/security/accessibility/concurrency regression on staging | Approve production-candidate promotion |
| M7 — Production Ready | Approved policies/merchant channels, HTTPS, rollback, backup/restore, monitoring, live-safe smoke checks | Authorize production launch |
| M8 — Handover Accepted | Repository, configuration, runbooks, operator guide, ownership, support boundaries, known limitations | Close implementation |

Engineering can proceed on independent tasks before earlier milestones are accepted. Acceptance of M2 requires M1; M3 requires M2 and shopping readiness; M4 requires M3; M5 requires M4; M6 requires M1–M5 and integrated staging; M7 requires M6; M8 requires M7 and completed handover review. These are acceptance dependencies, not a blanket prohibition on parallel development.

A milestone requires affirmative acceptance evidence. An engineering build passing CI is necessary but not sufficient for a financial or production milestone. Record test run/artifact references, environments, approver, unresolved dependencies, and release decision alongside the tasks or acceptance report.

---

## 12. Environments & deployment

### 12.1 Environment boundaries

Architecture §13 owns topology and environment isolation. [Operations](./OPERATIONS.md) owns setup, configuration, access and recovery procedures; platform-specific commands, exact keys and named owners still require decisions and verification. Local and staging use non-production data and test providers; production uses approved live configuration. Configuration validation, secret isolation, and safe logs are prerequisites in every environment.

### 12.2 Continuous integration and deployment

- CI runs lint, type checking, applicable tests, and separate storefront/admin/backend builds before promotion.
- Deployment verifies schema/index compatibility and any safe data/configuration migration before serving dependent code.
- Provision and deploy integrated staging before Phase 10; validate deployed origins for credentialed cookies, CORS/CSRF, payment IPNs, hosted returns, guest links, and administrator sessions.
- Production release proceeds only after explicit acceptance; record artifact/version, environment changes, secrets-rotation needs, and rollback trigger.
- Use health/readiness probes, structured log correlation, error/availability monitoring, durable worker execution, and a tested restoration procedure.

### 12.3 Rollback and financial recovery

Application rollback must not erase already-collected funds, finalized payments, inventory movements, customer orders, pending refund commitments, or audit logs. For a payment/refund incident, disable unsafe new actions when necessary, preserve event history, reconcile with the provider, and authorize resolution through existing business workflows. Database restoration requires consistency review for payments and callbacks received after the backup snapshot.

### 12.4 Launch-readiness conditions

Confirm production administrator ownership, live merchant channel activation and limits, refund method, acceptable published policies, real product and stock data, delivery coverage/charges, verified support contact, email sender, customer-facing legal information, backups, monitoring, operational escalation, and the full PRD §14/§18 acceptance set. Actual legal compliance and external provider capabilities require current external/operator verification; approved code alone does not establish them.

---

## 13. Risks & change management

### 13.1 Risk register

| Risk | Impact | Mitigation / decision gate |
| --- | --- | --- |
| Merchant channel or refund feature unavailable | Online method/refund cannot be accepted | Validate early; implement only activated channels; document supported manual resolution |
| Standalone/nontransactional MongoDB setup | Race conditions cannot be safely tested or enforced | Require replica-set transactions for coupled changes; prove with integration tests |
| Duplicate/late/out-of-order gateway events | Duplicate collection effects or incorrect fulfillment | Persist attempts, verify provider status, guard transitions, reconcile asynchronously |
| Reservation/coupon races | Overselling or breached coupon limits | Atomic capacity checks, transaction coordination, final-unit concurrency tests |
| Incomplete purchase-time snapshots | Incorrect returns/refunds and audit history | Immutable order/item/discount/delivery snapshots before financial acceptance |
| Admin authorization/CSRF mistakes | Unauthorized operational or financial action | Separate sessions, per-resource checks, CSRF/Origin tests, audit logging |
| Guest verification weakness | Customer data exposure | Expiring single-use email proof and scoped access, non-enumeration, rate limits |
| Unapproved policy or delivery promise | Misleading user content or operational/legal risk | Store-owner approval and current law verification before publishing |
| Missing product, support, and delivery configuration | Incomplete commerce experience | Track owner-supplied configuration as a launch prerequisite |
| Unreliable notifications or jobs | Missed communication, unresolved attempts | Durable intents/leases, bounded retry, monitoring and operational recovery |
| Refund uncertainty and overcommitment | Financial loss or incorrect Completed status | Reserve balance, retain attempts, verify transfer/payout before completion |
| Production failure without recovery plan | Service or data loss | Tested backups/restoration, rollback, alerts, incident playbook |

### 13.2 Change control

Every change request records the requested behavior, justification, source sections affected, impacted modules/pages, security/financial implications, testing impact, priority, and approval decision. Update the approved source document first when its contract changes; then revise this plan and dependent task records. Do not change the architecture, theme tokens, stock/payment/refund invariants, or scope only because an agent suggests a simpler implementation.

### 13.3 Blocker reporting

A blocker record includes the missing evidence or capability, affected phase/requirements, reason it prevents acceptance, responsible decision-maker, temporary safe workaround if any, and next verification action. Continue independent work when possible. Never represent a sandbox-only payment, mock email, placeholder policy, or unsupported refund pathway as live-ready.

---

## 14. Completion & handover

### 14.1 Final implementation acceptance

SportZone implementation is complete only when all initial-release PRD functional/acceptance requirements are evidenced, non-functional requirements are adequately verified, the approved interfaces are operational in supported viewports/themes, the production payment/return/refund obligations are handled safely, and the required operational/handover conditions are met. No excluded feature is needed to close initial release.

### 14.2 Final delivery checklist

- [ ] Source, workspace applications, API, migrations/index setup, and reproducible builds are handed over.
- [ ] FR-01–FR-34 and PRD §14 acceptance evidence is linked and reviewed.
- [ ] Critical money, stock, coupon, guest access, and state-transition tests pass.
- [ ] Storefront/admin responsive, accessibility, and theme checks pass in both modes.
- [ ] Production payment-channel activation and supported refund/collection workflows are verified.
- [ ] Approved catalog, delivery settings, store information, and policies are published.
- [ ] Monitoring, job reconciliation, logs, backups/restoration, and incident recovery are verified.
- [ ] Administrator/operator and external-service account ownership is confirmed.
- [ ] All twelve planned documentation files are current: README, AGENTS, CHANGELOG, PRD, DESIGN, ARCHITECTURE, DATABASE, API, IMPLEMENTATION_PLAN, TASKS, TESTING, and OPERATIONS; environment/runbook/operator sections and known limitations match delivery.
- [ ] Remaining maintenance/support responsibilities and final handover acceptance are recorded.

### 14.3 Relationship to `TASKS.md`

This plan establishes **what to implement, in which dependency order, and with what acceptance evidence**. `TASKS.md` should contain individual work items and their execution status. A task may be marked complete only when its applicable Definition of Done is met; a phase is complete only when its exit gate and linked milestones have passed. Revisions to task breakdown may not silently change the PRD, architecture, design, or this implementation baseline.
