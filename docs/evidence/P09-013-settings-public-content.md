# P09-013 — Store settings and public content APIs

**Date:** 26 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Done; accepted by project owner on 26 October 2026
**Revision:** Working tree based on `deaafc944056e28f3f46187ceb26ae328adb3059`; clean at kickoff.

## Scope and decisions

Sources: [API §§10.1,14.3](../API.md#143-delivery-promotions-content-and-settings),
[Database §§10.4–10.5](../DATABASE.md#104-storesettings--settings-singleton),
[Testing SET-01–SET-04](../TESTING.md#73-targeted-account-support-and-settings-cases),
FR-03/FR-34 and Tasks P09-013. All declared dependencies were accepted. This is one backend feature;
admin/storefront screens remain in their later application stages.

The owner requested feature-sized implementation and verification. Asked about unspecified nested contact
fields and the evidence source, the owner delegated both decisions: “doc onujai jeta bhalo hobe setai koro”.
The owning API/Database contracts now specify strict contact/address/complaint allowlists, the explicit
initial threshold and protected operator approval register. This delegation authorizes technical contract
clarification, not any legal policy content or merchant activation. No real policy/contact data was invented.

## Delivered behavior

- Canonical `storeSettings`/`policyDocuments` models and additive local/test bootstrap. The unique
  primary singleton starts with explicit configured threshold, zero settings/coverage revisions,
  all payment flags false and an empty policy map. Reruns preserve existing state and timestamps.
- Admin settings GET/PATCH with authenticated transactional account checks, Origin/CSRF, strict
  DTOs and strong revision ETags. Same-revision concurrent writes have one winner; metadata no-ops
  preserve revision. Payment flags cannot establish merchant capability. Coverage revision is independent.
- Canonical public contact projection exposes only configured contact/complaint channels. Unset fields
  are omitted; address, payment eligibility, policy pointers and private configuration stay private.
- Branding/banner writes use the media-owned attachment ledger and canonical URLs. Settings, attachment
  replacement/removal and audit commit or roll back together. Banner uses asset ID and internal path;
  its server-resolved attachment snapshot supports later replacement. There is no new public homepage
  implementation in this task; its future banner consumer must recheck publication eligibility.
- Policy draft create/list/detail/edit, bounded plain text/digests, draft-only CAS and immutable
  server-generated version identity. Summaries omit content; public reads cannot reveal drafts.
- Approval requires a protected server register entry bound to reference/type/version/content digest
  and effective date. Browser strings cannot create approval. Missing/mismatched evidence fails closed.
  Publication checks approved status/date and updates the authoritative public pointer transactionally.
- Durable actor/payload/revision/key-bound approval/publication replay identities preserve original
  responses through later state changes. Conflicting requests fail without duplicate effects/audit.
- Future-effective publication remains scheduled until the bounded worker activates it. Concurrent
  workers audit once; older schedules cannot replace newer effective content. Superseded documents
  and bounded pointer history preserve prior canonical content. No order or financial record is edited.
- Root composition wires protected routes only with admin auth enabled and public content independently.
  Startup validates an optional protected approval register; absent register leaves approval unavailable.
  New compiled local/test bootstrap and scheduled activation entry points have actual execution coverage.

Ownership stays inside settings; media retains private persistence/protocol responsibility and audit/auth
are narrow capabilities. Routes have no model imports. No packages, frontend changes, real provider
calls, production migrations or new collections beyond the approved existing data contract were added.
The 164-operation registry now records 69 implemented and 95 planned operations; generated OpenAPI,
Postman and planned-operation artifacts stay synchronized with runtime schemas and router parity.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, disposable MongoDB 8.0.16 replica sets with generated URIs/databases.
Synthetic accounts, contacts, policy content/evidence and media provider doubles only. Local listener
checks ran with sandbox escalation after the sandbox denied MongoDB's port probe; no external DB or
application .env credentials were read by the integration fixtures.

| Command/check | Result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed; four artifacts |
| `npm run test:contract --workspace=backend` | Passed; 82 tests, including freshness/router parity and credential-free generator checks |
| `npm run test:unit --workspace=backend -- tests/unit/settings.test.ts` | Passed; 3 tests, including register loading/invalid/missing/duplicate/future evidence and input bounds |
| `npm run test:integration --workspace=backend -- tests/integration/settings.test.ts tests/integration/inventory-admin.test.ts tests/integration/media.test.ts tests/integration/category-admin.test.ts tests/integration/product-admin.test.ts tests/integration/composition.test.ts` | Passed; 116 tests in 6 files: 16 settings, 22 inventory-admin, 19 media, 27 category-admin, 27 product-admin, 5 composition |
| `npm run build --workspace=backend` | Passed before final compiled bootstrap/worker and consumer integration run |
| `npm run typecheck --workspace=backend` | Passed against final code/test inputs |
| `npm run lint --workspace=backend` | Passed; 236 files |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, liveness/restricted readiness, invalid configuration redaction and graceful shutdown |
| `npm run lint:boundaries` | Passed; 256 files, zero errors |
| `npm run format:check` | Passed; 400 files |
| `npm run test:security` | Passed; zero secret findings and zero locked dependency advisories |
| `npm run lint` and `git diff --check` | Passed; repository documentation/link checks and diff whitespace review |

Current local machine-readable results: [integration](../../test-results/database.json),
[security](../../test-results/security.json). These ignored local artifacts may be replaced by subsequent
runs; counts/commands above retain this revision's observed evidence.

Initial failures are not acceptance results: sandbox execution failed before tests with `listen EPERM`;
first implementation runs exposed incorrect audit ID types, then media ledger ID types. These were fixed
at their respective string/ObjectId boundaries and final real transaction/media suites passed. Initial
lint/type/build checks caught input-regex style, fixture typing/route inventory and TypeScript control-flow
issues; corrected checks passed. First contract run also hit sandbox listener restrictions and stale
expected inventory counts. No failures were relabelled as passes. Earlier integration JSON reports were
preserved locally in `/tmp/P09-013-sandbox-failure.json`, `/tmp/P09-013-first-integration.json` and
`/tmp/P09-013-second-integration.json` before final reports replaced the default artifact.

## Rollout, recovery and review

[Operations](../OPERATIONS.md) owns explicit bootstrap, protected register loading/restart, bounded worker
scheduling and monitoring. Production/staging additive provisioning requires operator review; local
bootstrap refuses both. Roll back matching binary/router/contracts together and retain singleton,
policy documents, hashes, attachments and audit. Policy rollback publishes a newly reviewed version;
never rewrite historical accepted content. Failed transactions retain scheduled work for retry.

**Not Run:** UI/browser/theme review (no UI changed), full backend-stage/integrated release regression,
real legal approval, actual merchant/media provider activation and deployed worker/staging acceptance.
No live operator register is supplied; fixtures prove verification behavior, not legal acceptance.
P04-003/P09-011 remain blocked and backend/product milestones remain unaccepted.

## Independent acceptance

On 26 October 2026 (Asia/Dhaka), after the implementation and verification handoff, the project owner
explicitly instructed: “done koro”. P09-013 is accepted as Done and its task checkbox is checked.
This accepts the backend feature and recorded local verification; it does not approve legal content,
real provider activation, staging deployment, client stages or product milestones.
