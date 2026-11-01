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

## Package A owner response and configuration check — 1 November 2026

The owner confirmed no rule/sign-off or original-cash evidence references are available and delegated
preparation to the agent, stating that secrets are already configured in env. The agent inspected
only parsed key presence/empty state and admission booleans in the local `.env` and `.env.staging`;
no secret values were printed, copied, committed or changed. In both files:

- `DELIVERY_DEADLINE_POLICY_FILE`, `POLICY_APPROVALS_FILE` and
  `CHECKOUT_REQUIRED_POLICY_TYPES` are empty.
- `CHECKOUT_COD_ENABLED` is false.
- No original-cash evidence adapter/configuration is implemented in the configuration inventory.

Provider credentials are separate from policy approval and evidence of actual receipt. The above
findings do not assert that provider secrets are missing or invalid, and no provider connection or
external configuration change was attempted.

### Prepared delivery-rule review draft

This is a review proposal using the existing PRD planning target, not a signed manifest and not
new legal advice. It is deliberately not written into the activation environment.

| Field | Prepared value / required decision |
| --- | --- |
| Proposed version | `sportzone-delivery-v1-draft` |
| Timezone | `Asia/Dhaka` |
| Planning target | 14 calendar days from actual recorded `confirmedAt`, under the existing PRD; not a claim of a statutory allowance. |
| Before confirmation | `awaiting_start`; never invent `confirmedAt` or an absolute target from submission. |
| Applicable legal caps | Pending qualified determination of every applicable rule, source, start basis and duration. Do not substitute an empty array for an unknown determination. |
| Effective window | Pending the approved policy's actual effectiveFrom/effectiveTo. |
| Estimate | Pending the store's verified service-area/fulfillment arrangements; no promised estimate invented. |
| Approval evidence | Pending actual qualified reviewer identity/reference, date and publication authority. |
| Digest | Compute from the final approved normalized rule only; a matching digest does not establish legal applicability. |

To activate: resolve the pending decisions, prepare the existing strict manifest with genuine review
fields, retain it in the protected operator store, set its file reference and run the documented
read-only deadline preflight. Never populate approvedBy/evidenceRef with the executor or a fabricated
reference merely to satisfy validation. Full P06-003 acceptance remains Blocked. The user's delegation
allows implementation/draft preparation; it does not provide the absent qualified finding.

## Bangladesh source research and prepared operating policy — 1 November 2026

The owner further delegated Bangladesh-context policy preparation and confirmed the requested records
cannot be supplied. No repeat request for those records is made. The following proposal is prepared
for implementation/review; it is not fabricated qualified sign-off or a published customer promise.

### Sources actually inspected

- [Ministry of Commerce: Digital Commerce Operation Guidelines 2021](https://mincom.gov.bd/pages/static-pages/694032dc35ce18e1c0563903).
- [Official Gazette, 4 July 2021, pages 11245–11252](https://www.dpp.gov.bd/upload_file/gazettes/40432_35501.pdf).
- [DNCRP official laws inventory](https://dncrp.gov.bd/pages/laws), which lists the 2021 guidelines.

The ministry download and Gazette have the same eight-page text. Because extracted Bengali text is
corrupt, source PDF pages 5–8 were rendered and visually read. Downloaded source SHA-256:
`a2617e34a5bc672ea6c069af8640f2af28199616b8e66f5d33fdcd34c968cb6c`.
Source discovery does not establish that no amendment exists or that every provision applies to this
store's particular payment/fulfillment arrangement. No legal applicability certification is claimed.

Source observations, paraphrased: §3.3.1 describes courier handover within 48 hours after full payment;
§3.3.2 addresses prepaid delivery, with same-city five-day and other-city/village ten-day limits tied
to order acceptance. §3.1.17 requires clear Bangla terms. These are conditional provisions, not a
universal 14-day permission. Scope and exact trigger mapping need qualified determination.

### Prepared SportZone policy text

**Draft status: not published or activated.** Version candidate `sportzone-delivery-v1-draft`.

> SportZone কেবল checkout-এ সক্রিয় ও সমর্থিত delivery area-তে অর্ডার গ্রহণ করবে। Checkout-এর
> delivery charge, পণ্যের বিবরণ ও প্রযোজ্য policy version অর্ডারের সঙ্গে সংরক্ষিত থাকবে।
>
> অর্ডার জমা দেওয়া এবং অর্ডার নিশ্চিত হওয়া আলাদা ঘটনা। নিশ্চিত হওয়ার আগে কোনো অনুমানভিত্তিক
> delivery deadline দেখানো হবে না। প্রকৃত confirmation থেকে ১৪ calendar day আমাদের PRD-এর
> planning target; প্রযোজ্য কোনো ছোট সময়সীমা থাকলে সেটিই অগ্রাধিকার পাবে। এটি সব prepaid
> order-এর জন্য ১৪ দিন নেওয়ার অনুমতি নয়। Published estimate নির্ভর করবে যাচাইকৃত area ও
> fulfillment capability-এর ওপর; unavailable estimate-কে প্রতিশ্রুতি হিসেবে দেখানো হবে না।
>
> Order confirmation, shipment এবং delivery কখনো নিজে থেকে টাকা পাওয়া প্রমাণ করবে না।
> COD-এর ক্ষেত্রে প্রকৃত রসিদ/settlement যাচাইয়ের পরই collected amount রেকর্ড হবে।
>
> Dispatch-এর আগে customer cancellation request administrator অনুমোদন বা প্রত্যাখ্যান করবেন।
> অনুমোদনের সময় shipment ও allocation আবার যাচাই হবে। Uncollected COD-তে monetary refund
> থাকবে না; collected অর্থের জন্য বাস্তব source balance অনুযায়ী refund obligation তৈরি হবে।
> Provider payout request গ্রহণ করলেই refund completed দেখানো হবে না।
>
> Delivery ব্যাহত হলে reason ও customer communication সংরক্ষণ করতে হবে। Shipped order-এর
> ব্যর্থ delivery সাধারণ pre-shipment cancellation দিয়ে বন্ধ করা যাবে না; custody, inspection
> এবং প্রযোজ্য refund workflow অনুসরণ করতে হবে।

The proposed text stays within PRD FR-14/15/16 and existing payment invariants. It supplies no
invented courier name, pickup address, telephone number, service guarantee or receipt. Prepaid
handover/delivery rules are tracked as separate source-mapping obligations below, not silently
replaced by the commercial planning target.

### Specific contract mapping issue

| Item | Exact source / impact |
| --- | --- |
| Approved product boundary | PRD FR-16 requires shorter applicable deadlines and verification of their start events; API §11.3 and Database §7.2 govern immutable timing snapshots. |
| Current executable representation | `delivery-deadline.schema.ts` fixes target start to confirmedAt; legalCaps allow only placedAt/confirmedAt and whole calendar days. It has no full-payment start event or separate hourly courier-handover milestone. |
| Source requiring mapping | Gazette §3.3.1 and §3.3.2: full payment, handover and conditional geographic delivery rules must not be collapsed into one status/date. |
| Affected task | P06-003, then P06-011 confirmation and backend closeout. |
| Risk | Blindly inserting five/ten days, legalCaps=[] or a fabricated approval could claim compliance with the wrong event, geography or milestone. |
| Decision owners | Qualified policy approver for applicability/current authority; backend owner for a reviewed API/Database/Testing mapping and implementation. |
| Safe disposition | Keep deployed admission closed. Prepare a reviewed mapping before extending the model or setting an approved manifest. Existing synthetic tests and history are preserved. |

### Prepared COD receipt verification procedure

1. Before using collect, the authorized operator obtains an original store cash receipt or the actual
   settlement evidence. Do not invent a record to complete setup. Provider secrets cannot prove cash.
2. Bind the protected proof to canonical paymentId/order, BDT amount in integer poisha, normalized
   original receipt reference and actual collectedAt. Keep a private evidence reference and SHA-256
   of the original evidence; never expose receipt content or transfer credentials in public DTOs.
3. An out-of-band protected verifier checks those facts against the original source and supplies the
   existing codCollectionProof shape. Browser fields are a request to verify, never that source.
4. The existing service reauthorizes the current admin and commits collection, aggregate, correction
   obligation when needed and audit in one transaction. A repeated original receipt must not create
   another source, even under a new command key or order. Mismatch denies the write.
5. A later refund keeps the original collection and attempt identities; unknown payouts remain
   uncertain. Real evidence qualification is exercised with an actual authorized test receipt when
   available, while synthetic receipts remain explicitly local/test only.

No extra admin role or second-admin requirement is introduced. No activation manifest/env value,
financial record, real receipt or reviewer identity was manufactured. P06-003 and Package A remain
unaccepted; policy preparation and operational procedure are delivered within the owner's delegation.


## Configured approval authority follow-up — 1 November 2026

The Package A follow-up implements `deliveryDeadlineApprovalAccess`: confirmation must find an exact
normalized rule and review tuple in the independent configured registry. It checks the captured-time
window, digest and transaction; invented review identities, altered rules and future snapshots deny.
The registry is copied on composition. A protected file's digest/metadata integrity is still distinct
from actual qualified applicability. The previously recorded full-payment/hourly-handover mapping
issue is not silently encoded as another event. No signed/legal manifest is manufactured.

[Configured authority code and observed verification](./P06-011-012-local-lifecycle-cod.md#protected-authorities-and-configured-startup--1-november-2026)
supersedes earlier statements that the concrete cash verifier/startup adapter did not exist. Those
adapters are now implemented; real originals, qualified applicability and independent acceptance are
not supplied by synthetic local tests. The owner is not asked again to provide records already
confirmed unavailable.

## Prepaid timing mapping implementation — 1 November 2026

Owner reiterated responsibility for research, policy and implementation. This execution closes the
previously recorded software mapping gap; it does not create physical cash facts or independent
review records. Source observations and qualified-applicability limits above remain distinct from
software behavior. Existing staged authority/runtime work was preserved.

### Delivered behavior

- A reviewed rule can optionally supply prepaid ruleRef, handoverHours and deliveryCalendarDays.
  No country-derived default, reviewer identity or legal maximum is injected. Old rules/digests remain
  compatible because the new object is optional; all policy subobjects are frozen at capture.
- Online delivery cap starts at order placement, while courier handover uses elapsed hours from the
  actual verified full-payment collection event. Confirmation retains its separate calendar-day target.
  Pending, met and overdue handover states remain distinct from final delivery. COD excludes prepaid
  rules. Missing method/payment facts never become successful paid/fulfilled claims.
- Payments reconstructs full funding in the same transaction from bounded canonical verified online
  source collections, ordered by collectedAt. Source allocations must exactly reconcile to the payment
  aggregate; missing, mismatched, oversized, non-online or future facts fail closed. Collection time is
  never taken from the request, confirmation or delivery. The clock is injectable for deterministic tests.
- Confirmation first validates current admin/funding/policy/allocation, freezes fullyPaidAt in the
  operational commitment, and persists the resulting earliest delivery cap atomically. Proof absence
  rolls back the earlier payment revision fence and leaves the order pending.
- Checkout quote and order-time snapshots preserve the optional rule and payment context. Owner/admin
  reads use the frozen funding event after confirmation and project the separate handover milestone;
  before confirmation they may read current verified funding. Late shipment is visible, not hidden by
  changing a deadline or disallowed from recovery solely because it is late.
- Strict Mongoose/BSON models admit the optional rule/frozen event. Explicit local/test bootstrap
  recognizes only exact current/known predecessor validators and additively upgrades without record
  rewrites or index drops; unknown drift fails. Postal compatibility uses the same known-schema upgrade.
  No DDL was applied to an external database and no server-startup auto-migration was added.
- API/Database/Operations contracts and generated artifacts describe the new optional fields. Product
  scope remains unchanged; a configured numerical rule is not a qualified determination of its scope.

The synthetic reviewed test rule uses 48 elapsed handover hours and five placement-based delivery
calendar days. Those values test the independent milestones and conservative review candidate;
they are not installed as a signed operating policy or universal statement of current Bangladesh law.

### Actual verification

Local Node/npm, isolated MongoDB 8.0.16 replica sets and actual HTTP; provider/cash/policy fixtures
remain explicitly synthetic. Compiled bootstrap tests use the updated backend build.

| Command | Observed result |
| --- | --- |
| `npm run build --workspace=backend`, `npm run typecheck --workspace=backend` | Passed; typecheck rerun after the final negative assertion. |
| `npm run api:generate --workspace=backend`, `npm run test:contract --workspace=backend` | Four artifacts generated/current; 112 contract tests Passed. |
| `npm run test:unit --workspace=backend -- --reporter=dot --reporter=json --outputFile=../test-results/package-a-timing-unit.json` | Passed: 795 tests / 46 files; includes paid/confirmation/placement separation, COD exclusion and invalid events. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts orders.test.ts payment-records.test.ts payment-correction-migration.test.ts payment-initiation.test.ts --reporter=dot --reporter=json --outputFile=../test-results/package-a-timing-regression.json` | Passed: 360 tests / 5 files, including quote/order persistence, payment/lifecycle, canonical migration and source-driven timing. |
| `cd backend && ../node_modules/.bin/vitest run --config vitest.integration.config.ts checkout-quote.test.ts -t 'Package A prepaid timing' --reporter=dot --reporter=json --outputFile=../test-results/package-a-prepaid-final.json` | Passed: final stronger assertion also proves missing source rolls confirmation/payment revision back, then restored original proof permits the same command. No business logic changed after the five-file run. |
| `npm run lint --workspace=backend`, `npm run lint:boundaries` | Passed: 434 linted files; 395 source files, zero errors. |
| `npm run test:smoke --workspace=backend` | Passed: compiled real DB startup, redacted failures, liveness/restricted readiness and graceful shutdown. |
| `npm run format:check`, `git diff --check` | Passed; scoped format inventory 599 files. |

Early focused iterations exposed a fixture clock before policy effectiveAt, strict quote-schema
propagation gaps and missing payment context in order-time projection. Those were corrected across
actual consumers before the passing regression. A TypeScript optional-metadata error was corrected.
One intermediate documentation check ran before its new evidence anchor existed and reported five
broken links; the anchor is supplied here and the final check is recorded separately. No failed run
is represented as Passed.

Current source/test/script/API/tooling delta relative to preserved HEAD `2158e05`:
25 sorted changed/untracked paths under backend/src, backend/tests, backend/scripts, backend/api and
tests/tooling, encoded path + NUL + bytes + NUL. SHA-256:
`10d2778a0f7e27dbe649ab7ac3020e8b60e9769ba4a6a0f5abdc9d2feb8016e8`.
Documentation/env templates are outside this hash. Local JSON reports are ignored replaceable evidence.
No commit/push, actual provider/cash operation, deployed activation or external migration was performed.

### Acceptance distinction

The timing representation/integration gap is now implemented and verified, superseding the earlier
statement that no full-payment/hourly mapping existed. Real policy applicability/qualified review,
operator original-cash qualification and independent full-task acceptance have not occurred through
these automated tests. No such event, reviewer or receipt is manufactured. Tasks retain their full-task
status; passing engineering checks does not retroactively invent a prerequisite acceptance.


Final repository checks Passed: 773 files, 1553 local links, zero errors. Security scan Passed.
A final editor formatting/import-order change in payment.service.ts was inspected and normalized to
repository formatting; business logic was unchanged. Final format check Passed (599 files) and
`git diff --check` Passed. The source hash above includes the final formatting/import order.
