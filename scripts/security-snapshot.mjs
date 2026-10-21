import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, lstatSync, mkdirSync, realpathSync } from 'node:fs'
import { dirname, isAbsolute, relative, resolve } from 'node:path'

// Include tracked files even if now ignored, plus non-ignored new source files.
// Never copy ignored local configuration, generated output or symlink targets.
export function snapshotWorkingTree(root, destination) {
  const listing = spawnSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16777216,
      timeout: 30000,
    },
  )
  if (listing.error || listing.status !== 0) throw new Error('Working-tree inventory unavailable')
  const base = realpathSync(root)
  mkdirSync(destination, { recursive: true })
  for (const name of new Set(listing.stdout.split('\0').filter(Boolean))) {
    const source = resolve(base, name)
    // Deleted tracked files remain checked by the independent history scan.
    if (!existsSync(source) || !lstatSync(source).isFile()) continue
    const local = relative(base, realpathSync(source))
    if (isAbsolute(local) || local === '..' || local.startsWith('../'))
      throw new Error('Working-tree file escaped repository')
    const target = resolve(destination, name)
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
  }
}
