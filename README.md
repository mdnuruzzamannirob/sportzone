# SportZone

**Version:** 1.0\
**Status:** Final development baseline\
**Updated:** 21 October 2026

Single-store sports e-commerce platform for Bangladesh, using BDT. SportZone combines a customer storefront, a separate
administration portal and one authoritative backend API.

## Contents

- [SportZone](#sportzone)
  - [Contents](#contents)
  - [1. Product overview](#1-product-overview)
  - [2. Architecture and technology](#2-architecture-and-technology)
  - [3. Repository structure](#3-repository-structure)
  - [4. Development workflow](#4-development-workflow)
  - [5. Configuration and verification](#5-configuration-and-verification)
  - [6. Delivery and operations](#6-delivery-and-operations)
  - [7. Documentation map](#7-documentation-map)

## 1. Product overview

The initial release supports guest and registered shopping, products and variants, carts, wishlists, coupons, verified
reviews, order tracking, manual fulfillment, cancellation, returns, refunds and store administration.

Required payment methods are bKash, Nagad and Rocket through SSLCOMMERZ hosted checkout, plus store-managed Cash on
Delivery. Inactive channels are hidden; launch acceptance requires all four methods under [PRD §3.3](docs/PRD.md#33-release-boundaries).
Delivery is Bangladesh-only. Multi-vendor operations, native mobile apps, automated courier integration, live GPS tracking,
loyalty and international shipping are outside the initial release.

## 2. Architecture and technology

| Application / service | Technology                                               | Responsibility                                              |
| --------------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Storefront            | Next.js App Router, React, TypeScript, Tailwind CSS      | Customer presentation, public rendering and API consumption |
| Administration        | React, Vite, TypeScript, Tailwind CSS                    | Store-management interface                                  |
| Backend               | Node.js, Express, TypeScript                             | Authentication and authoritative business services          |
| Persistence           | MongoDB, Mongoose                                        | Indexed records, conditional writes and transactions        |
| Payments              | SSLCOMMERZ and internal COD workflow                     | Verified collections, attempts and reconciliation           |
| Media / email         | Cloudinary / Resend or equivalent transactional provider | Controlled uploads and durable message delivery             |
| Repository            | npm workspaces                                           | Independent application builds and shared quality commands  |

The Express `/api/v1` API owns prices, stock, permissions, order transitions, payment verification and refunds. Frontends
consume allowlisted DTOs. Private sessions, carts, checkout, orders and financial data never enter shared caches.

## 3. Repository structure

The repository contains the documentation set, runnable Next.js storefront, React/Vite admin and TypeScript Express API scaffolds. Business APIs and persistence follow their Phase 03–09 tasks.

```text
sportzone/
├── storefront/                 # Next.js App Router scaffold, styles and tests
├── admin/                      # React/Vite SPA scaffold, styles and tests
├── backend/                    # Express API, identity/notification implementations and tests
├── shared/format-bdt.ts         # Pure integer-poisha display formatter
├── docs/                       # Product and engineering specifications
├── README.md
├── AGENTS.md
├── CHANGELOG.md
├── .gitignore
├── .npmrc                      # Reject unsupported runtime/tool versions
├── .nvmrc                      # Verified Node.js patch
├── .env.example
├── package.json                # Private npm workspace root
└── package-lock.json           # Locked workspace links
```

[Architecture §4](docs/ARCHITECTURE.md#4-project-structure) defines application/module boundaries.

Architecture §§4–6,14 define feature-based UIs, a module-based layered backend and npm-workspaces engineering policy.
Target backend modules use `<entity>.model/validation/service/controller/routes/types.ts`; UI shells belong to
`components/layout/`, feature behavior to `features/`, and reusable HeroUI/commerce/management compositions retain
their shared ownership. Current code is migrated incrementally; the CLI commands below describe implemented setup.

[Implementation Plan §3.6](docs/IMPLEMENTATION_PLAN.md#36-engineering-foundation-and-incremental-refactor) sequences
P01-015 contract review, P01-016–017 tooling, P03-019–020 backend and P02-012–013 UI refactors.
[Operations §5](docs/OPERATIONS.md#5-cicd--deployment-procedures) defines target CI/release controls; the existing workflow
remains the operational reference until verified replacement. P03-015 introduces pinned TanStack Query 5.104.5 and frontend Zod 4.6.7 for the implemented identity forms. [Verification record](docs/evidence/P01-015-structure-decision.md).

## 4. Development workflow

### Local UI component preview

Run `npm run ui:showcase`, then open [the single UI preview](http://127.0.0.1:5180/showcase.html).
Use Admin/Storefront and Light/Dark toggles to inspect the actual app-owned `components/ui/`
modules, native variants and application compositions. Each app loads its own `ui/theme.css`;
switching apps reloads the selected theme entry to avoid style leakage. No backend, database,
sign-in or app build is needed. Stop this local server before a browser suite reserves port 5180.
This development tool is not part of either production app’s routes.


1. Read [AGENTS](AGENTS.md), the assigned [task](docs/TASKS.md) and its owning contracts.
2. Install the workspace with the toolchain below; inspect implemented code and target refactor tasks before moving existing foundations.
3. Configure isolated local/test resources, a transaction-capable MongoDB replica set and sandbox integrations.
4. Implement each feature with its API/data contracts, required UI states, tests and operating controls.
5. Run applicable checks, review the diff and attach evidence before task acceptance.

Verified toolchain: **Node.js 24.20.0 / npm 11.19.0**. `.nvmrc` selects the Node patch; `packageManager` records npm.
The engine ranges permit compatible updates within Node 24 / npm 11 and `.npmrc` enforces those ranges. If using nvm,
select the installed version with `nvm use`; otherwise provide these versions through your runtime manager.

From the repository root:

```sh
node --version
npm --version
npm ci
npm run workspaces:check
npm pkg get name private --workspaces
npm run
```

The install links the three workspaces and installs the storefront's exact locked dependencies. Initial installation
requires npm registry access; offline installation works only with a complete matching package cache.
`workspaces:check` lists `storefront`, `admin` and `backend` without missing dependencies.

Start an isolated local replica set in a separate terminal with `npm run db:local --workspace=backend`.
Prepare private local configuration using [.env.example](.env.example), including that replica's URI and two
independently generated secrets. Never use a production database. Then run:

```sh
npm run dev
```

The Linux/macOS/WSL coordinator starts both UI servers and the backend TypeScript watch compiler.
The first successful compilation starts the API; subsequent successful builds restart it gracefully.
Storefront uses 3000, admin 5173 and the API defaults to 4000. Only the API loads an optional root `.env`;
existing process variables take precedence. API startup validates configuration before database/HTTP access.
No credentials, database or workers are created automatically. Ctrl-C or a child failure terminates owned
process groups, with a 12-second grace period before forced cleanup. Compilation errors remain visible
and retain the last successful API process; an API runtime exit stops the coordinator. Run workspaces
individually when debugging one app. The separate database terminal has its own shutdown lifecycle.

`npm run lint:boundaries` checks application source imports and transitive browser boundaries.
`npm run format:check` checks the scoped new tooling baseline; `npm run format` formats those files only.
Existing app formatting is adopted with each refactor rather than rewriting all legacy files now.

Both frontends use HeroUI v3 (`@heroui/react` and `@heroui/styles`, locked to 3.2.6) with Tailwind CSS v4.
Each app’s global CSS imports `src/components/ui/theme.css`, which imports Tailwind and native HeroUI styles.
All HeroUI imports are confined to `components/ui/`; fonts, colors and styles remain the library defaults.
App-owned Button defaults live in `src/components/ui/button.tsx`. HeroUI Link adapters preserve native anchors and app routing; Select, Disclosure, Card, Alert and Spinner
provide the existing controls, panels and feedback states. See [Design](docs/DESIGN.md#2-design-system) for visual direction and component conventions.

App-owned form/feedback primitives and their state/validation conventions are described in [UI components](docs/UI_COMPONENTS.md).

Storefront commerce primitives live in `src/components/commerce/`; see the [commerce usage contracts](docs/UI_COMPONENTS.md#commerce-compositions).
They are presentation foundations; catalog/cart/checkout routes retain their separate real-data integration tasks.

Admin management foundations live in `admin/src/components/management/`; see the [component guide](docs/UI_COMPONENTS.md#admin-management-compositions) for server-owned list data, upload constraints and guarded-action integration.

Browser foundation audits use Playwright and axe. After building both apps, run `npx playwright install --with-deps chromium firefox webkit`, then `npm run test:ui`. The root browser inventory runs the same audit; admin's `test:a11y` remains a compatibility alias. Tests reserve loopback ports 3100, 5273 and 5180; the component fixture is never included in application builds. Reports and screenshots are generated under `test-results/`. See [audit scope and environment notes](docs/evidence/P02-011-accessibility.md).

Current root checks:

```sh
npm run lint
npm run test:unit
npm run ci
```

`lint` checks source JavaScript syntax, JSON, whitespace, Markdown tables/local links and targeted credential patterns.
`test:unit` runs the CI guard regression tests using Node's test runner. `ci` runs workspace discovery, repository lint,
tooling tests and every configured application check; it writes `test-results/ci.json`, including explicit workspace states.
All three workspaces are active in CI. Backend checks cover transport, builds and isolated database/identity persistence primitives; they do not establish integrated authentication, commerce or release readiness.

Backend commands, from the repository root:

```sh
npm run lint --workspace=backend
npm run typecheck --workspace=backend
npm run test:unit --workspace=backend
npm run build --workspace=backend
npm run test:smoke --workspace=backend
npm run start --workspace=backend
```

Identity models and persistence primitives live in `backend/src/modules/auth/`. Collection validators/index bootstrap is
explicit, never automatic HTTP startup; existing database changes require the documented migration process. Tests use
synthetic accounts/digests on an owned replica. Customer activation is described below; administrator credentials remain separate. See
[identity persistence evidence](docs/evidence/P03-004-identity-models.md).

Customer/admin session service and cookie adapter are implemented in `backend/src/modules/auth/`. They require explicit
session lifetime/SameSite settings validated once by `loadEnvironment` into typed identity options; no values are supplied as
defaults. Tokens are opaque and hashed at rest; issuance, rotation and revocation are verified with real MongoDB fixtures.
Customer credential routes can be activated as described below; administrator credential integration remains separate. Origin/CORS/CSRF guards and bootstrap router are available through `createBrowserSecurity` and
`browserSecurityRoutes`; the configuration boundary validates explicit `BROWSER_CONTEXT_TTL_SECONDS` (1–1800); identity composition mounts that router,
and apply the route-selected protection before exposing mutations. Guest order persistence remains P06-015. See [session evidence](docs/evidence/P03-005-sessions.md).

Customer authentication is available with `CUSTOMER_AUTH_ENABLED=true` after explicit local/test persistence setup.
Set the existing session TTL/SameSite and browser context settings, build the backend, then run
`node --env-file=.env backend/tools/bootstrap-identity.mjs`. This additive tool accepts only APP_ENV local/test;
existing incompatible validators require a reviewed migration. Set the flag and start the normal server; startup verifies
validators/indexes without modifying them. Registration/login/logout/session and CSRF bootstrap routes then run under
`/api/v1`. The default flag is false. Profile/address/deletion-intake APIs share that activation. Current active delivery rules govern saved-address eligibility;
missing coverage fails closed. Phone input is validated locally against Bangladesh numbering metadata and stored as E.164.
Deletion intake requires verified email and never deletes an account or historical records. P03-014 adds shared MongoDB auth/recovery quotas and secret-free security event reasons; explicit identity bootstrap now also prepares `authRateLimits`. Startup fails closed on missing protection state. See [rollout and proxy/collector gates](docs/OPERATIONS.md#p03-014-shared-auth-throttle-rollout). Frontend integration and deployed acceptance remain their owning tasks. New passwords follow the owner-approved 12–128-character/512-byte policy.

Registration email delivery has a separate, disabled-by-default worker. After building, use
`node --env-file=.env backend/tools/notification-worker.mjs` with the explicit protected email/retry configuration.
Existing local/test notification collections require the explicit additive command
`node --env-file=.env backend/tools/migrate-notifications.mjs`; startup does not migrate. Nonproduction sends are redirected
to an approved test inbox; no real email was sent by implementation tests. Unknown delivery outcomes stay uncertain.
See [Operations](docs/OPERATIONS.md#registration-notification-worker-and-recovery) for activation, migration and recovery.

Backend startup validates configuration, connects to a transaction-capable MongoDB, then opens HTTP. The default bind is loopback (`API_BIND_HOST=127.0.0.1`), port 4000. Copy `.env.example` to a private root `.env`, supply your local replica URI/database, and generate separate random 32-byte hex values for `SESSION_SECRET` and `HEALTH_MONITOR_TOKEN`. No secret value is supplied by the repository. From the root, after building, `node --env-file=.env backend/dist/server.js` explicitly loads that local file; `npm run start --workspace=backend` reads already injected process variables. For editing, use `npm run build:watch --workspace=backend` alongside `node --env-file=.env --watch backend/dist/server.js`.

`/api/v1/health/live` reports process liveness; `/api/v1/health/ready` requires the operational Bearer token. Readiness covers the current API/Mongo serving state, not completed commerce features or launch acceptance. Logs contain allowlisted metadata and server-generated correlation IDs. See [runtime configuration and health evidence](docs/evidence/P03-003-operations.md). Session service/cookie controls are delivered by P03-005; public credential routes and complete browser Origin/CORS/CSRF remain their owning integration tasks.

Database foundation commands:

```sh
npm run db:local --workspace=backend
npm run test:integration --workspace=backend
```

The local tool runs an ephemeral real MongoDB 8.0.16 replica set on loopback; stop it to discard its synthetic data. Integration tests start their own isolated replica and never use your `MONGODB_URI`. On Ubuntu 26, prefix these commands with `MONGOMS_DISTRO=ubuntu-24.04` to select the compatible binary. The first run downloads the pinned binary. Report: `test-results/database.json`. See [database foundation evidence](docs/evidence/P03-002-database.md). HTTP startup now uses these database primitives; see the runtime configuration section above.

Storefront commands, from the repository root:

```sh
npm run dev --workspace=storefront
npm run lint --workspace=storefront
npm run typecheck --workspace=storefront
npm run test:unit --workspace=storefront
npm run build --workspace=storefront
npm run test:smoke --workspace=storefront
npm run start --workspace=storefront
```

Dev/start bind to `127.0.0.1:3000`; stop one before starting the other. The production smoke command starts and cleans up
its own loopback server on an available port and requires a completed build. Development and builds use Next.js's supported
Webpack option. The scaffold includes public `/` and dynamic `/account` layouts; `/account` sends private/no-store and
noindex headers and displays only an unavailable-account placeholder. Authentication and Express integration follow in
Phase 03. The complete storefront, theme controls, typography and commerce flows remain owned by their later tasks.

Storefront public routes now share responsive header/footer navigation, a mobile disclosure with Escape/Close focus
recovery, Appearance menu, offline feedback and loading/error/not-found states. `/products`, `/search`, `/wishlist`,
`/cart`, `/contact`, `/support` and the five linked policy routes are explicit noindex unavailable placeholders. They
contain no catalog, cart, contact or approved policy data; those features retain their own task owners. Unknown URLs
return 404 with recovery/navigation. The private account presentation remains separate.

Admin commands, from the repository root:

```sh
npm run dev --workspace=admin
npm run lint --workspace=admin
npm run typecheck --workspace=admin
npm run test:unit --workspace=admin
npm run build --workspace=admin
npm run test:smoke --workspace=admin
npm run preview --workspace=admin
```

Admin dev/preview bind to `127.0.0.1:5173` and fail if that port is occupied. Preview and smoke require a completed build;
preview is local verification, not a production server. `/` redirects to `/login`; `/app` and its nested routes show access
unavailable until backend session verification is implemented. Client flags never grant access. Unknown public routes
show a recovery link. Static hosting must serve `dist/index.html` for SPA navigation URLs while preserving real asset/API
handling; configure noindex and private/no-store document headers at the host. Local Vite headers are not deployment proof.
P02-007 adds a desktop sidebar and HeroUI mobile Drawer with five groups and 14 presentation destinations, current-section
context, a title/action region, skip target, Appearance menu and offline feedback. All `/app/*` screens still deny access;
no business views, administrator identity or logout success are fabricated. The admin boundary loads as a separate route chunk
with a polite loading fallback. Backend session integration remains in Phase 03.

`.github/workflows/ci.yml` runs one job named `CI required result` on pushes, pull requests and manual dispatch.
It installs dependencies once, runs the shared inventory in order, and reuses the frontend builds for browser checks.
Actions remain commit-pinned with read-only permissions. Hosted execution and protected-main settings require separate verification.

Use `npm run ci` for complete integration verification. During development, run the affected test file or workspace
command; see [Testing §15.5](docs/TESTING.md#155-change-based-local-verification). A scope such as
`npm run ci -- --scope=backend` runs that workspace's checks. `--scope=browser` requires existing production builds
for both UIs and installed browser engines; it does not rebuild them. Reports are `test-results/ci.json` for full
runs and `test-results/ci/<scope>.json` for scoped runs. Native test reports retain case counts and diagnostics.

`npm run test:security` runs npm advisories and Gitleaks 8.30.1 against history and working files. Linux x64, Git,
tar and network access are required. The official release archive is checksum-verified and cached in ignored
`.cache/tools/`, then freshly extracted per invocation. Reports exclude matched secrets and author/provider payloads.
High/critical advisories fail unless covered by reviewed, specific, expiring non-applicability records in
`ci-security-exceptions.json` (initially empty). Scanner/registry errors fail. Dependabot proposes reviewed npm/Actions
updates; automatic merge and force upgrades are not configured. Hosted verification still requires GitHub access.

`ci-workspaces.json` version 2 records the six check groups and their command lists. App entries retain setup ownership
against P02-001, P02-002 and P03-001. Manifest-only apps report **Not Configured** and fail required execution.
Adding source, scripts or dependencies requires switching the app to `active`
and supplying real `lint`, `typecheck`, `test:unit` and `build` scripts. All listed checks run and any missing/failed script
fails CI. Add integration/contract/security/E2E/coverage suites to the inventory as their capabilities are implemented;
backend financial slices require the real replica-set integration and contract suites before acceptance.
[Testing §5.3](docs/TESTING.md#53-standard-execution-interface) defines the full required interface. A foundation CI pass
does not establish application or milestone readiness. Missing scripts must fail; never use `--if-present` to conceal them.

Both apps use the installed HeroUI default theme and Tailwind system font stack. There is no custom
palette, webfont set, radius/size override or shared adapter. Route/feature/layout code imports its
own `components/ui/` facade and compositions. `ui/theme.css`, `ui/primitives.tsx` and individual UI
modules are the only customization points. The import-boundary check rejects direct HeroUI imports
elsewhere in application source.

Light/Dark/System preferences persist under `sportzone.theme`. The blocking bootstrap resolves
System to the OS preference before hydration; the single preference controller follows OS changes
and synchronizes same-origin tabs without resetting drafts. Native HeroUI handles motion/focus styles.
Default-package accessibility findings remain reportable release issues, not automatically waived gates.

Use `tabular-nums` for monetary display. Each app exports `formatBdt` from `src/lib/format-bdt.ts`;
pass integer poisha, for example `formatBdt(123450)` → `৳1,234.50`. The formatter calculates no totals.

## 5. Configuration and verification

[Operations Appendix B](docs/OPERATIONS.md#appendix-b--configuration-inventory) defines configuration ownership, exposure
and validation. Separate local, CI, staging and production data, origins, credentials and provider modes. Keep secrets out
of Git, logs, artifacts and browser-exposed `NEXT_PUBLIC_*` / `VITE_*` values.

`.env.example` contains local-only origin conventions (storefront `3000`, admin `5173`, API `4000`), sandbox mode and blank
secret/approval-dependent values. Storefront and admin use ports 3000 and 5173 when started; the API origin remains a future local
convention. No application loads this template directly. MongoDB must use an isolated transaction-capable deployment. Add provider-specific keys with their
actual adapters and validators, keeping Appendix B and the protected per-key inventory synchronized.

Create service-local `.env` files only when configuring those services. `.gitignore` excludes local environment files,
credentials, dependencies, build output and test artifacts while retaining sanitized `.env.example` templates and lockfiles.
Review every template value before committing it; an example-file name does not make credentials safe to publish.

Use real transaction-capable MongoDB for inventory, checkout, coupon and refund concurrency tests. Validate payment/refund
adapters in sandbox. Verify responsive layouts, keyboard use, accessibility and both themes. Record commands, environment,
results and evidence against the corresponding task.

## 6. Delivery and operations

The delivery path is foundation → catalog/shopping → COD commerce → online payments → after-sales → integrated staging →
release verification → production → handover. [Implementation Plan §11](docs/IMPLEMENTATION_PLAN.md#11-milestones--acceptance-gates)
defines M1–M8. M7 authorizes launch; M8 accepts handover.

[Operations](docs/OPERATIONS.md) defines deployment, monitoring, jobs, financial reconciliation, backup/restore, incidents
and operator procedures. Populate the environment inventory during provisioning and verify it at the corresponding gate.

## 7. Documentation map

| Document                                           | Owns                                                         |
| -------------------------------------------------- | ------------------------------------------------------------ |
| [PRD](docs/PRD.md)                                 | Product scope, business rules and acceptance                 |
| [Architecture](docs/ARCHITECTURE.md)               | Technology, boundaries and system invariants                 |
| [Design](docs/DESIGN.md)                           | Tokens, layouts, interactions and accessibility              |
| [Database](docs/DATABASE.md)                       | Collections, schemas, indexes, transactions and migrations   |
| [API](docs/API.md)                                 | Routes, DTOs, authorization, errors and retries              |
| [Implementation Plan](docs/IMPLEMENTATION_PLAN.md) | Feature sequence, dependencies and milestones                |
| [Tasks](docs/TASKS.md)                             | Stable task IDs, execution status and evidence               |
| [Testing](docs/TESTING.md)                         | Scenarios, fixtures, tools and verification procedures       |
| [Operations](docs/OPERATIONS.md)                   | Configuration, deployment, recovery and operating procedures |
| [AGENTS](AGENTS.md)                                | Agent workflow and editing safeguards                        |
| [Changelog](CHANGELOG.md)                          | Documentation version history                                |

Use each document for its stated subject. Keep related contracts synchronized when behavior changes and preserve the
PRD's initial-release boundaries.

Customer password recovery/change (P03-010) is an explicitly activated backend slice. Leave PASSWORD_RECOVERY_ENABLED=false until current persistence, an approved HTTPS storefront origin, bounded reset/cooldown/response-floor settings and protected versioned envelope keys are ready. The separate email worker then supports registration and password-reset templates. Use the existing local/test notification migration before upgrading an older database; never put proof keys in frontend configuration. See [recovery activation and key custody](docs/OPERATIONS.md#p03-010-recovery-activation-and-key-custody). Storefront recovery screens and live inbox acceptance remain separate from backend API tests.

Verified customer email change (P03-011) uses EMAIL_CHANGE_ENABLED with explicit email-change TTL/cooldown/response-floor settings and the same protected proof keys/HTTPS storefront origin. Run the existing local/test notification migration before upgrading. Email stays unchanged until proof confirmation; confirmation revokes customer sessions and requires login with the verified new address. Password recovery and email-change activation are independent. See [email-change operations](docs/OPERATIONS.md#verified-email-change-activation-and-recovery).

Private administrator credentials (P03-012) activate with ADMIN_AUTH_ENABLED independently of customer auth. Supply explicit session/context policy, bounded ADMIN_PASSWORD_RESET TTL/cooldown/response-floor values, protected proof keys and approved HTTPS ADMIN_ORIGIN. Bootstrap/migrate owned persistence first. The local/test `node --env-file=.env backend/tools/provision-admin.mjs` command reads one bounded `{name,email,password}` JSON object from a protected noninteractive stdin source; never put passwords in command arguments or shell history. It refuses existing administrators, customer upgrades, overwrites and deployed environments. Production provisioning requires the reviewed operator procedure. See [administrator operations](docs/OPERATIONS.md#private-administrator-provisioning-and-recovery).

### Connected identity interfaces (P03-015)

Storefront `/register`, `/login`, `/forgot-password`, `/reset-password`, `/account` and `/account/email-change`
consume the existing customer API. Admin `/login`, `/forgot-password`, `/reset-password` and protected `/app/*`
consume the separate administrator API; no administrator signup is provided. Account profile/address/password/email
operations use server validation and session/CSRF enforcement. Management modules remain their owning future tasks.

Set `NEXT_PUBLIC_API_ORIGIN` for the storefront and `VITE_API_ORIGIN` for admin in each frontend process or its
own ignored `.env.local`, then rebuild. These are public origins only (for example `https://api.example.test`),
never backend secrets. Missing/invalid values visibly disable the service. Keep exact API Origin/CORS allowlists
and proof-link frontend origins aligned; browser cookies require the documented HTTPS topology. Root `.env` does
not automatically configure frontend builds. See [operations](docs/OPERATIONS.md#p03-015-browser-identity-rollout).

Focused real-API browser verification requires `npm run build --workspace backend`, both frontend builds with public
origin `https://127.0.0.1:4443`, and `npm run test:ui -- tests/ui/authentication.spec.ts`. The harness owns temporary
TLS certificates, an isolated MongoDB replica set and synthetic accounts, cleans them on exit, and sends no external
email. Proofs pass privately through fixture IPC; authentication traces/screenshots-on-failure are disabled. Hosted
CI sets these synthetic build origins explicitly. [Task evidence](docs/evidence/P03-015-identity-interfaces.md).

### Backend runtime wiring (P03-019)

`backend/src/composition.ts` wires the application and notification worker from typed configuration;
`routes/index.ts` owns root HTTP registration, and `common/` owns technical errors/responses/pagination/middleware.
`server.ts` retains process/listener/database lifecycle. Each process loads enabled identity policies once through
`config/environment.ts`; the worker reuses that policy and loads its separate email/retry settings once. Existing
start/build/operator commands and data/API contracts remain unchanged. The module ownership/entity-file refactor
remains P03-020. [Verification](docs/evidence/P03-019-backend-composition.md).
