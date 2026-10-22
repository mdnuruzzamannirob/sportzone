import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import {
  integerField,
  mutableSchemaOptions,
  optionalObjectIdField,
} from '../../../shared/database/schema.js'

const categorySchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, match: /^[a-z0-9]+(?:-[a-z0-9]+)*$/ },
    parentId: optionalObjectIdField(),
    status: {
      type: String,
      enum: ['active', 'inactive'],
      required: true,
      default: 'active',
    },
    image: {
      type: new Schema(
        {
          publicId: { type: String, required: true },
          url: { type: String, required: true },
          alt: { type: String, required: true },
        },
        { _id: false, strict: 'throw' },
      ),
      default: undefined,
    },
    sortOrder: { ...integerField(), required: true, default: 0 },
    revision: { ...integerField(), required: true, default: 0 },
  },
  mutableSchemaOptions,
)
categorySchema.index({ slug: 1 }, { unique: true, name: 'category_slug_unique' })
categorySchema.index(
  { parentId: 1, status: 1, sortOrder: 1 },
  { name: 'category_parent_status_sort' },
)
categorySchema.index({ status: 1, sortOrder: 1, _id: 1 }, { name: 'category_public_sort' })
export type Category = InferSchemaType<typeof categorySchema>
export function categoryModel(connection: Connection) {
  return connection.models.Category
    ? connection.model<Category>('Category')
    : connection.model<Category>('Category', categorySchema, 'categories')
}
