# P06-001 — Delivery zones and versioned charge management

**Date:** 26 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Done; accepted by project owner on 26 October 2026
**Revision:** Working tree based on `c176a659b5308cb0e27cf101362e830813eb2a05`; clean at kickoff.

## Scope and contract

Sources: FR-16/FR-28, [API §14.3](../API.md#143-delivery-promotions-content-and-settings),
[Database §7.6](../DATABASE.md#76-deliveryzones-and-deliverycharges--delivery),
[Testing ADM-05](../TESTING.md#73-targeted-account-support-and-settings-cases) and Tasks P06-001.
P09-013 was independently accepted before this work. This package implements one backend delivery
configuration feature; checkout/order integration, legal deadlines and both UI stages remain separate.

Owning contracts clarify bounded normalized coverage identifiers, paginated lists, future-only windows,
unchangeable explicit end boundaries, ETags and durable transition replay. No legal deadline, actual
coverage area or production price was invented. Protected administrator configuration supplies approved
zone/rate inputs through the canonical APIs; no zones or charges are seeded by setup.

## Implementation and safety

- Delivery owns canonical zone/charge models, explicit indexes, validated services and eight admin API
  operations. Routes delegate to services and cannot access private models. Authentication, account
  recheck, Origin/CSRF, strict input, bounded pagination and no-store responses follow existing APIs.
- Settings exposes only a transaction-required coverage-serialization capability. All charge decisions
  and zone-status changes acquire the same primary singleton counter before checks. It cannot change
  branding, policy pointers, payment flags or the settings edit ETag. Missing/index-mismatched or
  exhausted guard state fails closed. Affected zone fences advance in stable ID order.
- Global scheduled/active windows are half-open and cannot overlap for the same coverageKey, including
  across zones. Valid concurrent disjoint inserts both succeed with different rule versions under the
  guard; this is tested separately from duplicate-key rejection. Versions allocate across inactive history.
- Commercial amount, coverage key, start, zone and rule version are immutable. Supersession closes the
  predecessor and creates a new rule; different destination zones are allowed for the same key. The
  partial active-key index and unique historical key/version index are enforced by real MongoDB tests.
- Future starts remain scheduled. Immediate or future closure never rewrites a past interval or extends
  its original end. Once explicitly closed, a boundary cannot move. Previously configured original
  amounts and identities stay intact; references and old rule versions remain available.
- Activate/deactivate/supersede retain bounded private replay identities and original DTO snapshots.
  Exact actor/payload/revision/key replays survive later worker changes; conflicts cannot repeat effects.
  No charge PATCH/DELETE endpoint, generic persistence bypass or physical history deletion is added.
- The bounded activation worker uses the same global guard, expires ended rules and activates due
  eligible schedules. Concurrent workers are replay-safe. Disabled-zone schedules do not occupy all
  batch slots; unavailable, expired or merely scheduled coverage fails closed. The existing saved-address
  reader still resolves exact area before wildcard and refuses inactive selected exact zones.
- Window/fence/version/audit effects share real transactions. Failed audit or conflicting replacement
  rolls back predecessor closure, successor, counters and zone changes. Root composition registers the
  feature only with administrator auth enabled. Compiled bootstrap and worker entry points are exercised.

The eight routes move from planned to implemented: 77 implemented / 87 planned of the same 164-operation
inventory. OpenAPI/Postman/planned artifacts, runtime schemas and router-parity fixtures are synchronized.
No package, frontend, provider or collection outside the approved delivery data model was introduced.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, disposable MongoDB 8.0.16 replica sets with generated databases.
Synthetic users/zones/charges only. Local listener execution used sandbox escalation; no external MongoDB,
production data, live delivery configuration or operational credentials were used by integration fixtures.

| Command/check | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/delivery.test.ts` | Passed; 3 input/interval/key/identity/pagination cases |
| `npm run test:integration --workspace=backend -- tests/integration/delivery.test.ts tests/integration/profile.test.ts tests/integration/settings.test.ts tests/integration/composition.test.ts` | Passed; 67 tests: 17 delivery, 29 profile, 16 settings and 5 composition |
| `npm run test:integration --workspace=backend -- tests/integration/delivery.test.ts` after final two safety tests | Passed; 19 delivery tests. Consumer inputs were unchanged, so earlier consumer results remain valid. Final distinct integration coverage is 69 tests |
| `npm run api:generate --workspace=backend` | Passed; four artifacts |
| `npm run test:contract --workspace=backend` | Passed; 90 tests including executable router inventory, offline schemas, freshness and HTTP checks |
| `npm run build --workspace=backend` | Passed before compiled bootstrap/worker and consumer regression; subsequent edits were test/documentation only |
| `npm run lint --workspace=backend` | Passed; 246 files |
| `npm run typecheck --workspace=backend` | Passed after final test literal typing correction |
| `npm run lint:boundaries` | Passed; 262 files, zero violations |
| `npm run format:check` | Passed; 410 files; final added tests were formatted explicitly |
| `npm run test:smoke --workspace=backend` | Passed; real DB startup, liveness/restricted readiness, redacted configuration failure and graceful shutdown |
| `npm run test:security` | Passed; zero findings and zero dependency advisories; final two test-only additions contain synthetic data and introduce no dependencies |
| `npm run lint`, task register audit and `git diff --check` | Passed; documentation links/status consistency and whitespace review |

Current local reports: [integration](../../test-results/database.json) (latest focused 19-test run),
[security](../../test-results/security.json). Ignored machine reports are replaceable; commands/counts above
record this revision's observed results. Initial checks exposed nested Mongoose DTO typing, union narrowing
and an inferred test status string; these were corrected. An early lint run also found imports reserved for
not-yet-added compiled tests and string style; final checks pass. No runtime delivery integration tests failed.

## Rollout and recovery

[Operations](../OPERATIONS.md) owns additive local/test index setup, canonical settings prerequisites,
bounded worker scheduling, backlog monitoring and rollback. Local bootstrap refuses staging/production;
review their index rollout separately and reconcile incompatible existing coverage before enabling writes.
Preserve all versions, end boundaries, lineage, replay/audit and settings/zone counters on binary rollback.
Expired or scheduled coverage cannot substitute for an eligible active rule during worker delay.

**Not Run:** frontend/browser/theme review, deployed scheduler/staging, live operator coverage acceptance,
legal deadline review and checkout/order snapshot integration (those owning features are not implemented
by this package). Tests prove historical rule amount/identity preservation; they do not claim an actual
order lifecycle or COD checkout. P04-003/P09-011 and backend/product milestones remain unaccepted.

## Independent acceptance

On 26 October 2026 (Asia/Dhaka), after the implementation and verification handoff, the project owner
explicitly instructed: “done koro”. P06-001 is accepted as Done and its task checkbox is checked.
Acceptance covers the backend delivery configuration feature and recorded local verification; actual
checkout/order integration, client stages, deployed scheduler, legal/operator/provider/staging and
product milestone gates remain separate.
