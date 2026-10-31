import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'

// The required CI result and manual image workflow share one check, without deploy secrets.
const image = 'sportzone-backend:verify'
function docker(args, capture = false) {
  const child = spawnSync('docker', args, {
    ...(capture ? { encoding: 'utf8' } : { stdio: 'inherit' }),
  })
  if (child.error || child.status !== 0) throw new Error('Backend image verification failed')
  return capture ? child.stdout.trim() : undefined
}
try {
  docker(['build', '--pull', '--file', 'backend/Dockerfile', '--tag', image, '.'])
  docker([
    'run',
    '--rm',
    '--entrypoint',
    'node',
    image,
    '--input-type=module',
    '-e',
    `
    import { existsSync, readdirSync } from 'node:fs';
    for (const path of ['/app/.env', '/app/backend/.env', '/app/.git', '/app/admin', '/app/storefront', '/app/backend/src'])
      if (existsSync(path)) process.exit(1);
    for (const dir of ['/app', '/app/backend'])
      if (readdirSync(dir).some(name => name.startsWith('.env'))) process.exit(1);
    if (!existsSync('/app/backend/dist/server.js') || process.getuid() === 0) process.exit(1);
  `,
  ])
  const identity = docker(
    [
      'image',
      'inspect',
      '--format',
      'Image={{.Id}} User={{.Config.User}} Workdir={{.Config.WorkingDir}}',
      image,
    ],
    true,
  )
  if (!identity.includes('User=node ')) throw new Error('Unexpected runtime image user')
  mkdirSync('test-results', { recursive: true })
  writeFileSync(
    'test-results/container.txt',
    `${identity}\nBuild and limited runtime inventory verified; no hosted DB, health, provider, OS scan or deployment acceptance.\n`,
  )
} catch {
  console.error('Backend image build/runtime inventory failed; inspect the build log.')
  process.exitCode = 1
}
