import { createConnection } from 'node:net'
import type { z } from 'zod'
import { type optionsSchema, validateClamAvOptions } from './clamav.schema.js'
export { validateClamAvOptions } from './clamav.schema.js'
import { assertOutsideTransaction } from '../../shared/database/transaction.js'
import type { MediaScanner } from '../../modules/media/media.types.js'
export function createClamAvScanner(input: z.infer<typeof optionsSchema>): MediaScanner {
  const settings = validateClamAvOptions(input)
  return async (bytes) => {
    assertOutsideTransaction()
    return new Promise((resolve) => {
      let result = Buffer.alloc(0),
        done = false
      const socket = createConnection({ host: settings.host, port: settings.port })
      const finish = (verdict: 'clean' | 'rejected' | 'uncertain') => {
        if (done) return
        done = true
        clearTimeout(deadline)
        socket.destroy()
        resolve(verdict)
      }
      const deadline = setTimeout(() => finish('uncertain'), settings.timeoutMs)
      socket.on('error', () => finish('uncertain'))
      socket.on('end', () => finish('uncertain'))
      socket.on('data', (data) => {
        result = Buffer.concat([result, data])
        if (result.length > 4096) {
          finish('uncertain')
          return
        }
        if (result.includes(0)) {
          const response = result.toString('utf8')
          finish(
            response === 'stream: OK\0'
              ? 'clean'
              : response.startsWith('stream: ') && response.endsWith(' FOUND\0')
                ? 'rejected'
                : 'uncertain',
          )
        }
      })
      socket.on('connect', () => {
        socket.write('zINSTREAM\0')
        for (let offset = 0; offset < bytes.length; offset += 65536) {
          const chunk = bytes.subarray(offset, offset + 65536),
            header = Buffer.alloc(4)
          header.writeUInt32BE(chunk.length)
          socket.write(header)
          socket.write(chunk)
        }
        socket.write(Buffer.alloc(4))
      })
    })
  }
}
