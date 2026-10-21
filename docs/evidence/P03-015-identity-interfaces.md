# P03-015 — Connected customer and administrator identity interfaces

**Date:** 21 October 2026\
**Executor:** Codex\
**Status:** Done; explicitly reviewed and accepted by project owner

## Scope and implementation

FR-01/FR-02/FR-21; Design §§7–8, Architecture frontend/session boundaries, existing API identity DTOs,
Database identity/ownership rules and Testing §15.5 apply. Prerequisites P02-006/007/008 and P03-008/010/011/013
are accepted. This slice consumes the existing API, without modifying backend authority, schemas or endpoints.

- Customer registration/login/recovery/reset, session-gated account, profile, saved address add/edit/default/remove,
  authenticated password change and email-change request/confirmation now use real API responses. Administrator
  login/recovery/reset and protected shell use the separate admin session namespace. No public admin registration.
- Thin routes compose feature-owned forms/API/schema modules through existing app-owned HeroUI controls. Removed
  obsolete unavailable-sign-in page. Reset forms require matching password confirmation; it is never sent to the API.
- Exact public build-time origins; invalid/missing configuration disables requests visibly. Credentialed no-store/
  no-referrer fetch, validated response allowlists, fresh correct-namespace CSRF before each mutation, no automatic
  mutation retry, safe fixed error messages and Retry-After. Pending locks prevent concurrent duplicate submissions.
- Per-provider TanStack Query cache, bounded server-error-only read retry, abortable reads, no persistence, private
  cache/draft clearing on identity change/401/logout. A generation fence also rejects identity changes while JSON
  decodes. Cross-tab messages contain only invalidation/sender IDs; no account, password, cookie or proof.
- Forms stay disabled until hydration attaches the submit handler, preventing premature native submission and lost drafts.
  Failed submissions preserve inputs. Confirmed success clears password fields; errors focus the linked summary.
  Private editor state is keyed to the verified account and unmounted on lost access. Uncertain sign-out clears the
  view and offers explicit retry without claiming backend revocation. Suspended/expired sessions hide private data.
- Proof fragments are captured once into component memory and removed from the address bar. Confirmation is an
  explicit JSON mutation; no proof in query variables, hidden form inputs, storage, logs or outgoing referrers.
- Auth/account storefront routes are dynamic, private/no-store and noindex. Semantic error foregrounds and decorative
  alert icons were corrected; authenticated admin identity text uses native foreground for light-theme contrast.
  Existing native HeroUI design, themes, navigation adapters and semantic landmarks remain.

Introduced the already-planned pinned TanStack Query **5.104.5** and Zod **4.6.7** in each consuming app, with the
single lockfile/CI inventory updated. Read primary [query defaults](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults),
[query cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation),
[Zod parsing](https://zod.dev/basics), and installed Next.js authentication/client-boundary documentation before implementation.
No second UI library, shared runtime package, auth provider or new service was introduced.

## Observed verification

Node 24.20.0/npm 11.19.0; synthetic identities, isolated MongoDB 8.0.16 replica set and local TLS proxies.
The browser fixture runs the actual composed Express API and real database transactions. Delivery proofs use the
actual encrypted proof renderer over private fixture IPC; no external SMTP/provider or live user account is involved.
Authentication traces and automatic failure screenshots are disabled. Saved screenshots show only synthetic,
settled non-secret views. The normal hosted CI inventory remains fail-closed and discovers the new suites.

| Command/check | Observed result |
| --- | --- |
| Both workspace `npm run test:unit` during integration, followed by affected reruns | Initial storefront 84 passed. Initial admin had eight obsolete placeholder/shell assertion failures; updated to actual provider/guard semantics and retained separate shell fixture coverage. Unchanged passing results reused. Final unique totals: storefront 85, admin 80. |
| `npm run test:unit --workspace storefront -- tests/identity-client.test.tsx tests/form-primitives.test.tsx` | Final 27 passed. Includes response-body identity race fence. |
| `npm run test:unit --workspace admin -- tests/identity-client.test.tsx tests/form-primitives.test.tsx tests/routes.test.tsx tests/shell.test.tsx` | Final 40 passed. |
| `npm run test:unit` at root | 30/32 initially passed; CI-11/TOOL-10 child-process checks could not run in sandbox. Focused `node --test --test-isolation=none --test-name-pattern='CI-11\|TOOL-10' tests/ci.test.mjs tests/tooling.test.mjs` with temporary execution permission passed both. Combined 32 passed. |
| Both workspace `lint`, `typecheck`, configured-origin `build` | Passed. Storefront six private/auth dynamic routes and fourteen static outputs. Admin emits a nonfatal >500 kB bundle advisory (about 634 kB minified/197 kB gzip); no warning suppressed. |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-p03-browser/webkit.sh npm run test:ui -- tests/ui/authentication.spec.ts` | Final 6/6 passed in Chromium/Firefox/WebKit, including hydration/JavaScript-disabled safety; zero skipped or retries. |
| `npm run test:ui -- tests/ui/apps.spec.ts --project chromium --project firefox`; WebKit apps cases in the corrected-wrapper run | Passed 4 + 2 existing light/dark shell cases. Combined auth/shell matrix: 12 unique cases across affected runs. |
| `npm run test:ui -- tests/ui/accessibility.spec.ts --project chromium` | Passed 4 cases/16 scans across both apps, light/dark, mobile/desktop and actual UI previews; no suppressed rule. Total 16 unique focused browser cases with auth/shell runs. |
| Both workspace `test:smoke`; backend `build` for the fixture | Passed. Six frontend smoke cases in total; backend source unchanged. |
| `npm run lint:boundaries`; `npm run format:check`; UI TypeScript | Passed; 131 browser/source files, zero boundary errors. |

Browser flows assert registration validation/resubmission and login by keyboard; wrong credentials; private response
headers; profile offline failure/draft retention; unsupported coverage and address CRUD/default; password/email
change; recovery/reset in both realms; removed proof fragments; customer-cookie/forged-local-flag admin denial;
separate logout; live session expiry/suspension; cross-tab account switching; mobile reflow and unsuppressed WCAG
Axe checks in both themes. React Aria retains pending-control announcements for seven seconds after controls may
unmount; settled-screen audits await their expiry without suppressing a rule. Native alert decoration was separately
made hidden to assistive technology.

WebKit additionally exposed typing before hydration; the form-ready guard corrects it, with JavaScript-disabled
SSR safety explicitly checked. Expanded browser verification first found an obsolete heading locator and light-theme admin identity contrast;
both corrected. Stock WebKit on Ubuntu 26.04 lacked compatible shared libraries. Official Ubuntu packages were
extracted into `/tmp/sportzone-p03-browser` only, and a temporary direct MiniBrowser wrapper preserves those paths
plus the official Playwright bundle. No system package or repository runtime dependency changed. Hosted Ubuntu
jobs continue to install browser OS dependencies normally.

Artifacts: [final three-engine identity report](../../test-results/p03-015/auth-final.json),
[shared UI accessibility report](../../test-results/p03-015/accessibility-final.json),
[initial WebKit report retaining its passing shell/admin cases](../../test-results/p03-015/webkit-initial.json),
[initial expanded browser report](../../test-results/p03-015/browser-expanded-initial.json),
[corrected Chromium/Firefox admin flows](../../test-results/p03-015/admin-corrected.json),
[account mobile](../../test-results/p03-015/account-light-mobile.png),
[admin light mobile](../../test-results/p03-015/admin-light-mobile.png),
[admin dark desktop](../../test-results/p03-015/admin-dark-desktop.png).
Executor visually inspected those actual screenshots; this does not substitute for owner acceptance.

## Limits, rollout and review

Full CI/unrelated backend suites, hosted checks, deployed TLS/CORS/cookies and live recovery email were Not Run for
this frontend slice. Existing backend integration evidence remains valid; the browser fixture exercises actual API
paths rather than mocks. Production/operator, sender activation and M1 acceptance remain separate gates.

Registration email-verification issuance/confirmation is still unimplemented by the existing API; the account says
so honestly and offers no pretend action. Address district/area inputs accept existing server keys with authoritative
coverage errors; discovery/selection awaits the delivery API feature. Management modules remain their future tasks.
These are existing capability boundaries, not new claimed functionality. No contract requirement was removed.

README, API consumption notes, Design, Testing, Operations, TASKS and CHANGELOG track this slice. Public origin
configuration must match the real deployments and needs a rebuild when changed. Frontend rollback preserves all
backend identities, challenges, notifications and audit history. No production operation or schema migration.

Independent owner acceptance is recorded below. No milestone is self-approved.

## Owner acceptance

On 21 October 2026, the project owner explicitly reviewed and accepted P03-015 through the evidence-linked popup:
“Review করেছি—accept করছি, Done করো”. P03-015 is Done. The review disclosed the 165 frontend unit cases,
16 focused browser cases, lint/types/build/smoke results and that live email/hosted deployment were not verified.
Those external gates, existing registration-verification delivery limitations and M1 acceptance remain separate.
This status-only update retains valid application results and uses documentation/link checks without rerunning them.
