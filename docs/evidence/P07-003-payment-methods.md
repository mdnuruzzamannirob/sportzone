# P07-003 — Payment-method availability

Status: **Done**, project-owner acceptance recorded below. Executor: Codex, 29 October 2026.
Revision: working tree based on `f72cd0ed3cc381c3402c2a7a46576321519ffad1`.
Sources: FR-12, [API §12](../API.md#12-payments-cod--gateway-callbacks), [Architecture §10.1](../ARCHITECTURE.md#101-checkout-and-online-payment),
[Testing §11](../TESTING.md#11-payments-returns--refunds-test-cases).

## Delivered behavior and boundaries

`GET /api/v1/checkout/payment-methods` returns only active methods, using current store flags plus
qualified merchant evidence for online channels. General reads need no session; every response is
no-store. No amount means active online channels remain ineligible with AMOUNT_REQUIRED. Advisory
integer-poisha input is validated strictly and cannot authorize collection.

An order context requires a real customer owner or scoped guest proof. A present invalid customer
cookie cannot fall back to a guest credential. Private order/payment projections determine original
method and canonical remaining merchandise funding; advisory amounts cannot override them. Fully
funded online or cancelled orders expose no selectable methods. Missing canonical/settings persistence
fails closed. Ownership checks use existing auth services; controllers contain no model imports.

The Payments module owns availability service/schema/router. Auth owns session/principal resolution,
Orders owns its narrow ownership projection, Settings owns store flags, and Payments owns its balance
projection. Root setup wires these capabilities and shares the same verified evidence projection with
checkout quotes. No shared-to-business imports or frontend/backend runtime boundary changes.

`loadPaymentChannelApprovals` validates an operator-controlled, bounded approval manifest and
SHA-256-matched evidence files before startup composition. Qualification binds app environment,
gateway mode, merchant fingerprint, explicit channel key, approved amount intersection, reviewer,
evidence reference and verification lifetime. Settings flags alone never activate online methods.
Unknown/missing evidence denies online availability; malformed, expired, wrong-account/environment or
tampered qualifications refuse configuration. Lifetime is rechecked on each read/quote. Source artifact
changes require reviewed replacement/restart; disabling the current store flag revokes publication.

These files are a protected operator approval register, consistent with the existing policy-evidence
configuration pattern. A hash proves artifact integrity, not merchant authorization by itself: the
merchant owner must supply and approve authoritative evidence. No real qualification was supplied or
invented. Tests inject explicitly synthetic authority; no mock proves channel activation.

## Contracts and rollout

Updated API §12 clarifies unknown amount, advisory queries and owned remaining balance; Operations
owns manifest fields, evidence provisioning/revocation and restart/recovery. Testing records the
safety matrix. Generated OpenAPI/Postman/planned artifacts now identify 86 implemented operations
and 78 planned operations (164 total). Router parity includes the new route owner. No new package,
script, collection, migration or CI inventory entry needed; existing discovery includes these tests.

The API is available with reviewed existing settings persistence even without checkout/identity
activation. Customer/guest order reads still require their owning enabled auth configuration.
Merchant evidence can qualify availability/quotes, but no online initiation, callback or receipt
writer is connected by this task. P07-004/005/006/013 and existing checkout review gates remain separate.
All three online channels and COD retain their individual live launch requirements.

Roll back by disabling store flags or removing the evidence-file setting/restarting, retaining all
approval artifacts and financial histories. No historical order/payment data is rewritten. Surrounding
concurrent import-order edits in existing provider files were preserved; repository formatting was
applied without changing provider behavior.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, isolated MongoDB 8.0.16 replica set, local HTTP/Supertest.
No external account, provider or production financial call.

| Command | Result |
| --- | --- |
| `npm run test:unit --workspace=backend -- payment-methods.test.ts` | Passed, 26 tests |
| `npm run test:integration --workspace=backend -- payment-methods.test.ts checkout-quote.test.ts` | Passed, 62 tests: initial 17 availability + 45 checkout/expiry/guest consumers |
| `npm run test:integration --workspace=backend -- payment-methods.test.ts` | Passed final expanded availability suite, 19 tests |
| `npm run test:contract --workspace=backend` | Passed, 99 tests; 4 generated artifacts verified |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run build --workspace=backend` | Passed |
| `npm run lint --workspace=backend` | Passed, 316 files |
| `npm run lint:boundaries` | Passed, 308 files, zero errors |
| `npm run format:check` | Passed, 480 files |

Local report: `test-results/database.json` (latest focused availability run). Coverage includes general
COD fallback, flag-only online denial, all three synthetic qualified channels, exact bounds, missing
amount, proof expiry, evidence tampering, revoked/suspended sessions, guest/customer isolation, duplicate
cookies, canonical partial funding, fully funded/cancelled orders, missing payment/settings state,
CORS/preflight/HEAD/body/query rejection and real root composition. No initiation endpoint is enabled.
Existing checkout regression passed; unchanged consumers were not repeatedly rerun after fixture fixes.

Development failures were corrected: initial HTTP tests assumed 422/403 rather than the existing
400 validation/401 proof contracts, and used an incorrect settings index/collection name. Contract
inventory initially expected the previous endpoint counts/route owner. An expired-session fixture
initially used a string where identity requires ObjectId, then violated persisted expiry constraints;
it now tests actual expiry using the guest service clock. Unused imports and concurrent formatter drift
were corrected; no security/validation rule was weakened to pass a test.

Final checks: `npm run lint` passed (625 files, 1392 local links, zero errors),
`npm run api:check --workspace=backend` passed (4 artifacts), and `git diff --check` passed.
The initial evidence API section anchor was corrected before the successful link check. Full backend-stage,
frontend/browser, deployment/container, real merchant evidence/credentials, live channel activation and
online collection/refund end-to-end checks: **Not Run**, separate acceptance scope. Reviewer decision:
accepted for the submitted availability scope; no milestone is accepted.

## Independent acceptance

Reviewer: project owner, 29 October 2026. Decision: accepted through explicit instruction
“done koro” after the implementation and verification handoff. P07-003 changes from In Review
to Done. Acceptance covers the availability API and recorded local verification; it does not
qualify actual merchant/channel activation, hosted payment initiation or a milestone.
This acceptance update changes documentation only; existing code verification remains applicable.
