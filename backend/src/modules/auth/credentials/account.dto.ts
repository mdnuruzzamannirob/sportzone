import type { IdentityModels } from '../auth.model.js'
type User = InstanceType<IdentityModels['users']>
type Address = User['addresses'][number]
export function addressDto(address: Address) {
  return {
    id: address.id.toHexString(),
    recipient: address.recipient,
    phone: address.phone,
    districtKey: address.districtKey,
    areaKey: address.areaKey,
    street: address.street,
    ...(address.addressLine2 ? { addressLine2: address.addressLine2 } : {}),
    isDefault: address.isDefault,
  }
}
export function accountDto(user: User) {
  return {
    id: user._id.toHexString(),
    name: user.name,
    email: user.emailNormalized,
    ...(user.phone ? { phone: user.phone } : {}),
    emailVerified: Boolean(user.emailVerifiedAt),
    addresses: user.addresses.map(addressDto),
    status: user.status,
  }
}
