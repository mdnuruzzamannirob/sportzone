import { Schema } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../../shared/database/schema.js'
import { attributeSignature, attributes, sku } from './variant.schema.js'
import { text, embedded } from '../model-fields.js'

const stock = new Schema(
  {
    physical: { ...integerField(), required: true, default: 0 },
    reserved: { ...integerField(), required: true, default: 0 },
    committed: { ...integerField(), required: true, default: 0 },
  },
  embedded,
)
export const variantSchema = new Schema(
  {
    productId: { type: Schema.Types.ObjectId, required: true },
    skuNormalized: {
      ...text(64),
      validate: (value: string) => sku.safeParse(value).data === value,
    },
    attributes: { type: Map, of: String, required: true, default: () => ({}) },
    attributeSignature: text(40000),
    regularPricePoisha: { ...integerField(), required: true },
    salePricePoisha: { ...integerField(), default: undefined },
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
    stock: {
      type: stock,
      required: true,
      default: () => ({ physical: 0, reserved: 0, committed: 0 }),
    },
    revision: { ...integerField(), required: true, default: 0 },
    lowStockThreshold: { ...integerField(), default: undefined },
  },
  mutableSchemaOptions,
)
variantSchema.pre('validate', function () {
  const options = Object.fromEntries(this.attributes ?? [])
  const parsed = attributes.safeParse(options)
  if (
    !parsed.success ||
    attributeSignature(parsed.data) !== attributeSignature(options) ||
    this.attributeSignature !== attributeSignature(options)
  )
    this.invalidate('attributes', 'Noncanonical variant attributes')
  if (this.salePricePoisha != null && this.salePricePoisha > this.regularPricePoisha)
    this.invalidate('salePricePoisha', 'Sale exceeds regular price')
  if (this.stock && this.stock.reserved > this.stock.physical - this.stock.committed)
    this.invalidate('stock', 'Invalid available stock')
})
variantSchema.index({ skuNormalized: 1 }, { unique: true, name: 'variant_sku_unique' })
variantSchema.index({ productId: 1, status: 1 }, { name: 'variant_product_status' })
variantSchema.index(
  { productId: 1, attributeSignature: 1 },
  { unique: true, name: 'variant_product_signature_unique' },
)
