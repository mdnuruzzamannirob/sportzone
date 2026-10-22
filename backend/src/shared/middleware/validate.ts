import type { Request, RequestHandler, Response } from 'express'
import type { z } from 'zod'
import { ApiError } from '../errors/app-error.js'

export function parseInput<T extends z.ZodType>(schema: T, input: unknown): z.output<T> {
  const result = schema.safeParse(input)
  if (!result.success)
    throw new ApiError(
      'VALIDATION_FAILED',
      result.error.issues.slice(0, 20).map((issue) => ({
        field:
          issue.path
            .map((part, index) =>
              typeof part === 'number' ? `[${part}]` : `${index === 0 ? '' : '.'}${String(part)}`,
            )
            .join('')
            .slice(0, 128) || 'request',
        code: issue.code.toUpperCase(),
      })),
    )
  return result.data
}

// Express 5 forwards async rejection. Never overwrite its read-only query getter.
export function validate<T extends z.ZodType>(
  schema: T,
  source: 'body' | 'params' | 'query',
  controller: (input: z.output<T>, req: Request, res: Response) => void | Promise<void>,
): RequestHandler {
  return async (req, res) => {
    await controller(parseInput(schema, req[source]), req, res)
  }
}
