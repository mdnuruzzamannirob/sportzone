import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isAbsolute } from 'node:path'

// Operator-controlled files only. Paths must come from protected configuration, never requests.
async function readProtectedFile(path: string, limit: number) {
  if (!isAbsolute(path)) throw new Error('Invalid protected path')
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const stat = await handle.stat()
    if (
      !stat.isFile() ||
      (stat.mode & 0o077) !== 0 ||
      stat.size < 1 ||
      stat.size > limit ||
      (process.getuid && stat.uid !== process.getuid())
    )
      throw new Error('Invalid protected source')
    // A bounded read also protects against a file growing after stat.
    const bytes = Buffer.alloc(limit + 1)
    let length = 0
    while (length < bytes.length) {
      const read = await handle.read(bytes, length, bytes.length - length, null)
      if (!read.bytesRead) break
      length += read.bytesRead
    }
    if (length > limit) throw new Error('Protected source too large')
    return bytes.subarray(0, length)
  } finally {
    await handle.close()
  }
}

export { readProtectedFile }
