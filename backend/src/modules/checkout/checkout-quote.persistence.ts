import type { Connection } from 'mongoose'
import { createDeclaredIndexes, verifyDeclaredIndexes } from '../../shared/database/indexes.js'
import { checkoutQuoteModel } from './checkout-quote.model.js'

async function initializeCheckoutQuotePersistence(connection: Connection) {
  await createDeclaredIndexes(checkoutQuoteModel(connection))
}

async function verifyCheckoutQuotePersistence(connection: Connection) {
  await verifyDeclaredIndexes(checkoutQuoteModel(connection))
}

export { initializeCheckoutQuotePersistence, verifyCheckoutQuotePersistence }
