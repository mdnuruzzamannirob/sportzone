import type { Request } from 'express'
import type { ClientSession } from 'mongoose'

type MediaFormat = 'png' | 'jpg' | 'webp'

type ProviderAsset = {
  publicId: string
  delivery: 'upload' | 'authenticated'
  format: MediaFormat
  size: number
  width: number
  height: number
  digest: string
}

type MediaLookup =
  | {
      kind: 'found'
      asset: ProviderAsset
    }
  | {
      kind: 'missing'
    }
  | {
      kind: 'uncertain'
    }

interface MediaProvider {
  upload(input: {
    publicId: string
    delivery: 'upload' | 'authenticated'
    file: Uint8Array
    format: MediaFormat
    digest: string
  }): Promise<MediaLookup>
  lookup(publicId: string, delivery: 'upload' | 'authenticated'): Promise<MediaLookup>
  remove(publicId: string, delivery: 'upload' | 'authenticated'): Promise<'deleted' | 'uncertain'>
  publicUrl(publicId: string, format: MediaFormat): string
  privateUrl(publicId: string, format: MediaFormat, expiresAt: Date): string
}

type MediaScanner = (bytes: Uint8Array) => Promise<'clean' | 'rejected' | 'uncertain'>

interface MediaMaintenance {
  verifyPersistence(): Promise<void>
  maintenanceBatch(
    limit?: number,
    fence?: () => Promise<void>,
  ): Promise<{
    examined: number
    deleted: number
    reconciled: number
    pending: number
    blocked: number
  }>
}

type PublicImageCandidate = {
  targetId: string
  publicId: string
  alt: string
} & (
  | {
      targetType: 'product' | 'category'
    }
  | {
      targetType: 'store_settings'
      slot: 'branding'
    }
  | {
      targetType: 'store_settings'
      slot: 'homepageBanner'
      assetId: string
    }
)

type PublicImage = { publicId: string; url: string; alt: string }
type PublicMediaReference = {
  targetType: 'product' | 'category' | 'store_settings'
  targetId: string
  slot: string
}
interface PublicMediaReferences {
  changePublicReference(
    credential: string | undefined,
    previousPublicId: string | undefined,
    image: PublicImage | null,
    reference: PublicMediaReference,
    session: ClientSession,
    mutateTarget: (image: PublicImage | null) => Promise<void>,
  ): Promise<void>
  changePublicAssetReference(
    credential: string | undefined,
    previousPublicId: string | undefined,
    assetId: string | null,
    alt: string,
    reference: PublicMediaReference,
    session: ClientSession,
    mutateTarget: (image: PublicImage | null) => Promise<void>,
  ): Promise<void>
}
type PublicMediaReader = (
  candidates: readonly PublicImageCandidate[],
) => Promise<Map<string, Map<string, { url: string; alt: string }>>>

type ClaimEvidenceMetadataAccess = (
  session: ClientSession,
  input: {
    orderId: string
    returnId: string
    claimType: 'physical_return' | 'shortage'
    items: { orderItemId: string; assetIds: string[] }[]
  },
) => Promise<
  {
    assetId: string
    orderItemId: string
    mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
    size: number
  }[]
>

type MediaFile = { name: string; mimeType: string; bytes: Uint8Array }
interface ClaimEvidenceAsset {
  assetKind: 'public_media' | 'claim_evidence'
  access: 'public' | 'private'
  orderId?: string
  claimType?: 'physical_return' | 'shortage'
  orderItemIds: string[]
  owner: { kind: 'admin' | 'customer' | 'guest_order'; principalId: string }
}
interface ClaimMediaAccess {
  privateUrl(
    credential: string | undefined,
    assetId: string,
    admin?: boolean,
  ): Promise<{ url: string }>
  verifyPersistence(): Promise<void>
  attach(
    credential: string | undefined,
    assetId: string,
    reference: { targetType: 'claim'; targetId: string; slot: string },
    session: ClientSession,
    mutateTarget: (asset: Readonly<ClaimEvidenceAsset>, session: ClientSession) => Promise<void>,
  ): Promise<void>
  uploadEvidence(
    credential: string | undefined,
    scope: { orderId: string; claimType: 'physical_return' | 'shortage'; orderItemIds: string[] },
    file: MediaFile,
  ): Promise<
    | {
        assetId: string
        orderId: string | undefined
        status: 'private'
        expiresAt: Date | null | undefined
      }
    | { assetId: string; publicId: string; url: string; mimeType: string; size: number }
  >
}

type ClaimEvidenceMultipart = (
  req: Request,
  maxBytes: number,
) => Promise<{
  file: MediaFile
  input: { claimType: FormDataEntryValue | null; orderItemIds: FormDataEntryValue[] }
}>

export type {
  ClaimEvidenceMetadataAccess,
  ClaimEvidenceMultipart,
  ClaimMediaAccess,
  MediaFile,
  MediaFormat,
  MediaLookup,
  MediaMaintenance,
  MediaProvider,
  MediaScanner,
  ProviderAsset,
  PublicImageCandidate,
  PublicMediaReader,
  PublicMediaReference,
  PublicMediaReferences,
}
