# P06-003 — Delivery deadline policy boundary

**Date:** 26 October 2026 (Asia/Dhaka)
**Executor:** Codex
**Status:** Blocked for required qualified policy/compliance sign-off; local technical implementation accepted by project owner on 26 October 2026
**Revision:** Working tree based on `690a0210714a137e62b056110108c2882c6a2880`; clean at kickoff.

## Scope and unresolved acceptance

Sources: FR-16/FR-26, [API §11.3](../API.md#113-cancellation-fulfillment-and-shipment),
[Database §7.2](../DATABASE.md#72-orders--checkout--orders),
[Testing ORD-06](../TESTING.md#103-required-orderdelivery-assertions), Tasks P06-003.
P06-001 is accepted. The owner requested the next feature and delegated implementation decisions:
“doc onujai jeta vhalo hoy koro”. That instruction does not supply a qualified legal review, approved
machine rule or evidence of an applicable statutory start event/duration.

Task acceptance requires the planning target not to override a shorter applicable rule, and its evidence
requires a compliance sign-off reference. Database §7.2 requires under_review/awaiting_start and blocked
affected acceptance/confirmation when the approved rule or required event is missing. API §11.3 requires
approved legal applicability/start events. These sources agree; no conflict was resolved by weakening them.
The outstanding inputs remain [EXT-07/EXT-08](./P01-024-foundation-readiness.md#external-inputs-and-affected-gates).

**Decision owner:** store owner/authorized policy approver, with qualified current legal review and store
operations input. Required evidence: approved exact rule/version, applicable start events/caps (including
an explicitly reviewed no-additional-cap determination if applicable), effective window and durable
review reference/reviewer/date. No actual rule/sign-off was supplied, so this task is not accepted and
its checkbox remains unchecked. Technical preflight success is not legal approval.

## Implemented local capability

- Orders owns strict deadline rule/basis/event/public projection validators and a stateless domain
  service. No new collection, order mutation, HTTP route, provider, dependency or frontend was added.
  Configuration owns protected file loading; one compiled read-only preflight consumes the capability.
- No 14-day default is installed. Missing, inactive, future-review or digest-mismatched configuration
  cannot produce a new checkout snapshot. Preview returns under_review/unconfigured with no dates.
  requireConfirmation refuses an incomplete or unreviewed commitment. These are domain guard functions,
  not a claim that actual checkout/confirmation HTTP integration already exists.
- A protected operator manifest binds normalized machine rule content to a review digest/reference.
  Hash matching establishes integrity only; underlying qualified review must exist independently.
  Explicit target, optional estimate and bounded distinct legal caps use actual placedAt/confirmedAt.
- Checkout capture returns a copied, deeply frozen basis with capturedAt and review binding. Later
  configuration changes/expiry do not rewrite accepted basis. Public output omits reviewer/evidence/hash.
- Target starts at actual confirmation. An independently known placement cap may appear before that
  event, without a fabricated target/effective date. Once every required event exists, the earliest
  target/cap wins. Delayed confirmation and late reads never restart or extend an earlier legal cap.
- Calendar calculations preserve Asia/Dhaka wall-clock time, leap/month/year boundaries and milliseconds.
  Ambiguous/nonexistent local results fail closed. Malformed/future/contradictory event data produces
  under_review without definitive dates. No present-day legal fact is inferred from runtime timezone data.
- Approved estimates are separately projected after their real configured event and cannot extend a
  commitment. ETA/exception updates do not authorize rewriting snapshots, stock or coupon effects.
  Actual exception persistence, order CAS/audit and changed-estimate notification remain owning later
  order tasks; this package does not introduce a second order business API.

Owning API/Database sections now specify the exact immutable basis representation and reserved
unconfigured projection. Operations documents manifest ownership, technical preflight, independent review
and future consumer integration; Testing records the isolated versus order-transition evidence boundary.
.env.example contains only an empty optional manifest-path variable. No real policy file was created. A concurrent change to backend/src/config/notifications.ts appeared
during this work; it was preserved and is outside this task's implementation scope.

## Observed verification

Environment: Node 24.20.0, npm 11.19.0, runtime Intl timezone data. All rule values, caps, reviewers and
references are synthetic fixtures. No database, network, real policy evidence or production data is used
by the feature tests. Child-process tests required sandbox escalation after spawnSync returned EPERM.

| Command/check | Observed result |
| --- | --- |
| `npm run test:unit --workspace=backend -- tests/unit/delivery-deadline.test.ts` | Passed; 15 cases, including delayed COD, independent/overdue cap, missing events/review, immutable historical basis, timezone/leap/year/offset and estimate/public projection boundaries |
| `npm run build --workspace=backend` | Passed before final compiled preflight tests |
| `npm run test:integration --workspace=backend -- tests/integration/delivery-deadline.test.ts` | Passed; 3 protected-loader/compiled-preflight cases with real temporary files/subprocesses, no DB/network |
| `npm run lint --workspace=backend` | Passed; 252 files |
| `npm run typecheck --workspace=backend` | Passed |
| `npm run lint:boundaries` | Passed; 265 source files, no violations |
| `npm run format:check` | Passed; 416 files |
| `npm run api:check --workspace=backend` | Passed; four existing artifacts remain fresh; no new executable endpoints |
| `npm run test:security` | Passed; no secret findings or dependency advisories; subsequent binding-only refactor/test was reviewed without new secret/config/dependency inputs |
| `npm run lint`, task register audit and `git diff --check` | Passed; documentation/link/status and whitespace checks |

Local report: [latest focused integration](../../test-results/database.json). This ignored report is
replaceable; command/count evidence above describes this revision. Initial unit execution had 13 passes
and one failure caused by an assertion using the wrong public error wording; corrected assertion passed.
Initial sandbox integration had two passes and a subprocess-denial failure; the same suite passed with
local subprocess authorization. Final review removed preview's method-binding dependency and added a
passing isolated-capability regression; its unit/build/compiled consumer checks were rerun.

**Not Run:** real policy/legal applicability review, actual operator sign-off, persisted order/confirmation/
exception CAS/audit/notification, checkout HTTP integration, staging/production activation, UI/browser/theme
review and full integrated regression. No current law or qualified approval is claimed from fixtures.

## Rollout, recovery and next prerequisite

Run the documented preflight against a protected manifest only after qualified current review. Missing
configuration exits nonzero; malformed input reports only a static sanitized error. Installing a file,
computing its digest or successful preflight cannot waive the independent acceptance gate.

Future checkout/order consumers must use snapshotForCheckout and actual-event confirmation guards,
retain accepted basis/review evidence and keep operational estimates separate. Persistence/wiring must
be verified in those owning tasks; no current HTTP route was enabled by this work. Roll back the local
capability/CLI/config together without deleting any future accepted historical basis or approval evidence.
Resume P06-003 acceptance when the accountable owner supplies the approved rule and durable qualified
sign-off; verify its real manifest, then obtain independent task review. Existing provider/staging and
product milestones remain separate and unaccepted.

## Owner review of local implementation

On 26 October 2026 (Asia/Dhaka), after the technical handoff explicitly disclosed the remaining
compliance gate, the project owner instructed: “done koro”. This records acceptance of the delivered
local implementation and its verification. No exact approved rule, qualified compliance evidence or
sign-off reference accompanied the instruction. P06-003 therefore remains Blocked and unchecked under
Tasks §2 and its required compliance evidence; no external approval or milestone is inferred. On resume,
reuse the accepted local implementation and verify only the supplied rule/evidence and affected integration.

## Blocker recheck — 30 October 2026

No approved exact rule or qualified compliance sign-off reference was supplied during this review. Existing accepted fail-closed implementation is retained; no legal duration, approval or statutory applicability was invented.

The owner requested resolution of pending/blocked tasks. Protected evidence references were requested;
no secret values were requested or inspected. P06-003 remains **Blocked** because task-specific
external acceptance cannot be established by technical regression or generic completion instructions.

Owner response on 30 October 2026: “ami currently dite parchina tumi kono ekta use kore naw”.
Source selection is delegated, but no account/resource access, approved policy or qualified sign-off
is supplied. No synthetic substitute can establish the missing external acceptance; status remains
Blocked. Existing local test fixtures remain available without activating deployed integrations.
