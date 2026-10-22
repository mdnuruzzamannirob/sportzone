import type { ClientSession, Types } from 'mongoose'
export type MediaOwner = { kind: 'admin' | 'customer' | 'guest_order'; principalId: Types.ObjectId }
export type EvidenceScope = {
  orderId: Types.ObjectId
  claimType: 'physical_return' | 'shortage'
  orderItemIds: Types.ObjectId[]
}
export type MediaReference = {
  targetType: 'product' | 'category' | 'store_settings' | 'claim'
  targetId: Types.ObjectId
  slot: string
}
export type MediaFile = { name: string; mimeType: string; bytes: Uint8Array }
export type MediaFormat = 'png' | 'jpg' | 'webp'
export type ProviderAsset = {
  publicId: string
  delivery: 'upload' | 'authenticated'
  format: MediaFormat
  size: number
  width: number
  height: number
  digest: string
}
export type MediaLookup =
  | { kind: 'found'; asset: ProviderAsset }
  | { kind: 'missing' }
  | { kind: 'uncertain' }
export interface MediaProvider {
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
export interface MediaAccess {
  admin(credential: string | undefined, transaction: ClientSession): Promise<MediaOwner>
  evidence(
    credential: string | undefined,
    scope: EvidenceScope,
    transaction: ClientSession,
  ): Promise<MediaOwner>
}
export type MediaScanner = (bytes: Uint8Array) => Promise<'clean' | 'rejected' | 'uncertain'>
