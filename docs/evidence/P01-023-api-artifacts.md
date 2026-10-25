# P01-023 — Automatic OpenAPI and Postman artifacts

**Date:** 23 October 2026 · **Executor:** Codex · **Status:** In Review

## Scope and implementation

Working-tree implementation over base d5cdf56d6f3ff4bc873e488dba81b910f7e1aa30.
API §18.3 owns the contract and commands. No commit, remote publication, frontend implementation,
merchant activation or milestone acceptance is included in this task.

- `backend/contracts/registry.ts` assembles 32 implemented business operations from owning runtime
  schemas, with access, activation, CSRF/session namespace, status, query/params and replay metadata.
  Two explicit HEAD routes and OPTIONS/implicit HEAD transport behavior are tracked separately.
- Credential, recovery and email-change request schemas have domain-owned schema files shared by
  services and the registry. Existing exported credential schemas remain compatible. JSON Schema
  metadata exposes representable Unicode/password bounds without changing runtime policy.
- `backend/contracts/generate.ts` produces four deterministic artifacts in `backend/api/`:
  OpenAPI 3.1 JSON, Postman 2.1 collection, blank environment and the 164-operation specification
  inventory. The latter marks 132 operations planned and never inserts them into the runnable collection.
  Conditional registration is described explicitly, including the unresolved EXT-04 media gate.
- The generator includes strict DTO envelopes, error codes grouped by HTTP status, public pagination,
  cookie/monitor separation, CSRF/Origin headers, applicable response headers and query/body placeholders.
  There are no saved credentials, cookies, proof values, account fixtures or mutation-retry scripts.
- `api:generate` cleans and compiles only the tooling graph into ignored `.cache/contracts`; stale
  compiled entry points cannot survive a source deletion. `api:check` fails
  stale/missing outputs without rewriting them. `test:contract` is mandatory in the backend inventory,
  before heavier runtime suites; removing it fails the tooling guards. Backend scope has nine commands;
  integrated inventory has 24. No frontend command is required for this gate.

## Contract drift corrected

Two existing HTTP details were brought into agreement with the approved API, without changing that contract:

1. Media upload returned 201 although API Appendix D.3 specifies 200. The controller and both media/
   composition assertions now use 200. Upload/privacy/scanning/retention and EXT-04 approval remain unchanged.
2. Saved-address creation now emits the resource `Location` required by API §3/Appendix D.1 while retaining
   201, its response body and existing ownership/concurrency controls. Profile regression asserts the URI.

## Verification and limits

Environment: Node.js 24.20.0, isolated MongoDB replica sets with MONGOMS_DISTRO=ubuntu-24.04;
no application connection URI, live provider or frontend server used.

| Command/check | Observed result |
| --- | --- |
| `npm run api:generate --workspace=backend` | Passed: four files; repeat CLI generation produced identical SHA-256 hashes for all four outputs |
| `npm run test:contract --workspace=backend` | Passed final revision: 42 cases, including official offline schema validation, actual Express registration parity, unsupported/missing/duplicate/status drift, typed security metadata, private-field/error rejection, missing/stale artifact protection and a credential-free subprocess with TCP/listeners denied |
| `npm run test:unit` | Passed: 58 tooling cases, including the mandatory contract gate and the updated 24-command fixture inventory |
| `npm run test:unit --workspace=backend` | Passed: 392 cases; results reused for unchanged unit consumers after transport-only follow-ups |
| `MONGOMS_DISTRO=ubuntu-24.04 npm run ci -- --scope=backend` | Initial attempt stopped on the old 23-command tooling expectation; corrected to 24. Subsequent run passed tooling/format/lint/types/unit/build/smoke, then 381/382 integration cases; one legacy media 201 assertion remained in composition. The failed report is preserved at test-results/P01-023-integration-initial.json. |
| `npm run test:integration --workspace=backend -- tests/integration/composition.test.ts` | Passed: 3/3 after correcting the remaining media status assertion; other integration cases were not restarted |
| `npm run test:integration --workspace=backend -- tests/integration/profile.test.ts` | Passed: 29/29 against the final address Location behavior, including ownership/default/concurrency cases |
| Integration reconciliation | All 382 distinct existing scenarios have applicable passing evidence through the initial run and focused follow-ups; reruns are not added to that unique-case count. There is no claim that the earlier failed consolidated CI report became green. |
| Backend `lint`, `typecheck`, `build`, `test:smoke` | Passed final applicable inputs; smoke exercised real isolated DB startup, liveness/restricted readiness, redaction and graceful shutdown |
| `npm run format:backend`, `npm run lint:boundaries` | Passed: 173 formatting files and 208 source-boundary files, zero errors |
| `npm run test:security` | Passed: zero secret findings and zero dependency advisories; final scan recorded at handoff |
| Documentation/task/diff checks | Passed: 440 files, 1,212 local links and zero errors; 209-task count/dependency/closeout audit, 34 FR/38 collection/164 operation parity and diff whitespace review |
| Frontend/browser/hosted/provider checks | Not Run: this task verifies backend contract generation locally; it has no hosted/provider activation acceptance prerequisite |

The first sandboxed HTTP contract probe could not bind loopback; approved normal execution passed.
A scoped integration command initially duplicated the existing outputFile option; it was corrected
before the scoped suite ran. Neither failed invocation is counted as a passing test.
Sanitized local logs are retained under `test-results/P01-023/`; the initial integration JSON report
is preserved separately above. Final profile/contract runs do not overwrite or reclassify that failure.

## Schema provenance and validation boundary

Pinned backend development tools: Ajv 8.20.0 and ajv-formats 3.0.1. Existing optional native lockfile
entries were preserved; no unrelated framework/dependency version was upgraded.

- [Zod JSON Schema](https://zod.dev/json-schema) defines input-mode conversion. Unsupported types fail
  instead of falling back to an unconstrained schema. Runtime transforms, phone/coverage/byte policies,
  authorization and cross-field/transactional rules remain authoritative beyond structural JSON Schema.
- [Official OpenAPI 3.1 base schema](https://spec.openapis.org/oas/3.1/schema/2022-10-07), vendored offline:
  `8174700f0cef22c2ab919bd660371ad2b2b741958d9adfc38b15a91fe4ac1bec`.
  This base schema excludes Schema Object validation. Its single base dynamic anchor is bound to the
  equivalent local definition for Ajv; generated payload schemas are additionally meta-validated and
  exercised separately. The unchanged offline source is retained, and an invalid OpenAPI version is rejected.
- [Official Postman 2.1 draft-07 schema](https://schema.postman.com/collection/json/v2.1.0/draft-07/collection.json),
  vendored offline: `f0084f796d65a9b25d6108d18d258b602cefcc20a047f9203ceacfd030f852bf`.

Wire-schema validation does not claim that arbitrary refinements, account access, deployed cookies,
scanning or provider outcomes are established by an OpenAPI file. Actual auth/media/profile integration
evidence remains distinct. In particular, EXT-04 is still blocked; generation does not enable media.

## Rollback and acceptance

Regenerate after a reviewed schema/registry change; restore the matching registry, artifacts, scripts
and inventory together for tooling rollback. Retain the shared schema exports and approved HTTP status/
header behavior; reverting generation does not authorize reintroducing contract drift. No migration or
data/provider effect needs reversal.

### Independent acceptance

On 24 October 2026, the project owner independently reviewed the submitted implementation and
verification evidence and accepted the task through the review popup: “Review করেছি—accept করছি, Done করো”.
P01-023 moved from In Review to Done under AGENTS §13. The verification results and historical failed
attempts above remain unchanged. P01-024 remains Not Started; this acceptance does not approve
foundation readiness, product milestones, hosted deployment or external-provider gates.
