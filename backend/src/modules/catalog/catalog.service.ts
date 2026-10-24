import { Types, type ClientSession, type Connection, type PipelineStage } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { description as descriptionInput } from './products/product.schema.js'
import { productModels } from './products/product.model.js'
import { categoryModel } from './categories/category.model.js'
import {
  categoryCard,
  categoryQuery,
  categorySlug,
  productCard,
  productQuery,
  productDetail,
} from './catalog.schema.js'
import { attributes, attributeSignature } from './variants/variant.schema.js'
import type { publicMediaService, PublicImageCandidate } from '../media/public-media.service.js'

// A parent is singular. Reaching an active root proves the chain terminated; cycles/orphans
// and ancestry beyond the bounded traversal cannot become public through a partial chain.
type LookupPipeline = NonNullable<PipelineStage.Lookup['$lookup']['pipeline']>
const ancestry: LookupPipeline = [
  { $match: { status: 'active' } },
  {
    $graphLookup: {
      from: 'categories',
      startWith: '$parentId',
      connectFromField: 'parentId',
      connectToField: '_id',
      as: '_ancestors',
      maxDepth: 63,
    },
  },
  {
    $match: {
      $expr: {
        $and: [
          { $not: [{ $in: ['$_id', '$_ancestors._id'] }] },
          {
            $allElementsTrue: [
              { $map: { input: '$_ancestors', as: 'a', in: { $eq: ['$$a.status', 'active'] } } },
            ],
          },
          {
            $or: [
              { $eq: [{ $type: '$parentId' }, 'missing'] },
              {
                $anyElementTrue: [
                  {
                    $map: {
                      input: '$_ancestors',
                      as: 'a',
                      in: { $eq: [{ $type: '$$a.parentId' }, 'missing'] },
                    },
                  },
                ],
              },
            ],
          },
        ],
      },
    },
  },
]
const validNumber = (path: string) => [
  { $isNumber: path },
  { $gte: [path, 0] },
  { $lte: [path, Number.MAX_SAFE_INTEGER] },
  { $eq: [{ $mod: [path, 1] }, 0] },
]
const validVariants: LookupPipeline = [
  {
    $match: {
      status: 'active',
      $expr: {
        $and: [
          ...[
            '$regularPricePoisha',
            '$stock.physical',
            '$stock.reserved',
            '$stock.committed',
          ].flatMap(validNumber),
          { $lte: ['$stock.reserved', { $subtract: ['$stock.physical', '$stock.committed'] }] },
          {
            $or: [
              { $eq: [{ $type: '$salePricePoisha' }, 'missing'] },
              {
                $and: [
                  ...validNumber('$salePricePoisha'),
                  { $lte: ['$salePricePoisha', '$regularPricePoisha'] },
                ],
              },
            ],
          },
        ],
      },
    },
  },
  {
    $set: {
      _effective: { $ifNull: ['$salePricePoisha', '$regularPricePoisha'] },
      _available: {
        $subtract: [{ $subtract: ['$stock.physical', '$stock.reserved'] }, '$stock.committed'],
      },
    },
  },
]
const offers: LookupPipeline = [
  ...validVariants,
  { $sort: { _effective: 1, _id: 1 } },
  {
    $group: {
      _id: null,
      regular: { $first: '$regularPricePoisha' },
      effective: { $first: '$_effective' },
      inStock: { $max: { $gt: ['$_available', 0] } },
    },
  },
]
const visibleProducts = (category?: string): LookupPipeline => [
  {
    $lookup: {
      from: 'categories',
      localField: 'categoryIds',
      foreignField: '_id',
      pipeline: ancestry,
      as: '_categories',
    },
  },
  {
    $match: {
      $expr: {
        $and: [
          { $gt: [{ $size: '$categoryIds' }, 0] },
          { $eq: [{ $size: '$_categories' }, { $size: '$categoryIds' }] },
        ],
      },
      ...(category
        ? {
            $or: [{ '_categories.slug': category }, { '_categories._ancestors.slug': category }],
          }
        : {}),
    },
  },
  {
    $lookup: {
      from: 'productVariants',
      localField: '_id',
      foreignField: 'productId',
      pipeline: offers,
      as: '_offer',
    },
  },
  { $unwind: '$_offer' },
]
const cardProjection: PipelineStage.Project = {
  $project: {
    _id: 0,
    id: { $toString: '$_id' },
    name: 1,
    slug: 1,
    regularPricePoisha: '$_offer.regular',
    effectivePricePoisha: '$_offer.effective',
    availability: { $cond: ['$_offer.inStock', 'available', 'unavailable'] },
    _image: {
      $arrayElemAt: [{ $sortArray: { input: '$images', sortBy: { position: 1 } } }, 0],
    },
    rating: {
      $cond: [
        {
          $and: [
            { $gt: ['$ratingSummary.approvedCount', 0] },
            { $gte: ['$ratingSummary.average', 1] },
            { $lte: ['$ratingSummary.average', 5] },
          ],
        },
        { average: '$ratingSummary.average', count: '$ratingSummary.approvedCount' },
        '$$REMOVE',
      ],
    },
  },
}
const facet = (page: number, pageSize: number): PipelineStage => ({
  $facet: {
    rows: [{ $skip: (page - 1) * pageSize }, { $limit: pageSize }],
    total: [{ $count: 'count' }],
  },
})
type Row = {
  id: string
  name: string
  slug: string
  parentId?: string
  regularPricePoisha: number
  effectivePricePoisha: number
  availability: 'available' | 'unavailable'
  rating?: { average: number; count: number }
  _image?: { publicId: string; alt: string }
}
type Result = { rows: Row[]; total: { count: number }[] }
export function catalogService(
  connection: Connection,
  images: ReturnType<typeof publicMediaService>,
) {
  const models = productModels(connection),
    categories = categoryModel(connection)
  async function verify(kind: 'product' | 'category') {
    try {
      await verifyDeclaredIndexes(categories)
      if (kind === 'product') {
        await verifyDeclaredIndexes(models.products)
        await verifyDeclaredIndexes(models.variants)
      }
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  async function projectMedia(rows: Row[], kind: 'product' | 'category') {
    const candidates: PublicImageCandidate[] = rows.flatMap((row) =>
      row._image
        ? [
            {
              targetId: new Types.ObjectId(row.id),
              targetType: kind,
              publicId: row._image.publicId,
              alt: row._image.alt,
            },
          ]
        : [],
    )
    const approved = await images(candidates)
    return rows.map(({ _image, ...row }) => {
      const image = _image ? approved.get(row.id)?.get(_image.publicId) : undefined
      return kind === 'product'
        ? productCard.parse({ ...row, ...(image ? { thumbnail: image } : {}) })
        : categoryCard.parse({ ...row, ...(image ? { image } : {}) })
    })
  }
  async function run(pipeline: PipelineStage[], kind: 'product' | 'category') {
    try {
      const result =
        kind === 'product'
          ? await models.products
              .aggregate<Result>(pipeline)
              .option({ maxTimeMS: 3000, allowDiskUse: false })
          : await categories
              .aggregate<Result>(pipeline)
              .option({ maxTimeMS: 3000, allowDiskUse: false })
      return result[0] ?? { rows: [], total: [] }
    } catch {
      throw new ApiError('SERVICE_UNAVAILABLE')
    }
  }
  return {
    async cartSelections(ids: readonly string[], session?: ClientSession) {
      if (ids.length > 100 || ids.some((id) => !/^[a-f0-9]{24}$/.test(id)))
        throw new ApiError('VALIDATION_FAILED')
      type Selection = {
        variantId: string
        availableQty: number
        estimatedUnitPoisha: number
        product: import('zod').infer<typeof productCard>
      }
      if (!ids.length) return new Map<string, Omit<Selection, 'variantId'>>()
      await verify('product')
      const rows = await models.variants
        .aggregate<Selection>([
          { $match: { _id: { $in: ids.map((id) => new Types.ObjectId(id)) } } },
          ...validVariants,
          {
            $lookup: {
              from: 'products',
              localField: 'productId',
              foreignField: '_id',
              pipeline: [{ $match: { status: 'active' } }, ...visibleProducts()],
              as: '_product',
            },
          },
          { $unwind: '$_product' },
          {
            $project: {
              _id: 0,
              variantId: { $toString: '$_id' },
              availableQty: '$_available',
              estimatedUnitPoisha: '$_effective',
              product: {
                id: { $toString: '$_product._id' },
                name: '$_product.name',
                slug: '$_product.slug',
                regularPricePoisha: '$regularPricePoisha',
                effectivePricePoisha: '$_effective',
                availability: { $cond: [{ $gt: ['$_available', 0] }, 'available', 'unavailable'] },
              },
            },
          },
        ])
        .session(session ?? null)
        .option({ maxTimeMS: 3000, allowDiskUse: false })
      return new Map(
        rows.map((row) => [
          row.variantId,
          {
            availableQty: row.availableQty,
            estimatedUnitPoisha: row.estimatedUnitPoisha,
            product: productCard.parse(row.product),
          },
        ]),
      )
    },
    async products(query: unknown) {
      const input = parseInput(productQuery, query)
      await verify('product')
      const pipeline: PipelineStage[] = [
        {
          $match: {
            status: 'active',
            ...(input.q ? { $text: { $search: input.q, $language: 'none' } } : {}),
          },
        },
        ...(input.sort === 'newest'
          ? [{ $sort: { createdAt: -1 as const, _id: -1 as const } }]
          : []),
        ...visibleProducts(input.category),
        {
          $match: {
            ...(input.inStock !== undefined ? { '_offer.inStock': input.inStock } : {}),
            ...(input.minPricePoisha !== undefined || input.maxPricePoisha !== undefined
              ? {
                  '_offer.effective': {
                    ...(input.minPricePoisha !== undefined ? { $gte: input.minPricePoisha } : {}),
                    ...(input.maxPricePoisha !== undefined ? { $lte: input.maxPricePoisha } : {}),
                  },
                }
              : {}),
          },
        },
        ...(input.sort === 'newest'
          ? []
          : [
              {
                $sort: {
                  '_offer.effective': input.sort === 'price_asc' ? (1 as const) : (-1 as const),
                  _id: 1 as const,
                },
              },
            ]),
        cardProjection,
        facet(input.page, input.pageSize),
      ]
      const result = await run(pipeline, 'product')
      return {
        data: await projectMedia(result.rows, 'product'),
        page: pageMeta(input, result.total[0]?.count ?? 0),
      }
    },
    async product(slug: string) {
      const input = parseInput(categorySlug, { slug })
      await verify('product')
      type DetailRow = Row & {
        description: string
        categoryIds: Types.ObjectId[]
        _categories: { id: string; name: string; slug: string; parentId?: string }[]
        _images: { publicId: string; alt: string; position: number }[]
        _variants: {
          id: string
          sku: string
          attributes: Record<string, string>
          regularPricePoisha: number
          effectivePricePoisha: number
          availableQty: number
          _signature: string
        }[]
      }
      const detailPipeline: PipelineStage[] = [
        { $match: { slug: input.slug, status: 'active' } },
        ...visibleProducts(),
        {
          $lookup: {
            from: 'productVariants',
            localField: '_id',
            foreignField: 'productId',
            pipeline: [
              ...validVariants,
              { $sort: { _id: 1 } },
              { $limit: 101 },
              {
                $project: {
                  _id: 0,
                  id: { $toString: '$_id' },
                  sku: '$skuNormalized',
                  attributes: 1,
                  regularPricePoisha: 1,
                  effectivePricePoisha: '$_effective',
                  availableQty: '$_available',
                  _signature: '$attributeSignature',
                },
              },
            ],
            as: '_variants',
          },
        },
        {
          $project: {
            ...cardProjection.$project,
            description: 1,
            categoryIds: 1,
            _images: { $sortArray: { input: '$images', sortBy: { position: 1 } } },
            _variants: 1,
            _categories: {
              $map: {
                input: '$_categories',
                as: 'c',
                in: {
                  id: { $toString: '$$c._id' },
                  name: '$$c.name',
                  slug: '$$c.slug',
                  parentId: {
                    $cond: [
                      { $eq: [{ $type: '$$c.parentId' }, 'objectId'] },
                      { $toString: '$$c.parentId' },
                      '$$REMOVE',
                    ],
                  },
                },
              },
            },
          },
        },
      ]
      const [row] = await models.products
        .aggregate<DetailRow>(detailPipeline)
        .option({ maxTimeMS: 3000, allowDiskUse: false })
        .catch(() => {
          throw new ApiError('SERVICE_UNAVAILABLE')
        })
      if (!row) throw new ApiError('NOT_FOUND')
      if (row._images.length > 12 || row._variants.length > 100 || row._categories.length > 30)
        throw new ApiError('SERVICE_UNAVAILABLE')
      if (!descriptionInput.safeParse(row.description).success)
        throw new ApiError('SERVICE_UNAVAILABLE')
      const variants = row._variants.map(({ _signature, ...variant }) => {
        const parsed = attributes.safeParse(variant.attributes)
        if (!parsed.success || attributeSignature(parsed.data) !== _signature)
          throw new ApiError('SERVICE_UNAVAILABLE')
        return { ...variant, attributes: parsed.data }
      })
      const approved = await images(
        row._images.map((image) => ({
          targetId: new Types.ObjectId(row.id),
          targetType: 'product',
          publicId: image.publicId,
          alt: image.alt,
        })),
      )
      const gallery = row._images.flatMap((image) => {
        const value = approved.get(row.id)?.get(image.publicId)
        return value ? [value] : []
      })
      const related = await models.products
        .aggregate<Row>([
          {
            $match: {
              _id: { $ne: new Types.ObjectId(row.id) },
              status: 'active',
              categoryIds: { $in: row.categoryIds },
            },
          },
          { $sort: { createdAt: -1, _id: -1 } },
          ...visibleProducts(),
          { $limit: 6 },
          cardProjection,
        ])
        .option({ maxTimeMS: 3000, allowDiskUse: false })
        .catch(() => {
          throw new ApiError('SERVICE_UNAVAILABLE')
        })
      const detail = productDetail.safeParse({
        id: row.id,
        name: row.name,
        slug: row.slug,
        regularPricePoisha: row.regularPricePoisha,
        effectivePricePoisha: row.effectivePricePoisha,
        availability: row.availability,
        ...(row.rating ? { rating: row.rating } : {}),
        ...(gallery[0] ? { thumbnail: gallery[0] } : {}),
        description: row.description,
        categories: row._categories,
        images: gallery,
        variants,
        relatedProducts: await projectMedia(related, 'product'),
      })
      if (!detail.success) throw new ApiError('SERVICE_UNAVAILABLE')
      return detail.data
    },
    async categories(query: unknown) {
      const input = parseInput(categoryQuery, query)
      await verify('category')
      const result = await run(
        [
          { $match: { status: 'active' } },
          { $sort: { sortOrder: 1, _id: 1 } },
          ...ancestry,
          ...(input.parent
            ? [
                {
                  $lookup: {
                    from: 'categories',
                    localField: 'parentId',
                    foreignField: '_id',
                    as: '_parent',
                  },
                },
                { $match: { '_parent.slug': input.parent } },
              ]
            : []),
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: 1,
              slug: 1,
              parentId: {
                $cond: [
                  { $eq: [{ $type: '$parentId' }, 'objectId'] },
                  { $toString: '$parentId' },
                  '$$REMOVE',
                ],
              },
              _image: '$image',
            },
          },
          facet(input.page, input.pageSize),
        ],
        'category',
      )
      return {
        data: await projectMedia(result.rows, 'category'),
        page: pageMeta(input, result.total[0]?.count ?? 0),
      }
    },
    async category(slug: string) {
      const input = parseInput(categorySlug, { slug })
      await verify('category')
      const result = await run(
        [
          { $match: { slug: input.slug } },
          ...ancestry,
          {
            $project: {
              _id: 0,
              id: { $toString: '$_id' },
              name: 1,
              slug: 1,
              parentId: {
                $cond: [
                  { $eq: [{ $type: '$parentId' }, 'objectId'] },
                  { $toString: '$parentId' },
                  '$$REMOVE',
                ],
              },
              _image: '$image',
            },
          },
          facet(1, 1),
        ],
        'category',
      )
      if (!result.rows.length) throw new ApiError('NOT_FOUND')
      return (await projectMedia(result.rows, 'category'))[0]
    },
  }
}
