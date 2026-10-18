# P03-001 — Modular Express API bootstrap

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Backend scaffold গ্রহণ করছি”

## Scope and sources

[Task](../TASKS.md#phase-03--authentication-and-core-backend), Architecture §§4/6/8 and API §§3/7/8 govern the scaffold. P01-009 is accepted. [Testing](../TESTING.md#5-tooling--test-organization) and [Operations](../OPERATIONS.md) record executable commands and runtime limits.

Express 5.3.0 and Zod 4.6.7 runtime; exact TypeScript 6.0.3, Vitest 5.0.5, Biome 2.5.15 and Supertest 7.3.1 tooling. Root lockfile updated; backend activated with five required checks. No business route, database collection, public DTO, payment or authorization policy changed.

## Delivered structure and behavior

| Area | Implementation |
| --- | --- |
| App and routes | Import-safe app factory, versioned router composition, global JSON 404; injected routers are composition/test seams, not HTTP-configurable access |
| Request boundary | Fresh UUID ignores caller correlation; no-store/nosniff, no Express fingerprint/ETag; proxy trust disabled; simple query parser |
| Envelopes/errors | Canonical data/meta and safe registered code/message/details; unexpected sync/async/serialization faults redacted; partial errors destroy the connection rather than append diagnostics |
| JSON | Strict uncompressed JSON, validated byte limit default 102400; unsupported media/malformed/oversized input returns registered INVALID_REQUEST, without echoing payload |
| Validation | Typed schema-to-controller handoff, strict feature allowlists in fixtures, bounded safe issues without schema diagnostic text/input; canonical nested paths; Express query getter preserved |
| Pagination | Page 1 and size 20 defaults, maximum size 100; reject duplicates, unknown/operator keys, malformed numbers and unsafe offsets; supplied snapshot metadata |
| Runtime/build | Strict NodeNext build; compiled local listener, validated PORT, loopback-only default and bounded SIGTERM/SIGINT shutdown |

Production root API registration is empty until owning features exist. Request tests use synthetic fixture controllers delegating to a service spy; this proves middleware/controller handoff, not a real domain service or persisted business behavior. Consumers must use strict endpoint-owned schemas and approved safe response fields, and add auth/role/ownership/CSRF before enabling protected features. The generic validation helper does not grant access or infer policy.

## Verification

| Check | Observed result |
| --- | --- |
| Focused backend request/helper tests | Passed; 37 cases |
| Backend build and compiled startup/shutdown smoke | Passed |
| `SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 19 commands, 260 unit/component tests (including 37 backend), 30 browser cases, three production builds and seven HTTP smoke groups |
| CI report | `test-results/ci.json` (generated, Git-ignored); 2026-10-18T12:06:38.658Z to 2026-10-18T12:09:15.333Z; local execution, hosted run Not Run |
| MongoDB, transaction/concurrency, session/CSRF, actual domain endpoints and deployed probes | Not Run; owning tasks P03-002 onwards, no infrastructure or merchant activation implied |

Tests cover strict/unknown/raw operator input, malformed/primitive/oversized/media/encoding payloads, service call prevention on rejection, safe success/error correlation, sync/async/serialization fault redaction, path validation, pagination bounds/defaults/metadata and canonical nested validation errors. Compiled smoke starts an isolated loopback listener, checks the real 404 envelope, verifies graceful termination and redacted invalid PORT.

## Boundaries

No structured application request logger or DB readiness is claimed; those are P03-003. No credentialed CORS or CSRF implementation is claimed; those are P03-006. No placeholder endpoint returns successful login, health or catalog data. Multipart/provider parsers are not enabled by this ordinary JSON scaffold. Startup `.env` autoloading and deployed host configuration are not implemented; PORT comes from the process environment.

The project owner independently accepted this scaffold on 18 October 2026 under Tasks §2 and AGENTS §13. No milestone is self-approved.

## References

- [Express error handling](https://expressjs.com/en/guide/error-handling/)
- [Zod basics](https://zod.dev/basics)

## Verified source revisions

| File | SHA-256 |
| --- | --- |
| `backend/src/app.ts` | `301d62c4b16936c142d0b7d8876e1f3bfb70e7417b98f6f3ad84aef1a9941e92` |
| `backend/src/middleware/validation.ts` | `323d9f6dd20992392a2eb0b03a998f6e2f5743a7ff47562fa97ec0e038b4e206` |
| `backend/tests/app.test.ts` | `33108041fb8bb98317e37d4210370b11e7cf28e185868407a66b9d54c2e9b251` |
| `backend/tests/smoke.mjs` | `e0f457a020069a000cb16032362af2559b1568d55c1230fd59939a3daed5926b` |
| `package-lock.json` | `250d1298d156b3e21fb42363ebbed08ca40034592f8dc858839174d011c9e1da` |
