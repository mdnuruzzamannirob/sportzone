# P03-003 — Environment, health and observability foundation

**Date:** 18 October 2026\
**Executor:** Codex\
**Status:** Done\
**Independent acceptance:** Project owner, 18 October 2026 — “Runtime/health foundation গ্রহণ করছি”

## Scope and governing sources

[Task](../TASKS.md#phase-03--authentication-and-core-backend), Architecture §§11–13, API §§3/7/16.4 and Operations §§3/9/Appendix B govern this change. P03-001 and P03-002 are independently accepted. API and Operations now document the specific operational probe credential, safe response and configuration contracts. No business collection, monetary transition or customer/admin session behavior changed.

## Delivered behavior

| Area | Implementation |
| --- | --- |
| Environment | Required validated runtime/release/DB/origin/secrets, documented defaults, matching APP_ENV/NODE_ENV and secure deployed origins; static field-name-only configuration errors |
| Startup | Validate before connection/binding; require actual replica-capable DB before accepting HTTP; safe failed-start cleanup; loopback bind default |
| Liveness | Minimal live payload, independent of an outage after startup; operational ingress remains a deployment requirement |
| Restricted readiness | Separate 32-byte monitor credential in Bearer header, fixed-length timing-safe byte comparison, no cookie/query fallback; 401 before DB checks; connected serving state plus bounded ping or generic 503 |
| Correlation/logging | Fresh server request UUID plus lifecycle operation UUID, structured UTC/environment/service/release/level/event/status/code/duration; no raw URL, query, params, headers, body, environment values or exception text |
| Shutdown | Mark draining before HTTP close, ten-second HTTP drain bound, DB destroy, idempotent close and safe lifecycle logging |

SESSION_SECRET and HEALTH_MONITOR_TOKEN must be distinct cryptographically generated 32-byte lowercase hex values; format validation does not provision operator secrets. None were written into source. `.env` files are loaded only when the operator explicitly supplies Node's env-file flag; tests use generated credentials and owned MongoDB processes.

## Verification

| Check | Result |
| --- | --- |
| Focused backend unit/request suite | Passed; 72 cases |
| Focused real MongoDB/runtime suite | Passed; 29 cases across three files |
| Compiled startup/health/shutdown smoke | Passed with an owned real replica |
| `MONGOMS_DISTRO=ubuntu-24.04 SPORTZONE_WEBKIT_EXECUTABLE=/tmp/sportzone-browser-libs/webkit.sh npm run ci` | Passed; all 20 commands, 295 unit/component cases, 29 DB integration cases, 30 browser cases, three builds and seven HTTP smoke groups |
| CI report | `test-results/ci.json`; 2026-10-18T12:37:35.359Z to 2026-10-18T12:40:17.843Z; Node 24.20.0/npm 11.19.0, local execution; hosted run for this change Not Run |
| Integration/browser reports | `test-results/database.json`: 29/29, zero failures; `test-results/ui-report.json`: 30 passed, zero skipped/unexpected/flaky |
| Deployed ingress/TLS, credential provisioning/rotation exercise, external collector/alerts, production dependency failures | Not Run; operational/release gates |

The temporary WebKit launcher is the existing host-library compatibility override; CI uses its normal Ubuntu browser installation. The lockfile SHA-256 recorded by CI is `fb2dacb33edaf9d030808b2ace7e037eafc40e2aef9b4c86f5868461cbb03236`. No dependency or CI inventory changes were required.

Unit/request tests cover missing/invalid secrets and config, safe diagnostics, caller correlation rejection, operational authorization ordering, health status/body/cache and exception/log redaction. Real runtime cases prove actual DB startup/readiness, port-collision cleanup, refused DB connection before listener creation, liveness while the connection is closed, and HTTP/DB shutdown without duplicate stop events. These do not prove production failover or real financial recovery.

## Operational boundaries

Current readiness describes the implemented HTTP/Mongo serving foundation, not complete product, gateway/channel, worker or release readiness. Add essential dependency/capability checks with their owning features; healthy HTTP does not attest stock/payment/refund correctness. Customer/admin sessions and browser CORS/CSRF remain P03-005/006. Deployment proxy/firewall must restrict operational ingress and provide approved TLS. No infrastructure, private credentials, alert vendor or production deployment was provisioned by this task.

All configured test checks remain required; CI uses the existing isolated real MongoDB and cross-browser harnesses. Historical P03-001/P03-002 evidence describes earlier delivery boundaries; current README/API/Operations/Testing describe the integrated runtime.

The project owner independently accepted this runtime/health foundation on 18 October 2026 under Tasks §2 and AGENTS §13. No milestone or operator gate is self-approved.

## References

- [Node crypto timing-safe comparison](https://nodejs.org/docs/latest-v24.x/api/crypto.html#cryptotimingsafeequala-b)
- [Runtime process environment](https://nodejs.org/docs/latest-v24.x/api/process.html#processenv)
