# P01-017 — Development tooling verification

Date: 20 October 2026 (Asia/Dhaka). Executor: Codex. Status: Done; accepted by the project owner on 20 October 2026.

## Scope and implementation

Sources: Architecture §4.2; Operations §5.2; Testing §§15.4–15.5; Implementation Plan §3.6.
P01-015 documentation acceptance remains separate. Stable tooling implementation may proceed under
Implementation Plan §3.6; no document, feature or milestone acceptance is inferred.

- Root `npm run dev` starts both UI servers and one TypeScript compiler watch using the existing
  backend tsconfig. Initial successful emit starts the API, later successful builds restart it after
  graceful termination, and API runtime failure stops the coordinator. This avoids separate initial
  build and watch compilations. Owned POSIX process groups receive SIGTERM, then SIGKILL after at most
  12 seconds; SIGINT/SIGTERM return 130/143. Completed setup groups are removed from ownership before
  their process IDs can be reused.
- Only the API loads optional `.env` and validates configuration before database/HTTP access. The
  existing explicit local DB tool runs separately. The command creates no credentials, data, migrations,
  workers or provider effects. Compiler errors retain the last successful API until a valid rebuild.
- `lint:boundaries` uses the TypeScript parser for literal imports, re-exports, dynamic imports and
  require calls. Checks cover workspace/source isolation, declared package imports, shared purity,
  private backend persistence and transitive browser imports of Node/server-only/`.server` code.
  Supported aliases are the existing storefront `@/` and relative NodeNext `.js` imports. Computed
  module specifiers, custom loaders and future aliases require explicit review; this is a guard,
  not a replacement for framework builds, type checks or security review.
- `format:check` and `format` own only the coordinator, backend compiler/restart helper, boundary checker and tooling tests.
  No legacy application source is reformatted. Root Biome 2.5.15 and TypeScript 6.0.3 declarations
  reuse existing locked versions; no dependency versions or additional installed packages change.
- The root unit command includes the new tooling suite. The shared CI inventory adds two real
  checks without another hosted job, install, report aggregator or duplicated application build.

## Verification

| Check | Result and environment |
| --- | --- |
| Initial `npm run test:unit` outside sandbox | Passed — 30 repository/tooling cases; the subsequently added watch regression was checked separately below, without rerunning unrelated cases |
| Focused `TOOL-10` execution | Passed — real TypeScript compile/restart, invalid compilation retaining the running API, then runtime exit propagation and cleanup |
| `npm run lint` | Passed — 271 repository files, 1,112 local links, zero errors |
| `npm run lint:boundaries` | Passed — 96 current source files, zero boundary errors |
| `npm run format:check` | Passed — four tooling files; no legacy source formatting |
| `npm ls --depth=0` | Passed — root and workspace declarations resolve at the existing pinned versions |
| Inventory and final log inspection; `git diff --check` | Passed — 23 configured commands, both new guards present, no native assertion in the final startup/shutdown log, no whitespace errors |
| `MONGOMS_DISTRO=ubuntu-24.04 node /tmp/sportzone-P01-017-smoke.mjs` outside sandbox | Passed — actual coordinator entrypoint compiled/watched backend and started all apps; API liveness, storefront and admin returned HTTP 200; SIGTERM returned 143 and all three listening ports were released |
| Full application suites, security scans and provider/deployment verification | Not Run — no application business implementation or dependency versions changed; this task does not accept provider/deployment readiness |

The first offline lockfile update failed because registry metadata was absent from the npm cache. The normal
script-free lockfile-only update then succeeded; the lockfile adds only two root declarations for existing
versions. No forced upgrade or audit fix was used. Fixtures require nested processes outside the sandbox.

Actual startup artifacts are ignored local files: `test-results/P01-017-dev.json` and
`test-results/P01-017-dev.log`. The temporary smoke driver used an ephemeral MongoDB 8.0.16 replica
set, synthetic local configuration, random disposable secrets and disabled identity/provider activation.
It reserved the documented ports before starting and stopped its replica afterward. It exercised the
actual coordinator entrypoint without another production build of the UIs or a full application test run.
Linux execution was verified; macOS and WSL are supported by the POSIX process-group design but Not Run here.
UI visual acceptance is Not Run and outside this tooling-only change.

References: Node's [detached process-group behavior](https://nodejs.org/api/child_process.html#optionsdetached)
and Biome's [formatter CLI](https://biomejs.dev/reference/cli/#biome-format). These support the existing
Node/Biome implementation without another orchestrator dependency.

## Acceptance boundary

Implementation and focused local verification were submitted for review and accepted by the project owner.
P01-015 documentation acceptance, P01-016 hosted/settings acceptance and milestones remain separate.
Recovery is reverting these tooling/configuration changes; no application data migration is involved.

## Focused corrections during review

The first startup check returned HTTP 200 and released ports, but subsequent log review found a native
Node `--watch` shutdown assertion. A parent-only signal change still reproduced the assertion and a
port-release failure; it was not accepted. The final implementation uses the existing TypeScript compiler
watch API and a directly owned API process instead. Final real startup/shutdown passed with no native
assertion, and no listener remained on the three application ports.

After removing completed setup groups from shutdown ownership, only the five `TOOL-06–09` process cases
were rerun and passed. The added `TOOL-10` regression separately passed using a tiny real TypeScript project:
initial compilation starts the API, a source edit replaces the old API process, an invalid compilation
retains the running API, and a runtime exit propagates code 5 and stops the coordinator. The original
30 cases and this new case are 31 distinct verified cases;
no combined full-suite rerun is claimed. Final startup was rechecked after eliminating duplicate initial
backend compilation. The corresponding commands were:

```sh
node --test --test-isolation=none --test-name-pattern='TOOL-0[6-9]' tests/tooling.test.mjs
node --test --test-isolation=none --test-name-pattern='TOOL-10' tests/tooling.test.mjs
```

Next.js generated a local `storefront/AGENTS.md` during development startup. It is ignored as a generated
local artifact; repository policy remains in root AGENTS.md. No user-authored source or instructions were removed.

## Owner acceptance

On 20 October 2026, the project owner replied “so do it” to the explicit request to accept P01-017 and
update its status, checkbox, counts and acceptance log. Reviewer/approver: project owner. Executor: Codex.
Decision: accept P01-017; In Review → Done. The previously recorded verification supports this task
acceptance; no new runtime test or milestone/provider/hosted CI acceptance is claimed. P01-015 and
P01-016 remain In Review under their own acceptance requirements.
