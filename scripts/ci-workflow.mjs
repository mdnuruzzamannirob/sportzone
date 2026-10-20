import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { ciPlan } from './ci-plan.mjs'

export function workflowText(plan) {
  const jobs = plan
    .map(
      (scope) =>
        `  ${scope.name}:\n${scope.needs.length ? `    needs: [${scope.needs.join(', ')}]\n` : ''}    uses: ./.github/workflows/ci-scope.yml\n    with:\n      scope: ${scope.name}\n${scope.name === 'browser' ? '      prepare: true\n' : ''}`,
    )
    .join('')
  return `# Generated topology; verify with npm run ci:workflow after inventory changes.
name: CI
on:
  push:
  pull_request:
  workflow_dispatch:
permissions:
  contents: read
concurrency:
  group: ci-\${{ github.workflow }}-\${{ github.ref }}
  cancel-in-progress: true
jobs:
${jobs}  required-result:
    name: CI required result
    if: \${{ always() }}
    needs: [${plan.map((s) => s.name).join(', ')}]
    runs-on: ubuntu-24.04
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@de0fac2e4500dabe0009e67214ff5f5447ce83dd # v6.0.2
        with:
          persist-credentials: false
      - uses: ./.github/actions/ci-setup
      - uses: actions/download-artifact@d3f86a106a0bac45b974a628896c90dbdf5c8093 # v4.3.0
        with:
          pattern: ci-*-\${{ github.run_attempt }}
          path: test-results
          merge-multiple: true
      - name: Verify every job and current-run report
        if: \${{ always() }}
        env:
          CI_NEEDS: \${{ toJSON(needs) }}
        run: npm run ci -- --aggregate
      - name: Preserve aggregate
        if: \${{ always() }}
        uses: actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02 # v4.6.2
        with:
          name: ci-result-\${{ github.run_attempt }}
          path: test-results/ci.json
          if-no-files-found: error
`
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (
    readFileSync('.github/workflows/ci.yml', 'utf8') !==
    workflowText(ciPlan(process.cwd()))
  ) {
    console.error(
      'CI workflow topology differs from inventory; regenerate and review the workflow',
    )
    process.exitCode = 1
  }
}
