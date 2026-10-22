import { timingSafeEqual } from 'node:crypto'
export type HealthDependencies = {
  monitorToken?: string
  isReady: () => Promise<boolean>
}
export function createHealthService({ monitorToken, isReady }: HealthDependencies) {
  const expected =
    monitorToken && /^[a-f0-9]{64}$/.test(monitorToken)
      ? Buffer.from(monitorToken, 'hex')
      : undefined
  return {
    authorized(header: string | undefined) {
      const token = /^Bearer ([a-f0-9]{64})$/.exec(header ?? '')?.[1]
      return !!expected && !!token && timingSafeEqual(expected, Buffer.from(token, 'hex'))
    },
    async ready() {
      try {
        return (await isReady()) === true
      } catch {
        return false
      }
    },
  }
}
