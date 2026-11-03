import type { ClientSession, Types } from 'mongoose'
import type {
  MediaFile,
  MediaFormat,
  MediaLookup,
  MediaProvider,
  MediaScanner,
  ProviderAsset,
} from './media.public.js'

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

interface MediaAccess {
  admin(credential: string | undefined, transaction: ClientSession): Promise<MediaOwner>
  evidence(
    credential: string | undefined,
    scope: EvidenceScope,
    transaction: ClientSession,
  ): Promise<MediaOwner>
}

export type {
  EvidenceScope,
  MediaAccess,
  MediaFile,
  MediaFormat,
  MediaLookup,
  MediaOwner,
  MediaProvider,
  MediaReference,
  MediaScanner,
  ProviderAsset,
}
