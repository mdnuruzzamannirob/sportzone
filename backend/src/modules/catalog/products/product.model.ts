import { Schema, Types, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../../shared/database/schema.js'
import { description, slug } from './product.schema.js'
import { variantSchema } from '../variants/variant.model.js'
import { text, embedded } from '../model-fields.js'

const image = new Schema(
  {
    publicId: text(200),
    url: {
      ...text(2000),
      validate: (value: string) => {
        try {
          const url = new URL(value)
          return url.protocol === 'https:' && !url.username && !url.password
        } catch {
          return false
        }
      },
    },
    alt: text(120),
    position: { ...integerField(), required: true },
  },
  embedded,
)
const productSchema = new Schema(
  {
    name: text(120),
    slug: {
      ...text(160),
      validate: (value: string) => slug.safeParse(value).data === value,
    },
    description: {
      ...text(2000),
      validate: (value: string) => description.safeParse(value).data === value,
    },
    categoryIds: {
      type: [Schema.Types.ObjectId],
      required: true,
      default: undefined,
      validate: (values: Types.ObjectId[]) =>
        values.length > 0 &&
        values.length <= 30 &&
        values.every((value) => value instanceof Types.ObjectId) &&
        new Set(values.map((value) => value.toHexString())).size === values.length,
    },
    images: {
      type: [image],
      default: [],
      validate: (values: unknown[]) => values.length <= 12,
    },
    keywords: {
      type: [String],
      default: [],
      validate: (values: string[]) =>
        values.length <= 30 &&
        new Set(values).size === values.length &&
        values.every(
          (value) =>
            value.length > 0 && [...value].length <= 120 && value === value.trim().toLowerCase(),
        ),
    },
    status: {
      type: String,
      enum: ['draft', 'active', 'inactive'],
      required: true,
      default: 'draft',
    },
    featured: { type: Boolean, required: true, default: false },
    ratingSummary: {
      type: new Schema(
        {
          approvedCount: { ...integerField(), required: true },
          average: { type: Number, required: true, min: 0, max: 5 },
        },
        embedded,
      ),
      default: () => ({ approvedCount: 0, average: 0 }),
    },
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
productSchema.index({ slug: 1 }, { unique: true, name: 'product_slug_unique' })
productSchema.index(
  { status: 1, categoryIds: 1, createdAt: -1 },
  { name: 'product_status_categories_created' },
)
productSchema.index(
  { status: 1, featured: 1, createdAt: -1 },
  { name: 'product_status_featured_created' },
)

export type Product = InferSchemaType<typeof productSchema>
export type ProductVariant = InferSchemaType<typeof variantSchema>
export function productModels(connection: Connection) {
  return {
    products: connection.models.Product
      ? connection.model<Product>('Product')
      : connection.model<Product>('Product', productSchema, 'products'),
    variants: connection.models.ProductVariant
      ? connection.model<ProductVariant>('ProductVariant')
      : connection.model<ProductVariant>('ProductVariant', variantSchema, 'productVariants'),
  }
}
