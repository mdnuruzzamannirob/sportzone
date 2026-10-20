# P03-008 — Customer profile and address ownership

**Date:** 19 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 19 October 2026: “Profile/address implementation গ্রহণ করছি”

## Scope and authority

[Task](../TASKS.md#phase-03--authentication-and-core-backend) follows accepted P03-007. PRD FR-02/§§10.2/12.8,
Architecture §§7.5/9, Database §§5/7.6/15, API §§4.7/9.1 and Testing ownership/security cases govern the slice.
This delivers the existing customer profile/address/deletion-intake APIs, not a new account-deletion UI or operator
approval workflow. No user schema/index, environment setting or financial lifecycle is changed.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Profile | Active customer session only; name/phone allowlist; strict query/body validation and shared safe Account projection |
| Phone | Pinned libphonenumber-js 1.13.15, max metadata, strict full-input BD validation, no extensions; canonical E.164 storage; formatting validation does not claim possession |
| Addresses | Server-generated IDs; at most ten; no client ownership/zone/charge; merge and revalidate patches; cross-owner/random IDs return 404 |
| Concurrency | Transactional user re-read/retry with live route-kind session/revision/status; no lost profile/address writes; address cap and at most one default remain BSON-enforced |
| Defaults/removal | Explicit selection clears other defaults atomically; clear/delete leaves zero rather than inventing a replacement; DELETE returns empty 204 |
| Coverage | Settings-owned read boundary checks currently effective active delivery rules and active zones; exact before district fallback, ambiguous/invalid/unserved data fails closed; no geographic/charge seed or price authority |
| Deletion intake | Requires active session plus persisted email verification; server timestamps/stable request ID; repeated/concurrent intake preserves original evidence and returns current own review status |
| Retention | No self-service approval/status transition, account disabling/deletion/anonymization or financial/history mutation; original order/payment sentinel records remain unchanged |
| Composition | Existing enabled customer runtime mounts the routes; default activation policy and original authentication security remain in place |

## Verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica and local HTTP/browser fixtures. Final CI ran from
`2026-10-19T13:12:49.272Z` to `2026-10-19T13:16:02.234Z`.

| Command/check | Observed result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | Passed; clean install of committed lock configuration after the single pinned phone dependency |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 configured commands, 453 unit/component tests (230 backend), 164 real MongoDB/runtime integration cases, 30 browser regressions, three builds and seven HTTP smoke groups |
| Added profile cases | Passed; 21 phone/DTO unit cases and 26 real ownership/coverage/concurrency/deletion/snapshot cases |
| Existing customer runtime integration | Passed; normal enabled server mounts `/me` with customer authentication; existing login/registration/logout regressions remain Passed |
| Browser report | Passed; Chromium/Firefox/WebKit, both themes and three viewports; 30 expected, zero skipped/unexpected/flaky; no browser assertions/retry policy changed |
| `npm run lint`, `git diff --check`, source/task integrity audit | Passed; links/structure, 171 unique task IDs, checkbox/status consistency, only P03-008 advanced; milestones and existing identity/schema/session security preserved |
| Production coverage/legal processing, real email verification/provider flows, hosted CI/deployed-domain browser acceptance and milestone/operator approval | Not Run/outside this slice; no successful outcome claimed |

Artifacts: ignored generated `test-results/ci.json`, `test-results/database.json` and `test-results/ui-report.json`.
Lockfile SHA-256: `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6`.
The earlier focused run passed 16 profile cases with unrelated suites filtered/skipped; only the full final unfiltered CI
is used for complete-suite evidence. Profile tests seed only their owned isolated fixture; no live database or approved
production delivery/retention data was changed. Final documentation/status edits were separately linted and audited.

## Review and boundaries

- Delivery fixture masters are synthetic and isolated. Runtime does not seed approved service areas; absent rules fail
  closed. P06-001 owns delivery master writes/index rollout, global coverage revisions and operator setup. Eligibility
  here does not prove a priced quote or checkout reservation.
- Intake's verifiedAt records that an active customer session and persisted email verification were checked, not a new
  challenge or legal approval. Real email-verification issuance/confirmation remains its owning identity task.
- Existing terminal review records are preserved. Operational/legal retention review and eventual anonymization remain
  separate authority; this task does not silently approve or erase anything.
- Historical order/payment records are preservation sentinels, not implemented financial/provider flows. No production,
  legal-retention, hosted-CI or deployed-domain acceptance is claimed. Frontend account screens remain their owning task.
- Dependency justification: complete Bangladesh mobile and fixed-line validation, strict parsing and canonicalization
  without maintaining a handwritten partial national numbering plan. Lockfile and CI inventory record the exact setup;
  existing unit/integration scripts discover all new cases, with no passing placeholders.

The project owner accepted this task on 19 October 2026 under [AGENTS §13](../../AGENTS.md#13-task-completion--reporting). This task acceptance does not approve milestone, operator or legal/provider gates.

## Technical source

[libphonenumber-js maintained documentation](https://github.com/catamphetamine/libphonenumber-js#readme) describes strict
full-input parsing, country checks, E.164 output and max-metadata digit validation. Runtime behavior was separately
verified with synthetic Bangladesh mobile/fixed-line and invalid/foreign/extension cases; no external phone lookup occurs.

## Reviewed source identity

| Source | SHA-256 |
| --- | --- |
| `backend/src/modules/auth/profile.ts` | `d4bb8cf8d0862784cee5d19028505215ec06d857c1713d9bfe0770fdc7e3e74c` |
| `backend/src/modules/auth/profile-routes.ts` | `61fc4c120bfe3865baf079d04c93a99d1c7245d5079e20cb0b09dd3c49ac4b99` |
| `backend/src/modules/auth/account-dto.ts` | `c02616c8f55ba2817ff635a3e1323265cb95663b18c667280723010f629c4e6a` |
| `backend/src/modules/auth/customer.ts` | `7c1125511b327473cb4d38f790433272e3644f41c6e4beb632fa290e7527e593` |
| `backend/src/modules/auth/composition.ts` | `189c35f22b870b78e91ca692800eb2c1f5a7a891b7e6808b2f22f06b4e32ce97` |
| `backend/src/modules/settings/coverage.ts` | `d57555486e63e33bec05d14c1c99886d381bc8886c5c6a976d6664332e869d5a` |
| `backend/src/shared/errors.ts` | `f2c191c60364c18d8015b119d72e7523bf2bf59bf6037d50ede56829450aef28` |
| `backend/tests/profile.test.ts` | `6d7ae5bfb3583cb85cfed23aaad516aafc8026757398e0e16aa6a20cb2904e74` |
| `backend/tests/integration/profile.test.ts` | `38395499c669e839a7517b8d525517924e0a829ca7e4467462461ed7b1a90dfa` |
| `backend/tests/integration/customer.test.ts` | `846a1877ade86018f39907ca40c40650446500920dbbd22bc175403e52a6c15b` |
| `backend/package.json` | `5e2a3edcf73b23728b61000224fe6b53f0702b63296548e373d262e8cbc2652e` |
| `package-lock.json` | `7b8c507181a5c5f9a132b4050b23239db3b4b407e266aef710b536e61772dac6` |
| `ci-workspaces.json` | `ba999109b1c32835cb911ba15fac49a27fefded917e566eb75c94ecc35e68b5f` |
