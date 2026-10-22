import { Types, type Connection, type PipelineStage } from 'mongoose'
import { ApiError } from '../../shared/errors/app-error.js'
import { parseInput } from '../../shared/middleware/validate.js'
import { pageMeta } from '../../shared/pagination.js'
import { verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { productModels } from './products/product.model.js'
import { categoryModel } from './categories/category.model.js'
import {
  categoryCard,
  categoryQuery,
  categorySlug,
  productCard,
  productQuery,
} from './catalog.schema.js'
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
const offers: LookupPipeline = [
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
      const image = approved.get(row.id)
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
            ...(input.category
              ? {
                  $or: [
                    { '_categories.slug': input.category },
                    { '_categories._ancestors.slug': input.category },
                  ],
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
        {
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
        },
        facet(input.page, input.pageSize),
      ]
      const result = await run(pipeline, 'product')
      return {
        data: await projectMedia(result.rows, 'product'),
        page: pageMeta(input, result.total[0]?.count ?? 0),
      }
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
