# P03-006 — Origin, CORS and CSRF protection

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 19 October 2026: “Origin/CORS/CSRF implementation গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend) follows accepted P03-005.
Architecture §§9/11, API §§4/9, Database §§5/12 and Testing API-01/SEC-04/SEC-11 govern the work.
This slice delivers browser-security services, route guards and the composable bootstrap router. The current health-only
executable remains unchanged; P03-007/012 compose verified credentials and mount identity routes before enabling login.
No new dependency, schema/index migration, production configuration or milestone acceptance is introduced.

## Delivered behavior

| Area | Result |
| --- | --- |
| Origin/CORS | Exact distinct route-selected storefront/admin origins; approved credentialed preflight only; narrow method/header allowlist and Vary; missing/forged mutation Origin fails closed |
| Anonymous bootstrap | Separate storefront/admin opaque cookies; independent 32-byte cookie/CSRF; audience-separated HMAC verifiers; no account/order authorization; no-store response and fixed session cookie security policy |
| Lifetime/rotation | Explicit 1–1800 second context TTL, no default; expiry checked before TTL cleanup; replacement invalidates supplied audience predecessor; HEAD creates nothing |
| Session refresh | Replace only the validated route-kind session CSRF verifier using conditional update; old material fails without extending session lifetime; rotation/revocation/expiry still invalidate tokens |
| Mutation guard | Route-selected anonymous/customer/admin/customer-or-context policy; exact Origin plus custom X-CSRF-Token; invalid session cannot downgrade checkout to anonymous; separate authorization remains required |
| Exchange primitive | Atomic context consumption and owned durable effect in one transaction; one concurrent exchange wins; effect failure rolls back both; no external calls/nested independent transactions |
| Guest extension | Strict opaque guest cookie and custom header before optional order-bound adapter; no customer/admin/browser substitution; real guest persistence remains P06-015 |
| Provider segregation | Explicit provider fixture outside browser middleware creates no session/context; actual notification verification remains with payment tasks |
| Configuration | Explicit loader validates existing Origin allowlist, distinct canonical origins and context TTL; generic field-safe configuration errors; SESSION_SECRET domain separation and existing rotation policy |

## Verification

Environment: Node 24.20.0, npm 11.19.0, Ubuntu 26.04 host with owned MongoDB 8.0.16 replica and a temporary WPE
launcher. The complete final CI ran from `2026-10-19T12:40:37.653Z` to `2026-10-19T12:43:33.778Z`.

| Command/check | Observed result |
| --- | --- |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 421 unit/component cases (198 backend), 120 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| Backend security additions | Passed; 17 new unit/configuration cases and 31 new real MongoDB/HTTP cases |
| Browser report | Passed; Chromium/Firefox/WebKit, both themes and three viewport widths; 30 expected, zero skipped/unexpected/flaky; existing assertions and zero automatic retries preserved |
| `npm run lint`, `git diff --check`, task/source integrity audit | Passed; document links and structure valid, 171 unique task IDs, checkbox/status consistency, only P03-006 advanced; milestone gates unchanged |
| Deployed-domain browser cookies, hosted CI, real credential login, real guest proof/order ownership, provider verification, production/operator/milestone acceptance | Not Run or outside this slice; no successful outcome claimed |

Local artifacts: `test-results/ci.json`, `test-results/database.json`, `test-results/ui-report.json` (ignored generated reports).
Lockfile SHA-256: `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236`.
No dependency, script, CI inventory, executable public route, schema/index or financial contract changed. The bootstrap
router is composed with real persistence in the HTTP integration suite; the unchanged production entry point still
exposes health only. Documentation/status updates after CI were separately linted and audited.

## Verification environment findings

- The first unprivileged backend test invocation could not bind local HTTP sockets (`listen EPERM`); this was an
  environment restriction, not accepted verification. Full CI uses approved local socket access and an owned replica.
- The previous temporary WebKit launcher was absent. Packages were downloaded/extracted only under `/tmp`; no system
  installation occurred. The first recreated launcher selected GTK and rejected `--headless`, causing the first full CI
  attempt to fail at WebKit after 20 Chromium/Firefox cases passed. The launcher was corrected to the official WPE bundle,
  dependency paths and inspector resources, with inherited GTK/GIO module paths cleared. A standalone headless page check
  passed before rerunning full CI. No browser assertions, retry policy or project dependencies were changed.

## Review and boundaries

Public registration/login/recovery/logout routes are not activated by this task. Their owners must apply these guards,
credential verification, session/role/ownership checks and rate limits before activation. Anonymous context grants no
identity. Session refresh and anonymous exchange are independently verified; end-to-end credential exchange belongs to
P03-007/012. Guest adapter tests are synthetic, not real guest order authentication. Provider fixture tests prove only
browser-route segregation, not provider authenticity or payment success. ENV-04 deployed browser cookies/preflights,
production configuration/rotation and milestone/operator gates are Not Run or unaccepted.

The project owner accepted this task on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting). This task acceptance does not approve milestone, operator or provider gates.

## Reviewed source identity

| Source | SHA-256 |
| --- | --- |
| `backend/src/modules/auth/browser-security.ts` | `42faced08f8059c463aa4b6ecee548f7f0323cca969cf459822a4b8c2e1871b9` |
| `backend/src/modules/auth/browser-routes.ts` | `617d4c972f708d7b5fb6d6d243773141face5392278b96e487b5f22cec30c5a2` |
| `backend/src/modules/auth/sessions.ts` | `8413e672f2da977645b321aefef9e9bda42fac41df924447dc96fb55a76ed97f` |
| `backend/tests/browser-security.test.ts` | `9a08464718eadb7826d2d2234b79c0e137cefa1b868dd5af2ae4b846ff3c9bef` |
| `backend/tests/integration/browser-security.test.ts` | `9fc0324c825c873f4d321931a72f3927ec72315b69db64894e5ed79f47cabbda` |
