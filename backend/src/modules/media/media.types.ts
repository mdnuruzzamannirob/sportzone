import type { ClientSession, Types } from 'mongoose'

type MediaOwner = {
  kind: 'admin' | 'customer' | 'guest_order'
  principalId: Types.ObjectId
}

type EvidenceScope = {
  orderId: Types.ObjectId
  claimType: 'physical_return' | 'shortage'
  orderItemIds: Types.ObjectId[]
}

type MediaReference = {
  targetType: 'product' | 'category' | 'store_settings' | 'claim'
  targetId: Types.ObjectId
  slot: string
}

type MediaFile = {
  name: string
  mimeType: string
  bytes: Uint8Array
}

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

interface MediaAccess {
  admin(credential: string | undefined, transaction: ClientSession): Promise<MediaOwner>
  evidence(
    credential: string | undefined,
    scope: EvidenceScope,
    transaction: ClientSession,
  ): Promise<MediaOwner>
}

type MediaScanner = (bytes: Uint8Array) => Promise<'clean' | 'rejected' | 'uncertain'>

export type {
  MediaOwner,
  EvidenceScope,
  MediaReference,
  MediaFile,
  MediaFormat,
  ProviderAsset,
  MediaLookup,
  MediaProvider,
  MediaAccess,
  MediaScanner,
}
