# P04-003 — Controlled media adapter and lifecycle

Date: 21 October 2026 (Asia/Dhaka). Executor: Codex. Status: Blocked (EXT-04).
Engineering implementation/local verification delivered; independent acceptance pending.
No real provider, scanner deployment, policy or milestone acceptance is claimed.

## Scope and contracts

Sources: PRD FR-05/FR-23; Architecture §§6/11; Database §6.7 and shared-collection rules;
API §16.2; Testing REL-09/REL-11; Operations §13.3/Appendix B; P01-005 EXT-04 readiness.
Dependencies P03-003 and P01-005 are Done; the latter's external gate is still Pending.

- `backend/src/modules/media/`: canonical mediaAssets Mongoose/BSON schemas, explicit additive
  bootstrap/read-only verification, durable upload identity/digest/scan state, owner/order/items,
  references, retention/hold fields and CAS lifecycle. No TTL index or data-erasing cleanup.
- Upload service: real transaction-fenced admin capability, bounded image header/MIME/extension/
  dimension validation, required scanner, clean verdict persisted before provider upload, known
  metadata agreement before DTO, quarantine and uncertain intent reconciliation. Input bytes are
  copied; original filenames/URLs/owner fields cannot select provider identity. Slow outcomes do
  not return expired attachable references.
- Transaction-scoped attach/detach: owning target callback and media reference commit together;
  full rollback on target failure. Public reuse is bounded/deduplicated; private evidence is
  owner/order/item scoped, single-claim, and cannot use generic public detach/attachment.
- Private read: current customer/order or injected guest proof is checked on every call; current
  admin access may inspect evidence. Only a short-lived authenticated provider URL is generated.
  No public evidence URL or new private-read endpoint is added.
- Cleanup: state/reference/deadline/policy/retention/hold checks, single fresh deletion claimant,
  second policy check and independent provider lookup. Unknown deletion remains deleting;
  later maintenance queries status without blind delete replay. Confirmed absence finalizes a
  preserved ledger row; duplicate completion is idempotent. Bounded sequential maintenance counts
  pending/blocked separately. Protection can only add holds or extend retention.
- `integrations/cloudinary/`: fixed-origin Cloudinary REST adapter with bounded response bodies,
  deadlines, no redirects/overwrite/automatic retry, authenticated evidence, digest context and
  time-limited private signing; ClamAV INSTREAM transport fails closed on errors/unknown replies.
  Network effects reject invocation inside MongoDB transaction scope.
- Auth-owned media admin access does not expose private identity models. Optional typed
  composition verifies persistence, requires admin auth and a scanner/provider/retention policy,
  and defaults missing private-order authorization to deny. No provider/policy fake is wired
  into ordinary startup. Standard startServer does not activate media from an environment flag.
- Two canonical admin HTTP routes implement multipart upload and safe deletion, with session,
  Origin/CSRF, isolated media quota, bounded native multipart parsing and safe DTOs. Only the
  explicitly enabled exact upload path bypasses default JSON-only admission. Existing transport
  behavior is covered by regression tests. Safe upload/delete log actions exclude bytes/secrets.

Database/API/Testing/Operations contracts, sanitized env template, TASKS and CHANGELOG are updated.
No new dependencies/scripts/CI inventory entries were introduced; existing test globs discover
new cases. Concurrent staged product model/persistence/service edits were not overwritten or staged
by this task. No user changes, account state, external object or production data were removed.

## Observed verification

Environment: local workspace Node/npm; generated isolated MongoDB 8.0.16 single-member replica sets;
real sessions, transactions, HTTP sockets and BSON/index checks. Cloudinary fetch transport and ClamAV
server are explicit local protocol doubles. Customer ownership uses real customer sessions with a
synthetic order collection; guest proof is an explicit scoped test double, not P06/P08 acceptance.

| Command | Result and scope |
| --- | --- |
| `npm run test:unit -w backend -- tests/media.test.ts tests/app.test.ts tests/composition.test.ts tests/operations.test.ts tests/auth-rate-limit.test.ts` | Passed: 96 tests, 5 files |
| `npm run test:integration -w backend -- tests/integration/media.test.ts tests/integration/composition.test.ts` | Passed: 22 tests (19 media + 3 composition); generated `test-results/database.json` |
| `npm run build -w backend` | Passed |
| `npm run typecheck -w backend` | Passed |
| `npm run lint -w backend` | Passed |
| `npm run lint:boundaries` | Passed: 153 source files, zero errors |
| `npm run format:check` | Passed: existing scoped baseline |
| `npm run test:smoke -w backend` | Passed: compiled startup, real DB, redacted invalid config, live/restricted-ready health and graceful shutdown |
| `npm run lint` | Passed: repository documentation/links |
| `git diff --check` | Passed |

Real media cases cover schema/index/no-TTL behavior; current admin-only upload; suspended denial;
scan/provider quarantine; uncertain upload/no reupload; target rollback/duplicate refs; public reuse/
detach; attach-delete race; expiry/hold/retention; uncertain delete/no replay/actual absence;
private current-owner/order/items and guest-scope contract; HTTP Origin/CSRF/shape/size rejection;
default JSON-only behavior; direct invalid BSON rejection; transaction/network guard; bounded real
TCP scanner protocol fixture; maintenance outcomes; concurrent duplicate cleanup; slow upload expiry.
Optional composition additionally verifies persistence preflight, default-disabled admission, real
admin upload, separate 10/minute media throttle and secret/PII-safe logs.

Initial Supertest unit execution was denied local socket binding (EPERM); approved local-port
execution passed. A new concurrent cleanup test found a second worker could report conflict after
another worker had already confirmed deletion; the final recheck handles confirmed completion
idempotently and the affected suite passes. Type errors in document-array assignment/missing export
were corrected before final checks. No failed case was waived, skipped or mislabeled as provider proof.

Not Run: full cross-project CI/frontends/browser suites (no frontend changes); real Cloudinary
account/private original/derived delivery/deletion; an actual maintained ClamAV deployment; approved
retention/legal-hold operations; production/staging deployment. Provider doubles and a protocol
fixture establish local behavior only. P08-012 still owns evidence HTTP/current order/claim/guest
integration; product/category/settings owners still integrate actual target mutations in their tasks.

## EXT-04 blocker and next action

Governing record: [P01-005 EXT-04](./P01-005-readiness.md#ext-04), especially its blocking condition:
“Real upload/private-delivery acceptance requires account/configuration and security evidence.”
Task register §6.1 requires an input-blocked task to be Blocked. API §16.2 and Operations §13.3/
Appendix B require actual media policy/provider validation; a generic task acceptance cannot invent it.

The request for protected configuration/policy references received “ok”, not configuration values,
policy approval or provider evidence. Presence-only checks (no secret values printed) found the
Cloudinary account/key/secret, policy, temporary lifetime and scanner host unset in both the current
process and local .env. This does not assert that the owner lacks an account elsewhere.

Accountable function: store administrator/project owner; execution/review: backend/security/QA.
Required inputs: named owner, protected staging account/configuration references, authorized media,
approved file/scan/TTL/private delivery/retention/hold policy and scanner deployment/freshness proof.
Then execute the staged acceptance procedure in Operations, capture sanitized actual upload/private
access/expiry/deletion/reconciliation evidence, review operator composition/activation and submit
independent acceptance. Ordinary startup remains media-disabled. M2 remains Not Accepted.
Safe parallel work may proceed on independent category/admin/inventory tasks with accepted prerequisites.

## Recovery and protocol references

Stop new admissions and maintenance before rollback, preserve ledger/references and uploading/deleting
records, and reconcile external identities after recovery. Never reset unknown outcomes or drop the
ledger to force success; hold removal and a supervised deletion retry require appropriate operational
review. No production migration or external effect needs reversal from this execution.

Primary protocol references checked for adapter implementation:

- [Cloudinary Upload API](https://cloudinary.com/documentation/image_upload_api_reference): server-side
  authentication, explicit identity/no overwrite, destroy results and signed download.
- [Cloudinary Admin API](https://cloudinary.com/documentation/admin_api): exact resource lookup.
- [Cloudinary access controls](https://cloudinary.com/documentation/control_access_to_media): authenticated
  original/derived privacy and time-limited authorized delivery.
- [ClamAV protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html): bounded INSTREAM framing
  and explicit clean/detection/error outcomes. Documentation is not deployed-service evidence.
