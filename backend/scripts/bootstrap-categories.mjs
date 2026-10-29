import { loadEnvironment } from '../dist/config/env.js'
import { openDatabase } from '../dist/config/database.js'
import { categoryModel } from '../dist/modules/catalog/categories/category.model.js'
import { createDeclaredIndexes } from '../dist/shared/database/indexes.js'
import { initializeAuditPersistence } from '../dist/modules/audit/audit.persistence.js'

let connection
try {
  const config = loadEnvironment(process.env)
  if (!['local', 'test'].includes(config.APP_ENV)) throw new Error('Local/test only')
  connection = await openDatabase(config.MONGODB_URI, config.MONGODB_DB_NAME)
  await createDeclaredIndexes(categoryModel(connection))
  await initializeAuditPersistence(connection)
  console.log('Category indexes and audit persistence ready; media activation remains separate.')
} catch {
  console.error(
    'Category bootstrap failed; verify protected configuration and reviewed persistence.',
  )
  process.exitCode = 1
} finally {
  await connection?.close()
}
