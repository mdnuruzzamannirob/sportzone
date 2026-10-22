import type { Connection } from 'mongoose'
import { isDeepStrictEqual } from 'node:util'
import { verifyDeclaredIndexes } from '../../db/indexes.js'
import { productModels } from './product.model.js'

type Shape = Record<string, unknown>
const integer = {
  bsonType: ['int', 'long', 'double'],
  minimum: 0,
  maximum: Number.MAX_SAFE_INTEGER,
  multipleOf: 1,
}
const text = (maxLength: number): Shape => ({
  bsonType: 'string',
  minLength: 1,
  maxLength,
})
const object = (properties: Shape, required: string[]): Shape => ({
  bsonType: 'object',
  additionalProperties: false,
  properties,
  required,
})
const base = {
  _id: { bsonType: 'objectId' },
  createdAt: { bsonType: 'date' },
  updatedAt: { bsonType: 'date' },
}
const requiredBase = ['_id', 'createdAt', 'updatedAt']
const productValidator = {
  $jsonSchema: object(
    {
      ...base,
      name: text(120),
      slug: { ...text(160), pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$' },
      description: text(2000),
      categoryIds: {
        bsonType: 'array',
        minItems: 1,
        maxItems: 30,
        uniqueItems: true,
        items: { bsonType: 'objectId' },
      },
      images: {
        bsonType: 'array',
        maxItems: 12,
        items: object(
          {
            publicId: text(200),
            url: { ...text(2000), pattern: '^https://' },
            alt: text(120),
            position: integer,
          },
          ['publicId', 'url', 'alt', 'position'],
        ),
      },
      keywords: {
        bsonType: 'array',
        maxItems: 30,
        uniqueItems: true,
        items: text(120),
      },
      status: { enum: ['draft', 'active', 'inactive'] },
      featured: { bsonType: 'bool' },
      ratingSummary: object(
        {
          approvedCount: integer,
          average: {
            bsonType: ['int', 'long', 'double'],
            minimum: 0,
            maximum: 5,
          },
        },
        ['approvedCount', 'average'],
      ),
      revision: integer,
    },
    [
      ...requiredBase,
      'name',
      'slug',
      'description',
      'categoryIds',
      'images',
      'keywords',
      'status',
      'featured',
      'ratingSummary',
      'revision',
    ],
  ),
}
const variantValidator = {
  $and: [
    {
      $jsonSchema: object(
        {
          ...base,
          productId: { bsonType: 'objectId' },
          skuNormalized: {
            ...text(64),
            pattern: '^[A-Z0-9]+(?:[._-][A-Z0-9]+)*$',
          },
          attributes: {
            bsonType: 'object',
            maxProperties: 30,
            additionalProperties: text(120),
          },
          attributeSignature: text(40000),
          regularPricePoisha: integer,
          salePricePoisha: integer,
          lowStockThreshold: integer,
          status: { enum: ['active', 'inactive'] },
          revision: integer,
          stock: object(
            { physical: integer, reserved: integer, committed: integer },
            ['physical', 'reserved', 'committed'],
          ),
        },
        [
          ...requiredBase,
          'productId',
          'skuNormalized',
          'attributes',
          'attributeSignature',
          'regularPricePoisha',
          'status',
          'stock',
          'revision',
        ],
      ),
    },
    {
      $expr: {
        $and: [
          {
            $lte: [
              '$stock.reserved',
              { $subtract: ['$stock.physical', '$stock.committed'] },
            ],
          },
          {
            $lte: [
              { $ifNull: ['$salePricePoisha', '$regularPricePoisha'] },
              '$regularPricePoisha',
            ],
          },
        ],
      },
    },
  ],
}
export const productCollectionValidators = {
  products: productValidator,
  productVariants: variantValidator,
}

// Explicit additive bootstrap only. Never alter an existing validator or drop an index.
export async function initializeProductPersistence(connection: Connection) {
  if (!connection.db) throw new Error('Product database is unavailable.')
  for (const [name, validator] of Object.entries(productCollectionValidators)) {
    const existing = await connection.db
      .listCollections({ name }, { nameOnly: false })
      .next()
    if (existing) {
      if (
        !isDeepStrictEqual(existing.options?.validator, validator) ||
        existing.options?.validationLevel !== 'strict' ||
        existing.options?.validationAction !== 'error'
      )
        throw new Error('Product collection requires a reviewed migration.')
    } else {
      await connection.db.createCollection(name, {
        validator,
        validationLevel: 'strict',
        validationAction: 'error',
      })
    }
  }
  const models = productModels(connection)
  for (const model of [models.products, models.variants]) {
    await model.createIndexes()
    await verifyDeclaredIndexes(model)
  }
}
