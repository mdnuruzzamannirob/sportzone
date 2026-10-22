import { z } from 'zod'

export const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .refine((value) => [...value].length <= max)
export const money = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
