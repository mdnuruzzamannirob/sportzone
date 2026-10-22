# SportZone — Project structure and coding conventions

**Updated:** 22 October 2026
**Decision owner:** Project owner, through the request to adopt the final structure in documentation.
**State:** Documentation accepted by project owner on 22 October 2026 ([P01-018 acceptance](./evidence/P01-018-project-structure.md#owner-acceptance)); application refactors remain separate acceptance steps.

Architecture §4 delegates detailed source organization to this document. Product scope, API contracts,
collection/index identities and operational gates retain their owning specifications. This is a target
map, not evidence that a directory, script, provider or feature is implemented. Create files when needed.
Existing uppercase specification filenames and links remain canonical; no document renaming is required.

## 1. Workspace layout

```text
sportzone/
├── storefront/                  # Next.js customer application
├── admin/                       # React/Vite administration application
├── backend/                     # Express business API and jobs
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── PROJECT_STRUCTURE.md
│   ├── API.md
│   ├── DATABASE.md
│   ├── DESIGN.md
│   ├── IMPLEMENTATION_PLAN.md
│   ├── TASKS.md
│   ├── TESTING.md
│   ├── OPERATIONS.md
│   ├── decisions/               # Meaningful decisions when needed
│   └── evidence/
├── scripts/                     # Repository/dev/CI orchestration
├── tests/e2e/                   # Target cross-app browser journeys
├── .github/workflows/
├── AGENTS.md
├── README.md
├── CHANGELOG.md
├── .env.example
├── .gitignore
├── .nvmrc
├── biome.json
├── package.json                 # npm workspaces
└── package-lock.json            # One locked dependency graph
```

No apps/ relocation, speculative shared package, second lockfile, new component library or build
orchestrator. Existing root shared pure utilities and tests/ui remain supported until their consumers,
runner configuration and CI inventory are migrated together; this decision does not authorize deleting them.

## 2. Backend

```text
backend/
├── src/
│   ├── server.ts                # Configuration/connection/listen/shutdown lifecycle
│   ├── app.ts                   # Express construction, middleware and errors
│   ├── routes.ts                # Feature-router registration under /api/v1
│   ├── setup.ts                 # Wire typed config, services, models and clients
│   ├── config/
│   │   ├── env.ts
│   │   ├── database.ts          # Database connection lifecycle
│   │   ├── security.ts
│   │   ├── payments.ts
│   │   ├── media.ts
│   │   └── notifications.ts
│   ├── modules/
│   │   ├── auth/
│   │   ├── customers/
│   │   ├── catalog/
│   │   │   ├── products/
│   │   │   ├── variants/
│   │   │   └── categories/
│   │   ├── inventory/
│   │   ├── cart/                # Cart and wishlist subfeatures
│   │   ├── promotions/          # Coupons/discounts, no new promotion scope
│   │   ├── checkout/
│   │   ├── orders/
│   │   ├── payments/
│   │   ├── returns/
│   │   ├── refunds/
│   │   ├── reviews/
│   │   ├── delivery/
│   │   ├── media/
│   │   ├── notifications/
│   │   ├── support/
│   │   ├── settings/
│   │   ├── reporting/           # Existing dashboard/report aggregation
│   │   ├── audit/               # Existing durable audit responsibility
│   │   └── health/
│   ├── providers/
│   │   ├── cloudinary/
│   │   │   ├── cloudinary.client.ts
│   │   │   └── cloudinary.schema.ts
│   │   ├── sslcommerz/
│   │   │   ├── sslcommerz.client.ts
│   │   │   └── sslcommerz.schema.ts
│   │   ├── email/resend.client.ts
│   │   └── antivirus/clamav.client.ts
│   ├── jobs/                    # Thin coordinators calling domain services
│   │   ├── expire-checkout.job.ts
│   │   ├── expire-reservations.job.ts
│   │   ├── reconcile-payments.job.ts
│   │   ├── reconcile-refunds.job.ts
│   │   ├── send-notifications.job.ts
│   │   └── cleanup-media.job.ts
│   └── shared/
│       ├── errors/app-error.ts
│       ├── middleware/
│       │   ├── authenticate.ts
│       │   ├── require-admin.ts
│       │   ├── verify-csrf.ts
│       │   ├── rate-limit.ts
│       │   ├── validate.ts
│       │   ├── request-context.ts
│       │   └── handle-error.ts
│       ├── database/
│       │   ├── transaction.ts
│       │   └── indexes.ts
│       ├── logger.ts
│       ├── pagination.ts
│       └── money.ts
├── tests/
│   ├── unit/                    # Feature-organized
│   ├── integration/             # Feature-organized
│   ├── fixtures/
│   └── helpers/
├── scripts/
│   ├── provision-admin.ts
│   ├── seed-development.ts
│   ├── migrate.ts
│   ├── run-job.ts
│   └── migrations/
├── package.json
├── tsconfig.json
├── tsconfig.build.json
├── vitest.config.ts
└── vitest.integration.config.ts
```

These names are targets, not new commands. Preserve live operator entry points or provide tested
compatibility during moves. app.ts has no implicit DB connection/listen side effect. Config parses
once and returns typed options; setup constructs dependencies. Services do not read process.env.
Route registration and provider construction for multiple domains do not belong inside auth.

### 2.1 Module ownership

| Module | Responsibility |
| --- | --- |
| auth | Customer/admin credentials, sessions, recovery, verification, scoped guest access |
| customers | Profiles, addresses, customer administration; no credential authority |
| catalog | Products, variants, categories, descriptions and base/sale prices |
| inventory | Counters, reservations, commitments and movements through stock-only capabilities |
| cart | Cart and wishlist; neither reserves stock |
| promotions | Existing coupons, eligibility, limits and deterministic discounts |
| checkout | Authoritative quotes and submission coordination |
| orders | Historical snapshots, lifecycle, cancellation and fulfillment |
| payments | Attempts, independently verified receipts, allocation and COD collection |
| returns | Physical-return/shortage claims and inspection |
| refunds | Obligations/source limits, payout attempts and reconciliation |
| reviews | Purchase qualification, moderation, rating projections |
| delivery | Coverage, zones and charge rules |
| media | Ownership/intents, scanning, references, private access and safe cleanup |
| notifications | Durable intent, deduplication, templates, delivery and retries |
| support | Existing complaints and support records |
| settings | Store configuration, policies and homepage content |
| reporting | Read aggregation; never a second source of financial/stock authority |
| audit | Existing audit records; distinct from diagnostic logging |
| health | Liveness and restricted readiness |

Target grouping does not add a feature, endpoint, collection or provider. users has one auth-owned
registration. productVariants has one catalog-owned registration; inventory receives only stock
operations. Cross-module coordination uses public services/capabilities and a shared transaction context.

### 2.2 Cohesive files

```text
modules/reviews/
├── review.routes.ts
├── review.controller.ts
├── review.schema.ts
├── review.service.ts
├── review.model.ts
└── review.types.ts
```

Routes bind endpoint/middleware; controllers map HTTP input/output; schema files validate inputs;
services enforce business rules/ownership and coordinate transactions; models own schemas/indexes.
Optional .dto.ts, .policy.ts and .persistence.ts require an actual projection, reusable rule or
persistence/bootstrap need. Derive types when safe; request input, response DTO and stored document
are distinct. Do not create empty files or repositories/base classes just to match a template.

Large modules use responsibility subfeatures: auth/credentials, sessions, recovery, verification,
guest-access; catalog/products, variants, categories. Auth retains one user model. Media separates
upload.service.ts, attachment.service.ts, access.service.ts and cleanup.service.ts; shared media
model/schema/types stay at module root. Payments separates verification, reconciliation, allocation
and COD operations where implemented. Notifications owns templates and durable delivery; provider
transport remains in providers/. Split by responsibility, not a fixed line-count threshold.

### 2.3 Import and execution rules

Route → admission/validation → controller → service → owned persistence or provider → response.

- Controllers never import models; services never receive Express req/res.
- A module never imports another module's private model/persistence. Explicit public capabilities
  replace raw model injection. Nested catalog subfeatures still have distinct stock/media boundaries.
- shared imports no business module. Providers implement protocols and validate responses, not
  business eligibility or funding decisions; they receive typed configuration.
- Provider clients may import public type-only protocol interfaces, never domain model/service implementations.
- Jobs call domain services, not HTTP endpoints or bypassing raw stock/financial writes.
- External calls stay outside MongoDB transactions and retry callbacks. Transaction participants
  share the coordinator session and do not open nested transactions.
- No frontend imports backend runtime/models, secrets or privileged provider clients.
- No broad barrel exports, circular dependencies, generic repository/DI/event-bus infrastructure
  or second shared/helpers/common/utils bucket without demonstrated need.

## 3. Storefront and admin

```text
storefront/src/
├── app/
│   ├── (shop)/                   # Home, products, categories, search, cart, wishlist, checkout
│   ├── (auth)/                   # Login/register/verification/recovery
│   ├── (account)/
│   │   └── account/
│   │       ├── page.tsx
│   │       ├── orders/
│   │       ├── addresses/
│   │       ├── returns/
│   │       └── settings/
│   ├── (guest)/                  # Guest proof and scoped order journeys
│   ├── (information)/            # Contact, support, policy pages
│   ├── layout.tsx
│   ├── providers.tsx
│   ├── loading.tsx
│   ├── error.tsx
│   ├── not-found.tsx
│   ├── sitemap.ts
│   └── robots.ts
├── features/                     # Feature-owned views/API/hooks/forms
├── components/
│   ├── ui/                       # HeroUI facade, navigation adapters and theme
│   └── layout/                   # Header/footer/shells
├── lib/
│   ├── api-client.ts
│   ├── api-server.ts             # Enforced server-only public transport
│   ├── api-error.ts
│   ├── query-client.ts
│   └── format.ts
└── styles/globals.css

admin/src/
├── app/
│   ├── router.tsx
│   ├── providers.tsx
│   └── require-admin.tsx
├── features/
├── components/
│   ├── ui/
│   └── layout/
├── lib/
│   ├── api-client.ts
│   ├── api-error.ts
│   ├── query-client.ts
│   └── format.ts
├── styles/globals.css
└── main.tsx
```

The annotated (account)/account/ is two physical directory levels, not a repeated URL segment:
(account) is an organization-only route group; account contributes /account. For example, the target
orders/page.tsx location gives /account/orders, not /account/account/orders. The account layout
composes shared chrome and session UX; Express still authorizes every request. Keep all existing
approved order-detail, claim, verification, payment-return and guest URLs; a route map must precede
moves. Group names do not authorize access, imply cache safety or remove guest checkout.

Storefront features: home, auth, catalog, cart, wishlist, checkout, orders, payments, account,
guest-access, reviews, returns, support, policies. Refund status may be composed into the owning
order/return views without a speculative standalone feature. Admin features: auth, dashboard,
catalog/products, catalog/categories, inventory, orders, payments, returns, refunds, customers,
promotions, reviews, delivery, support, settings. No new brand/notification administration.

Small features stay flat: product-list.tsx, product-details.tsx, product-card.tsx, product.api.ts,
product.hooks.ts, product.schema.ts, product.types.ts. Admin adds product-list-page.tsx,
product-create-page.tsx, product-edit-page.tsx, product-form.tsx and product-table.tsx as needed.
Large features may gain components/api/hooks subfolders. Create/edit reuse one form.

Routes compose feature views and metadata, not business calculations. Feature API files own endpoint
functions; lib owns transport/CSRF/error handling. Keep server and browser imports separate. Private
queries are not shared-cacheable; identity change clears private query state. Financial mutations
have no automatic retry. Existing TanStack Query/Zod and native HeroUI policy remain unchanged.
Only components/ui imports HeroUI, with app-owned Link adapters, default themes/system fonts and
visible accessible states. globals.css forwards theme entry points. Existing reusable commerce/
management compositions are retained until a verified placement decision; do not flatten/delete
working reusable components to fill the diagram. Feature-specific code stays in its feature.

## 4. Naming

| Item | Convention / example |
| --- | --- |
| Folders/files | kebab-case; guest-access/, payment-receipt.model.ts |
| Responsibility suffixes | .routes, .controller, .schema, .service, .model, .types; optional .dto/.policy/.persistence |
| Provider files | provider.client.ts for transport; provider.schema.ts for protocol validation |
| Components/types/interfaces | PascalCase: ProductForm, Order, CreateOrderInput; no I prefix |
| Functions/variables | camelCase, action-specific: reserveStock, verifyReceipt |
| Zod inputs/hooks | createOrderSchema; useOrders |
| Constants/environment | Fixed global constants and env keys UPPER_SNAKE_CASE |
| Entities/resources | Singular entity filenames; plural collection/HTTP resource names per existing contracts |
| Units | regularPricePoisha, timeoutMs, ttlSeconds, reservedQuantity |
| Flags/dates/IDs | isActive/hasStock/canCancel; expiresAt; orderId/providerTransactionId |
| Tests | .test.ts for unit/integration; .spec.ts for browser journeys |
| Framework/compatibility exceptions | page.tsx/layout.tsx/main.tsx; NodeNext .js imports; retained specification filenames |

Avoid misc.ts/manager.ts/processData, redundant handwritten types, speculative shared abstractions
and automatic index.ts barrels. API status/error/pagination/idempotency/If-Match conventions and
integer-poisha/immutable snapshot/unique-index rules remain governed by API/Database, not filenames.

## 5. Tests, tools and ongoing enforcement

Workspace tests live outside src/, grouped by feature under tests/unit and tests/integration;
fixtures hold synthetic data, helpers hold harness code. Root tests/e2e groups customer/admin browser
journeys. Preserve the existing accessibility/theme/browser matrix when tests/ui migrates. Pure rules,
real HTTP/replica-set behavior, provider doubles and actual staging evidence remain distinct.

Root scripts orchestrate projects; backend/scripts contains thin bootstrap/migration/operator entry
points. Migrations are ordered/reviewable and preserve identities/history. Jobs use durable claims,
idempotent transitions and explicit unknown-outcome reconciliation. Config/paths never prove service
activation, actual scanner coverage, merchant capability or release acceptance.

Before editing, classify the owner and target path. During each app refactor update executable
import-boundary checks, runner globs, script paths, aliases and fail-closed CI inventory together.
Required checks must cover frontend/backend isolation, foreign persistence, controllers→models,
shared→modules and provider/business separation as applicable; no passing placeholders. These
expanded automated checks are deliverables of P03-021/P02-015/P02-016, not claimed implemented here.
Future feature review must include placement/dependency/naming compliance plus behavioral checks.
Use existing scripts until their replacements are actually implemented and verified. Exceptions need
an explicit architecture decision and affected checks, not an incidental code comment.

Refactor sequence: documentation reconciliation → backend → storefront → admin. Complete and review
one application before beginning the next. Preserve API URLs/DTOs/session/CSRF, collection/index
identities, operational commands and historical acceptance; source moves do not clear EXT-04 or
other release gates. See Implementation Plan §3.6 and TASKS P01-018/P03-021/P02-015/P02-016.
