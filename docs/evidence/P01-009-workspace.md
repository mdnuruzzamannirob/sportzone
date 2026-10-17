# P01-009 — Minimal npm-workspaces repository

**Reviewed:** 17 October 2026 (Asia/Dhaka)\
**Executor:** Codex\
**Task status:** Done\
**Verification:** Passed — clean install, workspace discovery, ignore rules and documentation checks

## Scope and authority

Implemented the minimal workspace shell required by [Architecture §4](../ARCHITECTURE.md#4-project-structure) and
[Implementation Plan §4.2](../IMPLEMENTATION_PLAN.md#42-repository-and-application-setup). Prerequisite P01-001 is Done.
The three private workspace manifests establish package discovery; frontend/runtime dependencies and feature code follow
in Phases 02–03. Application package version `0.0.0` identifies unreleased shells; the documentation baseline stays 1.0.

## Delivered files

| File | Delivered behavior |
| --- | --- |
| `package.json` | Private root; exactly storefront/admin/backend workspaces; Node 24 / npm 11 engine ranges; npm packageManager reference; workspaces:check script |
| `package-lock.json` | npm-generated lockfile v3; only local workspace packages and links; no third-party dependencies |
| `storefront/package.json` | Private storefront package manifest |
| `admin/package.json` | Private administration package manifest |
| `backend/package.json` | Private backend package manifest |
| `.nvmrc` | Verified Node 24.20.0 patch selection |
| `.npmrc` | engine-strict=true rejects unsupported toolchain ranges |
| `.gitignore` | Dependencies, build/test output, local env/credential files, logs and backup artifacts excluded; sanitized templates/lockfile retained |
| `.env.example` | Operations configuration vocabulary, local development origins, sandbox mode, blank secret/lifetime values and adapter-owned key handoff |
| `README.md` | Actual repository tree, verified toolchain/install/discovery commands, local origins and setup boundaries |
| `docs/TASKS.md`, `CHANGELOG.md` | Task evidence, execution status, counts and documentation history |

The application workspace directories contain only their manifests. There is no speculative shared package, extra service,
application endpoint, database schema implementation, fake build/test success or feature scaffolding.

## Repository tree

```text
sportzone/
├── storefront/package.json
├── admin/package.json
├── backend/package.json
├── docs/                       # Existing specifications and accepted evidence
├── .env.example
├── .gitignore
├── .npmrc
├── .nvmrc
├── package.json
├── package-lock.json
├── README.md
├── AGENTS.md
└── CHANGELOG.md
```

`node_modules/` is generated and ignored. Clean installation creates local symlinks to the three workspace directories.

## Toolchain and configuration

Verification used Node **v24.20.0**, npm **11.19.0**, Linux/zsh and an isolated temporary copy as well as the repository.
The [Node.js release schedule](https://github.com/nodejs/Release) lists Node 24 as a supported LTS line. This record pins
the locally verified patch, without claiming it is the newest release. Compatible tool updates require refreshed evidence.

The root uses [npm's workspace configuration](https://docs.npmjs.com/cli/v11/using-npm/workspaces/);
[private manifests and engine declarations](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/) document package
and toolchain boundaries. [npm ci](https://docs.npmjs.com/cli/v11/commands/npm-ci/) installs from the lockfile.
No dependency package or install lifecycle script was added.

`.env.example` follows [Operations Appendix B](../OPERATIONS.md#appendix-b--configuration-inventory). Local-only origins
use storefront port 3000, admin 5173 and API 4000; these are setup conventions, not deployed/listening services. Credentials,
proof-key version and owner-approved quote/upload lifetimes remain blank. The actual MongoDB URI must identify an isolated
transaction-capable deployment. No synthetic credential, guessed lifetime or fake provider activation is supplied.

Adapters will introduce their exact merchant/refund/email/media/calendar/worker/monitoring/backup keys with runtime
validators and protected per-key inventory. No runtime currently consumes the template; environment validation belongs
to P03-003 and the corresponding adapter tasks. Future public frontend variables may contain public configuration only.

## Executed verification

Commands ran from the repository root unless the environment column says otherwise. npm cache was directed to
`/tmp/sportzone-p01-009-npm-cache`; no credentials or registry configuration were printed.

| Command / check | Environment | Observed result |
| --- | --- | --- |
| `node --version`, `npm --version` | Repository | Passed: v24.20.0 / 11.19.0 |
| `npm install --package-lock-only --offline --ignore-scripts --no-audit --no-fund` | Repository | Passed: npm generated lockfile v3 from local manifests |
| `npm ci` | Repository | Passed: three local workspace packages installed; lockfile unchanged |
| `npm ci --offline --ignore-scripts --no-audit --no-fund` | Repository and isolated temporary copy | Passed: both installs link exactly three local packages, without registry downloads |
| `npm run workspaces:check` | Repository | Passed: storefront, admin, backend resolved to local directories, no missing dependency |
| `npm pkg get name private --workspaces` | Repository | Passed: exactly three correctly named private packages |
| `npm run` | Repository | Passed: only workspaces:check exposed; no fake quality/build scripts |
| `npm ls --workspaces --depth=0 --json` and symlink targets | Isolated temporary copy | Passed: exact workspace set and paths; copied lockfile unchanged |
| `npm run build --workspace=storefront` | Repository; deliberate negative check | Passed assertion: exit 1, Missing script: build; no silent skip or fabricated successful build |
| `git check-ignore --no-index --stdin` | Repository; 13 excluded paths | Passed: all selected env, credential, dependency, build, backup and test artifacts ignored |
| `git check-ignore --no-index --stdin` | Repository; five retained paths | Passed assertion: exit 1 / no matches; sanitized templates, manifests, lockfile and .npmrc retained |
| Incompatible Node engine requirement in copied manifest; offline npm ci | Isolated temporary copy | Passed assertion: nonzero exit / EBADENGINE; engine-strict rejects unsupported engine |
| Template/manifest/lockfile inspection | Repository | Passed: empty secret values, no token/private key, no third-party dependency, only local workspace lock entries |
| `python3 /tmp/p01-009-verify.py`, `git diff --check` | Repository | Passed: source preservation, task graph/counts, Markdown references/structure and whitespace |

Workspace output:

```text
sportzone@0.0.0
├── admin@0.0.0 -> ./admin
├── backend@0.0.0 -> ./backend
└── storefront@0.0.0 -> ./storefront
```

Ignore-rule probes covered `.env`, `backend/.env`, `admin/.env.local`, `storefront/.env.production`, dependency output,
backend dist, Next cache, coverage, test-results, playwright-report, backups, `.aws/credentials` and a backend private-key
path. Retention probes covered root/backend `.env.example`, `package-lock.json`, `storefront/package.json` and `.npmrc`.
These were path probes; no real secret files were created or read. New source files were inspected before handoff;
ignore rules do not substitute for secret review and do not untrack existing files.

The executable local verification harness and full sanitized command output are recorded for this session in
`/tmp/p01-009-runtime.py` and `/tmp/p01-009-runtime-results.json`. The durable observations above allow review after
those temporary session artifacts expire. No commit, stage, push, publication or external service mutation was performed.

## Handoff and acceptance boundary

P01-010 adds/verifies the baseline CI and available quality checks. Application development, lint, types, unit/integration/
contract/E2E/security/coverage and build commands are **Not Run / not yet implemented**; they are owned by the subsequent
foundation/application tasks under [Testing §5.3](../TESTING.md#53-standard-execution-interface). This workspace task does
not claim application, MongoDB transaction, gateway, deployment or M1 acceptance. Required checks must fail when absent,
rather than use passing placeholders or --if-present to conceal missing setup.

## Acceptance

Accepted by the project owner on 17 October 2026 (Asia/Dhaka): “Workspace foundation গ্রহণ করছি”.
Independent acceptance is recorded under [TASKS §2](../TASKS.md#2-task-management-conventions) and
[AGENTS §13](../../AGENTS.md#13-task-completion--reporting); P01-009 is Done.
This acceptance covers the workspace foundation and observed checks; milestone and application acceptance remain separate.
