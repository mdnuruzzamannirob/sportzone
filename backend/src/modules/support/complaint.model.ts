import { Schema, type Connection, type InferSchemaType } from 'mongoose'
import { integerField, mutableSchemaOptions } from '../../shared/database/schema.js'
import { ApiError } from '../../shared/errors/app-error.js'
const embedded = { _id: false, strict: 'throw' } as const
const schema = new Schema(
  {
    orderId: { type: Schema.Types.ObjectId, required: true, immutable: true },
    userId: { type: Schema.Types.ObjectId, immutable: true },
    contact: {
      type: new Schema(
        {
          name: {
            type: String,
            required: true,
            validate: (value: string) => [...value].length <= 120,
          },
          emailNormalized: { type: String, required: true, maxlength: 254 },
          phone: { type: String, maxlength: 32 },
        },
        embedded,
      ),
      required: true,
      immutable: true,
      select: false,
    },
    issue: { type: String, required: true, immutable: true, maxlength: 2000, select: false },
    status: { type: String, enum: ['open', 'in_review', 'resolved', 'closed'], required: true },
    resolution: { type: String, maxlength: 2000 },
    respondedAt: Date,
    resolvedAt: Date,
    assignedTo: Schema.Types.ObjectId,
    contactHistory: {
      type: [
        new Schema(
          {
            at: { type: Date, required: true },
            outcome: { type: String, required: true, maxlength: 2000 },
          },
          embedded,
        ),
      ],
      required: true,
    },
    revision: { ...integerField(), required: true },
  },
  mutableSchemaOptions,
)
schema.index({ status: 1, createdAt: -1 }, { name: 'complaint_status_history' })
schema.index({ orderId: 1, createdAt: -1, _id: -1 }, { name: 'complaint_order_history' })
schema.pre('save', function () {
  if (!this.isNew) throw new ApiError('STATE_CONFLICT')
})
schema.pre(
  ['deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne', 'findOneAndReplace'],
  () => {
    throw new ApiError('STATE_CONFLICT')
  },
)
type Complaint = InferSchemaType<typeof schema>
export function complaintModel(connection: Connection) {
  return connection.models.Complaint
    ? connection.model<Complaint>('Complaint')
    : connection.model<Complaint>('Complaint', schema, 'complaints')
}

schema.pre('deleteOne', { document: true, query: false }, () => {
  throw new ApiError('STATE_CONFLICT')
})
schema.pre(['updateOne', 'updateMany', 'findOneAndUpdate'], function () {
  const filter = this.getFilter(),
    update = this.getUpdate()
  if (
    !Number.isSafeInteger(filter.revision) ||
    !['open', 'in_review', 'resolved'].includes(filter.status) ||
    !update ||
    Array.isArray(update)
  )
    throw new ApiError('STATE_CONFLICT')
  for (const [op, fields] of Object.entries(update)) {
    if (!['$set', '$inc'].includes(op) || !fields || typeof fields !== 'object')
      throw new ApiError('STATE_CONFLICT')
    for (const path of Object.keys(fields))
      if (
        !(op === '$inc'
          ? path === 'revision'
          : [
              'status',
              'resolution',
              'respondedAt',
              'resolvedAt',
              'assignedTo',
              'contactHistory',
              'updatedAt',
            ].includes(path))
      )
        throw new ApiError('STATE_CONFLICT')
  }
})
