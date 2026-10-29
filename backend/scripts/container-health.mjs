import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

// Liveness only: readiness stays protected and no monitor credential enters this command.
async function containerLiveness(environment = process.env) {
  const rawPort = environment.PORT ?? '4000'
  if (!/^[1-9]\d{0,4}$/.test(rawPort) || Number(rawPort) > 65535) return false
  const bind = environment.API_BIND_HOST ?? '0.0.0.0'
  if (!['127.0.0.1', '0.0.0.0', '::', '::1'].includes(bind)) return false
  const loopback = bind.includes(':') ? '[::1]' : '127.0.0.1'
  try {
    const response = await fetch(`http://${loopback}:${rawPort}/api/v1/health/live`, {
      signal: AbortSignal.timeout(1500),
      redirect: 'error',
    })
    if (response.status !== 200) return false
    const result = await response.json()
    return result?.data?.status === 'live'
  } catch {
    return false
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  process.exitCode = (await containerLiveness()) ? 0 : 1
