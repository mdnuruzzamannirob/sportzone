import { z } from 'zod'
import { paginationSchema } from '../../shared/pagination.js'

const policyType = z.enum([
  'shipping',
  'cancellation',
  'returns',
  'refunds',
  'privacy',
  'terms',
  'complaints',
])

const policyStatus = z.enum([
  'draft',
  'approved',
  'scheduled',
  'published',
  'superseded',
  'withdrawn',
])

// Plain text only; future consumers must render text rather than interpret HTML.
const policyContent = z
  .string()
  .trim()
  .min(1)
  .max(50000)
  .refine(
    (value) =>
      !/<[^>]*>/.test(value) &&
      [...value].every((char) => char.charCodeAt(0) >= 32 || ['\n', '\r', '\t'].includes(char)),
  )

const date = z.iso.datetime({ offset: true })

const policyDraftInput = z.strictObject({
  type: policyType,
  content: policyContent,
  proposedEffectiveAt: date.optional(),
})

const policyDraftPatch = policyDraftInput
  .omit({ type: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0)

const policyParams = z.strictObject({ policyId: z.string().regex(/^[a-f0-9]{24}$/) })

const policyListQuery = paginationSchema.safeExtend({
  type: policyType.optional(),
  status: policyStatus.optional(),
})

const policyDocument = z.strictObject({
  id: policyParams.shape.policyId,
  type: policyType,
  version: z.string().min(1).max(100),
  status: policyStatus,
  content: policyContent,
  contentDigest: z.string().regex(/^[a-f0-9]{64}$/),
  revision: z.int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  effectiveAt: date.optional(),
  approvalEvidenceRef: z.string().min(1).max(2000).optional(),
  approvedAt: date.optional(),
  publishedAt: date.optional(),
})

const policySummary = policyDocument.pick({
  id: true,
  type: true,
  version: true,
  status: true,
  effectiveAt: true,
  revision: true,
})

const policyCreated = z.strictObject({
  policyId: policyParams.shape.policyId,
  version: policyDocument.shape.version,
  status: z.literal('draft'),
  revision: policyDocument.shape.revision,
})

const reason = z.string().trim().min(1).max(2000)

const policyApprove = z.strictObject({
  approvalEvidenceRef: z.string().trim().min(1).max(2000),
  reason,
})

const policyPublish = z.strictObject({ effectiveAt: date, reason })

const policyPublication = z.strictObject({
  version: policyDocument.shape.version,
  effectiveAt: date,
  status: z.enum(['scheduled', 'published']),
})

const policyPublic = policyDocument
  .pick({ version: true, content: true, effectiveAt: true })
  .required()

const policyKey = z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/)

const publicPolicyLink = z
  .strictObject({
    type: policyType,
    version: z.string().min(1).max(100),
    href: z.string(),
  })
  .refine((value) => value.href === `/api/v1/storefront/policies/${value.type}`)

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

const settingsInteger = z.int().nonnegative().max(Number.MAX_SAFE_INTEGER)

const id = z.string().regex(/^[a-f0-9]{24}$/)

const contactInfo = z
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

const storeAddress = z.strictObject({
  line1: text(300),
  line2: text(300).optional(),
  area: text(120),
  district: text(120),
  postalCode: z
    .string()
    .regex(/^\d{4}$/)
    .optional(),
})

const mediaRef = z.strictObject({
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

const bannerInput = z.strictObject({
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

const paymentChannels = z.strictObject({
  bkashEnabled: z.boolean(),
  nagadEnabled: z.boolean(),
  rocketEnabled: z.boolean(),
  codEnabled: z.boolean(),
})

const settingsPatch = z
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

const settingsView = z.strictObject({
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

const publicContact = z.strictObject({
  contact: contactInfo.optional(),
  complaintContact: contactInfo.optional(),
})

const publicHomeSettings = publicContact.extend({
  storeName: text(120).optional(),
  branding: mediaRef.optional(),
  banner: bannerInput.extend({ image: mediaRef }).optional(),
})

export {
  bannerInput,
  contactInfo,
  mediaRef,
  paymentChannels,
  policyApprove,
  policyContent,
  policyCreated,
  policyDocument,
  policyDraftInput,
  policyDraftPatch,
  policyKey,
  policyListQuery,
  policyParams,
  policyPublic,
  policyPublication,
  policyPublish,
  policyStatus,
  policySummary,
  policyType,
  publicContact,
  publicHomeSettings,
  publicPolicyLink,
  settingsInteger,
  settingsPatch,
  settingsView,
  storeAddress,
}
