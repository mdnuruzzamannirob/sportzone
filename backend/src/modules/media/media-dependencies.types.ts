import type { ClientSession } from 'mongoose'
import type { MediaPolicy } from '../../config/media.js'
import type { MediaAsset } from './media.model.js'
import type { MediaAccess, MediaProvider, MediaScanner } from './media.types.js'

export type MediaDependencies = {
  provider: MediaProvider
  scanner: MediaScanner
  policy: MediaPolicy
  canDelete(asset: Readonly<MediaAsset>, session: ClientSession): Promise<boolean>
  evidence?: MediaAccess['evidence']
}
