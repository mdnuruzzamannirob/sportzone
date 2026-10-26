import { loadDeliveryDeadlinePolicy } from '../dist/config/delivery.js'
import { createDeliveryDeadlineService } from '../dist/modules/orders/delivery-deadline.service.js'
try {
  const manifest = await loadDeliveryDeadlinePolicy(process.env)
  const result = createDeliveryDeadlineService(manifest).preview()
  console.log(JSON.stringify({ event: 'delivery_deadline_preflight', ...result }))
  if (result.status === 'under_review') process.exitCode = 1
} catch {
  console.error(
    'Delivery deadline preflight failed; verify protected rule and independent approval evidence.',
  )
  process.exitCode = 1
}
