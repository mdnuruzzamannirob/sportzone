import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { checkoutQuoteModel } from './checkout-quote.model.js'
export async function initializeCheckoutQuotePersistence(connection: Connection) {
  await createDeclaredIndexes(checkoutQuoteModel(connection))
}
export async function verifyCheckoutQuotePersistence(connection: Connection) {
  await verifyDeclaredIndexes(checkoutQuoteModel(connection))
}
