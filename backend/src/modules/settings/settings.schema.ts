import { z } from 'zod'
import { policyType } from './policy.schema.js'
const text = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max)
    .refine(
      (v) =>
        !/[<>]/.test(v) && [...v].every((c) => c.charCodeAt(0) >= 32 && c.charCodeAt(0) !== 127),
    )
export const settingsInteger = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)
const id = z.string().regex(/^[a-f0-9]{24}$/)
export const contactInfo = z
  .strictObject({
    email: z.email().max(254).optional(),
    phone: z
      .string()
      .regex(/^\+8801[3-9]\d{8}$/)
      .optional(),
    website: z
      .url()
      .max(2000)
      .refine((v) => {
        const u = new URL(v)
        return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
      })
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0)
export const storeAddress = z.strictObject({
  line1: text(300),
  line2: text(300).optional(),
  area: text(120),
  district: text(120),
  postalCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
})
export const mediaRef = z.strictObject({
  publicId: z.string().regex(/^sportzone\/[a-f0-9]{24}$/),
  url: z
    .url()
    .max(2000)
    .refine((v) => {
      const u = new URL(v)
      return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash
    }),
  alt: text(120),
})
export const bannerInput = z.strictObject({
  assetId: id,
  title: text(120),
  alt: text(120),
  href: z
    .string()
    .max(2000)
    .refine(
      (v) =>
        /^\/(?!\/)/.test(v) &&
        !/[\\\s]/.test(v) &&
        [...v].every((c) => c.charCodeAt(0) >= 32) &&
        new URL(v, 'https://store.invalid').origin === 'https://store.invalid',
    )
    .optional(),
})
export const paymentChannels = z.strictObject({
  bkashEnabled: z.boolean(),
  nagadEnabled: z.boolean(),
  rocketEnabled: z.boolean(),
  codEnabled: z.boolean(),
})
export const settingsPatch = z
  .strictObject({
    storeName: text(120).optional(),
    branding: mediaRef.optional(),
    contact: contactInfo.optional(),
    complaintContact: contactInfo.optional(),
    address: storeAddress.optional(),
    homepageBanner: bannerInput.nullable().optional(),
    lowStockThreshold: settingsInteger.optional(),
    paymentChannels: paymentChannels
      .partial()
      .refine((v) => Object.keys(v).length > 0)
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0)
export const settingsView = z.strictObject({
  key: z.literal('primary'),
  storeName: text(120).optional(),
  branding: mediaRef.optional(),
  contact: contactInfo.optional(),
  complaintContact: contactInfo.optional(),
  address: storeAddress.optional(),
  homepageBanner: bannerInput.extend({ image: mediaRef }).optional(),
  lowStockThreshold: settingsInteger,
  paymentChannels,
  activePolicyVersions: z.partialRecord(policyType, z.string().min(1).max(100)),
  revision: settingsInteger,
  updatedBy: id.optional(),
})
export const publicContact = z.strictObject({
  contact: contactInfo.optional(),
  complaintContact: contactInfo.optional(),
})

export const publicHomeSettings = publicContact.extend({
  storeName: text(120).optional(),
  branding: mediaRef.optional(),
  banner: bannerInput.extend({ image: mediaRef }).optional(),
})
